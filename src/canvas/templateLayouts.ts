import { Canvas, Control, FabricImage, Point, Rect, Shadow, util } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Slide, ScreenshotImage, ScreenshotStyle, ScreenshotCrop } from '../types/project'
import { EDITOR_CANVAS_WIDTH, DEVICE_SPECS, frameSpecOf } from '../constants/deviceSpecs'
import { renderBackground } from './objects/background'
import { renderBadge } from './objects/badge'
import { renderCaption } from './objects/caption'
import { renderDeviceFrame, type ScreenBounds } from './objects/deviceFrame'
import { renderHighlight } from './objects/highlight'
import { renderOrnament } from './objects/ornament'
import { LAYER_NAMES } from './layerNames'
import { loadImageObjectUrl, type ImageUrlResolver } from '../lib/imageStore'

function getCanvasHeight(slide: Slide): number {
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  return Math.round(
    (EDITOR_CANVAS_WIDTH / spec.exportWidth) * spec.exportHeight,
  )
}

// Base device width as a fraction of canvas width. App Store marketing
// screenshots typically have the device taking up the majority of the frame —
// 0.6 left the phone looking small. Per-template overrides still apply
// (split/hero-bleed use their own widths). User scale is layered on top inside
// getDeviceLayout so every template scales consistently.
const DEVICE_WIDTH_RATIO = 0.78

export function getDeviceDimensions(slide: Slide, canvasWidth: number): { w: number; h: number } {
  const spec = frameSpecOf(slide.deviceFrame)
  const w = canvasWidth * DEVICE_WIDTH_RATIO
  const h = Math.round((w / spec.exportWidth) * spec.exportHeight)
  return { w, h }
}

// Rotate a point around a pivot in canvas (y-down) space. Positive degrees =
// clockwise, matching Fabric's `angle`. Exported so FabricCanvas's sync can
// re-derive the body's rotated base anchor at the angle the user dragged to.
export function rotateAround(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = x - cx
  const dy = y - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

// Tilt a top-left-origin object about an external pivot: spin it on its own
// origin (angle) and swing that origin around the pivot so the whole device +
// screenshot composition rotates as one unit.
function rotateObjectAround(obj: FabricObject, cx: number, cy: number, deg: number): void {
  if (!deg) return
  const p = rotateAround(obj.left ?? 0, obj.top ?? 0, cx, cy, deg)
  obj.set({ left: p.x, top: p.y, angle: deg })
}

export const DEFAULT_SHOT_STYLE: ScreenshotStyle = { cornerRadiusRatio: 0.06, shadow: true }

function effectiveShotStyle(slide: Slide): ScreenshotStyle {
  return slide.screenshotStyle ?? DEFAULT_SHOT_STYLE
}

/**
 * Trim a screen box by per-edge fractions. Used by the floating screenshot's
 * clip mask and its drag handle so both shrink to the same visible card.
 */
export function cropScreenBounds(bounds: ScreenBounds, crop?: ScreenshotCrop): ScreenBounds {
  if (!crop) return bounds
  return {
    left: bounds.left + bounds.width * crop.left,
    top: bounds.top + bounds.height * crop.top,
    width: Math.max(0, bounds.width * (1 - crop.left - crop.right)),
    height: Math.max(0, bounds.height * (1 - crop.top - crop.bottom)),
    rx: bounds.rx,
  }
}

export type CropEdge = 'top' | 'right' | 'bottom' | 'left'

// Per-edge ceiling shared with the panel sliders; 0.45 + 0.45 still leaves 10%
// of the card, so no pairwise min-size guard is needed.
const CROP_EDGE_MAX = 0.45

/**
 * New crop fractions after dragging one edge of the floating-card handle to a
 * pointer position in the handle's local plane (center origin, unrotated
 * units). Pure — cropEdgeAction applies the result to the handle + clip.
 */
export function trimCrop(
  edge: CropEdge,
  local: { x: number; y: number },
  crop: ScreenshotCrop,
  full: { w: number; h: number },
  size: { w: number; h: number },
): ScreenshotCrop {
  const clampEdge = (v: number) => Math.min(CROP_EDGE_MAX, Math.max(0, v))
  switch (edge) {
    case 'left':
      return { ...crop, left: clampEdge(crop.left + (local.x + size.w / 2) / full.w) }
    case 'right':
      return { ...crop, right: clampEdge(crop.right + (size.w / 2 - local.x) / full.w) }
    case 'top':
      return { ...crop, top: clampEdge(crop.top + (local.y + size.h / 2) / full.h) }
    case 'bottom':
      return { ...crop, bottom: clampEdge(crop.bottom + (size.h / 2 - local.y) / full.h) }
  }
}

// Crop state the floating handle carries so the edge controls (and the sync
// code) can work without closures — these survive history snapshots, so an
// undo restores the old crop through the same read path as a live drag.
export interface CropHandleProps {
  _crop?: ScreenshotCrop
  _fullW?: number
  _fullH?: number
}

function cropEdgeAction(edge: CropEdge, target: FabricObject, px: number, py: number): boolean {
  const t = target as FabricObject & CropHandleProps
  const crop = t._crop
  const fullW = t._fullW
  const fullH = t._fullH
  if (!crop || !fullW || !fullH) return false
  const local = util.sendPointToPlane(new Point(px, py), undefined, target.calcTransformMatrix())
  const next = trimCrop(edge, local, crop, { w: fullW, h: fullH }, { w: target.width ?? 0, h: target.height ?? 0 })
  const dL = (next.left - crop.left) * fullW
  const dT = (next.top - crop.top) * fullH
  if (!dL && !dT && next.right === crop.right && next.bottom === crop.bottom) return false
  // The top-left anchor moves along the handle's rotated axes when the left/top
  // edge is the one being trimmed; right/bottom trims keep it fixed.
  const rad = ((target.angle ?? 0) * Math.PI) / 180
  const geo = {
    left: (target.left ?? 0) + dL * Math.cos(rad) - dT * Math.sin(rad),
    top: (target.top ?? 0) + dL * Math.sin(rad) + dT * Math.cos(rad),
    width: fullW * (1 - next.left - next.right),
    height: fullH * (1 - next.top - next.bottom),
  }
  target.set(geo)
  target.setCoords()
  t._crop = next
  // Mirror the geometry onto the screenshot's absolutely-positioned clip so the
  // trim is visible mid-drag. The image itself doesn't move — only the mask.
  const canvas = target.canvas
  if (canvas) {
    for (const obj of canvas.getObjects()) {
      if ((obj as FabricObject & { layerName?: string }).layerName !== LAYER_NAMES.SCREENSHOT) continue
      const clip = (obj as FabricObject & { clipPath?: FabricObject }).clipPath
      if (clip) clip.set(geo)
      // The clip isn't part of the object's transform, so the image's cache
      // doesn't know it changed — invalidate it explicitly.
      obj.dirty = true
      break
    }
  }
  return true
}

const CROP_CONTROLS: Array<{ key: string; edge: CropEdge; x: number; y: number; cursor: string }> = [
  { key: 'cropT', edge: 'top', x: 0, y: -0.5, cursor: 'ns-resize' },
  { key: 'cropB', edge: 'bottom', x: 0, y: 0.5, cursor: 'ns-resize' },
  { key: 'cropL', edge: 'left', x: -0.5, y: 0, cursor: 'ew-resize' },
  { key: 'cropR', edge: 'right', x: 0.5, y: 0, cursor: 'ew-resize' },
]

/**
 * Edge-trim controls for the floating handle. Reads _crop/_fullW/_fullH off
 * the body, so FabricCanvas can re-attach after an undo/redo loadFromJSON
 * (Fabric doesn't serialize controls).
 */
export function attachCropControls(body: FabricObject): void {
  const controls: Record<string, Control> = { ...body.controls }
  for (const { key, edge, x, y, cursor } of CROP_CONTROLS) {
    controls[key] = new Control({
      x,
      y,
      cursorStyle: cursor,
      actionName: 'cropping',
      actionHandler: (_e, transform, px, py) => cropEdgeAction(edge, transform.target, px, py),
    })
  }
  body.controls = controls
}

async function renderScreenshotLayer(
  canvas: Canvas,
  screenshot: ScreenshotImage,
  bounds: ScreenBounds,
  resolveUrl: ImageUrlResolver,
  opts?: { withShadow?: boolean; clip?: ScreenBounds; rotation?: number; pivot?: { x: number; y: number } },
): Promise<void> {
  const url = await resolveUrl(screenshot.imageKey)
  if (!url) return

  const img = await FabricImage.fromURL(url)

  const { originalWidth: srcW, originalHeight: srcH } = screenshot
  const imgScale = Math.max(bounds.width / srcW, bounds.height / srcH)
  const scaledW = srcW * imgScale
  const scaledH = srcH * imgScale

  img.set({
    left: bounds.left + (bounds.width - scaledW) / 2,
    top: bounds.top + (bounds.height - scaledH) / 2,
    scaleX: imgScale,
    scaleY: imgScale,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })

  const clip = opts?.clip ?? bounds
  img.clipPath = new Rect({
    left: clip.left,
    top: clip.top,
    width: clip.width,
    height: clip.height,
    rx: clip.rx,
    ry: clip.rx,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
  })

  if (opts?.withShadow) {
    // 캔버스 폭에 비례한 부드러운 그림자 — 떠 있는 카드 느낌.
    img.shadow = new Shadow({
      color: 'rgba(15, 23, 42, 0.28)',
      blur: Math.max(12, bounds.width * 0.05),
      offsetX: 0,
      offsetY: Math.max(8, bounds.width * 0.03),
      affectStroke: false,
      nonScaling: true,
    })
  }

  // Tilt the image and its absolutely-positioned clip about the device center
  // so the rounded mask stays glued to the rotated screenshot.
  if (opts?.rotation && opts.pivot) {
    rotateObjectAround(img, opts.pivot.x, opts.pivot.y, opts.rotation)
    if (img.clipPath) rotateObjectAround(img.clipPath as unknown as FabricObject, opts.pivot.x, opts.pivot.y, opts.rotation)
  }

  ;(img as FabricImage & { layerName: string }).layerName = LAYER_NAMES.SCREENSHOT
  canvas.add(img)
}

interface DeviceLayout {
  centerX: number
  top: number
  width: number
  height: number
  rx: number
}

/**
 * Layout for the screenshot/device area. Returns a layout for **every** non-hero
 * template, even when deviceFrame.show is false — that way the floating
 * screenshot still has a place to live.
 */
export function getDeviceLayout(
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
  spanCentered = false,
  canvasScale = 1,
): DeviceLayout | null {
  const { offsetX = 0, offsetY = 0, scale = 1 } = slide.deviceFrame
  let baseW: number
  let centerX: number
  let topMode: 'fixed' | 'vcenter'
  let topFixed = 0
  if (slide.template === 'text-top') {
    baseW = device.w; centerX = cw / 2; topMode = 'fixed'; topFixed = ch * 0.30
  } else if (slide.template === 'text-bottom') {
    baseW = device.w; centerX = cw / 2; topMode = 'fixed'; topFixed = ch * 0.05
  } else if (slide.template === 'split') {
    baseW = cw * 0.45; centerX = cw * 0.76; topMode = 'vcenter'
  } else if (slide.template === 'hero-bleed') {
    baseW = cw * 0.75; centerX = cw * 0.7; topMode = 'fixed'; topFixed = ch * 0.28
  } else {
    return null
  }
  // In a 2-page span the device should straddle the seam (canvas center)
  // regardless of the template's single-slide horizontal bias, otherwise
  // off-center templates (split, hero-bleed) push the device onto one page.
  if (spanCentered) centerX = cw / 2
  const width = baseW * scale
  const height = Math.round((width / device.w) * device.h)
  const top = topMode === 'vcenter' ? (ch - height) / 2 : topFixed
  // rx must scale with the rendered device width, not the canvas width —
  // otherwise templates that shrink the device (split, hero-bleed) get
  // exaggerated corner radii that don't match the device's real proportions.
  const spec = frameSpecOf(slide.deviceFrame)
  const rx = Math.round((spec.cornerRadius * width) / spec.exportWidth)
  // offsetX/offsetY are stored in editor-canvas pixels (EDITOR_CANVAS_WIDTH).
  // Scale them to the current canvas so a dragged device lands in the same
  // proportional spot at full export resolution as it does in the editor.
  return { centerX: centerX + offsetX * canvasScale, top: top + offsetY * canvasScale, width, height, rx }
}

function heroScreenBounds(cw: number, ch: number): ScreenBounds {
  return { left: 0, top: 0, width: cw, height: ch, rx: 0 }
}

function deviceScreenBounds(layout: DeviceLayout, slide: Slide): ScreenBounds {
  const { screen } = renderDeviceFrame(slide.deviceFrame, {
    left: layout.centerX,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    rx: layout.rx,
  })
  return screen
}

/**
 * Floating-screenshot bounds (no device chrome): use the full device-layout
 * footprint as the screenshot box, with the slide's chosen corner-radius
 * ratio. Returns an extra "fullLayout" for use by the move handler.
 */
function floatingScreenBounds(layout: DeviceLayout, style: ScreenshotStyle): ScreenBounds {
  return {
    left: layout.centerX - layout.width / 2,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    rx: layout.width * style.cornerRadiusRatio,
  }
}

export async function applyTemplate(
  canvas: Canvas,
  slide: Slide,
  dims?: { width: number; height: number },
  opts?: { spanCentered?: boolean; resolveUrl?: ImageUrlResolver },
): Promise<void> {
  canvas.clear()

  // Default to a one-shot loader if no scoped resolver is supplied. Long-lived
  // callers (the editor) MUST pass a cache-backed resolver so repeated renders
  // don't leak a blob URL per render.
  const resolveUrl = opts?.resolveUrl ?? loadImageObjectUrl

  const cw = dims?.width ?? EDITOR_CANVAS_WIDTH
  const ch = dims?.height ?? getCanvasHeight(slide)
  const spanCentered = opts?.spanCentered ?? false
  // Font/constant scale vs the editor's base width. A span canvas is two device
  // widths wide, so its per-device scale is based on the half-width — matching
  // renderSpanGroup's font scale. Absolute layout constants (text gap, fit-to-box
  // floor) are multiplied by this so the layout is identical in proportion at the
  // editor's 440px and at full export resolution.
  const scale = (spanCentered ? cw / 2 : cw) / EDITOR_CANVAS_WIDTH

  canvas.setDimensions({ width: cw, height: ch })

  const { template } = slide
  const device = getDeviceDimensions(slide, cw)
  const deviceLayout = getDeviceLayout(slide, cw, ch, device, spanCentered, scale)

  // 1. Background
  for (const obj of await renderBackground(cw, ch, slide.background, resolveUrl)) {
    canvas.add(obj)
  }

  // 2. Ornaments (above bg, below content). 우리가 화면 어디서든 dragging 할 수 있도록 selectable로 둔다.
  if (slide.ornaments) {
    for (const orn of slide.ornaments) {
      const obj = renderOrnament(orn, { canvasWidth: cw, canvasHeight: ch })
      if (obj) canvas.add(obj)
    }
  }

  // 3. Screenshot — device-inset if frame is shown, floating w/ shadow otherwise.
  // Hoist screenBounds so highlights below can sample the same region.
  let screenBounds: ScreenBounds | null = null
  if (slide.screenshot) {
    const shotStyle = effectiveShotStyle(slide)
    if (template === 'hero') {
      screenBounds = heroScreenBounds(cw, ch)
    } else if (deviceLayout) {
      screenBounds = slide.deviceFrame.show
        ? deviceScreenBounds(deviceLayout, slide)
        : floatingScreenBounds(deviceLayout, shotStyle)
    }
    if (screenBounds) {
      const floating = template !== 'hero' && !slide.deviceFrame.show
      // Rotation only applies where there's a device footprint to pivot around;
      // hero's full-bleed shot has no center to tilt about.
      const rotation = deviceLayout ? (slide.deviceFrame.rotation ?? 0) : 0
      const pivot = deviceLayout
        ? { x: deviceLayout.centerX, y: deviceLayout.top + deviceLayout.height / 2 }
        : undefined
      await renderScreenshotLayer(canvas, slide.screenshot, screenBounds, resolveUrl, {
        withShadow: floating && shotStyle.shadow,
        clip: floating ? cropScreenBounds(screenBounds, shotStyle.crop) : undefined,
        rotation,
        pivot,
      })
    }
  }

  // 4. Text + device frame border
  if (template === 'hero') {
    applyHero(canvas, slide, cw, ch, scale)
  } else if (template === 'hero-bleed') {
    applyHeroBleed(canvas, slide, cw, ch, deviceLayout, scale)
  } else if (template === 'text-top') {
    applyTextTop(canvas, slide, cw, ch, deviceLayout, scale)
  } else if (template === 'text-bottom') {
    applyTextBottom(canvas, slide, cw, ch, deviceLayout, scale)
  } else if (template === 'split') {
    applySplit(canvas, slide, cw, ch, deviceLayout, scale)
  }

  // 5. Highlights — magnified pop-out cards. Rendered after the device so they
  // can float above the bezel, but before the badge so the badge stays the
  // top-most attention element.
  if (slide.highlights && slide.highlights.length > 0 && slide.screenshot && screenBounds) {
    for (const h of slide.highlights) {
      const { source, popup } = await renderHighlight(h, {
        canvasWidth: cw,
        canvasHeight: ch,
        screenBounds,
        screenshot: slide.screenshot,
        resolveUrl,
      })
      if (source) canvas.add(source)
      if (popup) canvas.add(popup)
    }
  }

  // 6. Badges (always on top)
  for (const badge of slide.badges ?? []) {
    const badgeCenterX = cw * (badge.left ?? 0.5)
    canvas.add(renderBadge(badge, { centerX: badgeCenterX, top: ch * badge.top }))
  }

  canvas.renderAll()
}

export function addTextBlocks(
  canvas: Canvas,
  slide: Slide,
  opts: {
    cw: number
    ch: number
    headlineCenterX: number
    headlineTop: number
    width: number
    align?: 'left' | 'center' | 'right'
    gap?: number
    scale: number
  },
): void {
  const align = opts.align ?? 'center'
  const gap = (opts.gap ?? 12) * opts.scale

  // A caption with a user-dragged `pos` overrides the template anchor (absolute,
  // does NOT advance the stack); the stored fractions are denormalized against
  // the current canvas so the same placement holds in the editor and at full
  // export resolution. A caption without `pos` stacks from cursorTop.
  let cursorTop = opts.headlineTop
  slide.texts.forEach((caption, i) => {
    const absolute = !!caption.pos
    const centerX = absolute ? caption.pos!.x * opts.cw : opts.headlineCenterX
    const top = absolute ? caption.pos!.y * opts.ch : cursorTop
    const width = caption.boxWidth != null ? Math.min(caption.boxWidth, 1) * opts.cw : opts.width
    const obj = renderCaption(caption, {
      left: centerX,
      top,
      width,
      layerName: LAYER_NAMES.TEXT,
      textIndex: i,
      scale: opts.scale,
    })
    // The caption's own textAlign is the source of truth (the panel sets it, and
    // a layout switch seeds it with TEMPLATE_TEXT_ALIGN). Fall back to the
    // layout default only if a caption somehow has none.
    const effectiveAlign = caption.style.textAlign ?? align
    obj.set('textAlign', effectiveAlign)
    if (effectiveAlign === 'left') obj.set({ originX: 'left', left: centerX - width / 2 })
    else if (effectiveAlign === 'right') obj.set({ originX: 'right', left: centerX + width / 2 })
    canvas.add(obj)
    if (!absolute) cursorTop = top + obj.height + gap
  })
}

function applyHero(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  scale: number,
): void {
  addTextBlocks(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.42,
    width: cw * 0.85,
    scale,
  })
}

function addDeviceFrame(
  canvas: Canvas,
  slide: Slide,
  layout: DeviceLayout | null,
  scale = 1,
): void {
  if (!layout) return
  // Frame hidden → the floating screenshot itself is non-evented, so add an
  // invisible rect over the device footprint as the drag/scale handle. It goes
  // through the same body setup (anchor, controls, rotation) as the frame body,
  // so move/scale sync works identically in both rendering modes. No screenshot
  // and no frame → nothing visible to move; skip the handle entirely.
  if (!slide.deviceFrame.show && !slide.screenshot) return
  // Floating crop shrinks the handle to the visible card; the same shift is
  // applied to _baseLeft/_baseTop below so syncToZustand's delta stays exactly
  // the user's drag offset.
  const shotCrop = slide.deviceFrame.show ? undefined : effectiveShotStyle(slide).crop
  const handle = cropScreenBounds(
    {
      left: layout.centerX - layout.width / 2,
      top: layout.top,
      width: layout.width,
      height: layout.height,
      rx: 0,
    },
    shotCrop,
  )
  const paths: FabricObject[] = slide.deviceFrame.show
    ? renderDeviceFrame(slide.deviceFrame, {
        left: layout.centerX,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        rx: layout.rx,
      }).paths
    : [
        Object.assign(
          new Rect({
            left: handle.left,
            top: handle.top,
            width: handle.width,
            height: handle.height,
            fill: 'transparent',
            strokeWidth: 0,
            // Fabric 7 defaults to center origin; the body anchor/sync math is
            // all top-left based, so pin it like every other object here.
            originX: 'left',
            originY: 'top',
          }),
          { layerName: LAYER_NAMES.DEVICE_FRAME },
        ),
      ]
  // The body's offset-free position, derived from the actual layout minus the
  // user's drag offset. Deriving it this way (rather than from a separately
  // computed anchor) keeps syncToZustand's `body.left - _baseLeft` exactly equal
  // to offsetX/offsetY for every template and scale — including vertically
  // centered templates whose anchor would otherwise use the unscaled device
  // height and inject a vertical jump on drag-release.
  // layout.centerX/top already bake in offsetX/offsetY * scale, so recover the
  // offset-free anchor by subtracting the same scaled offset.
  const { offsetX = 0, offsetY = 0 } = slide.deviceFrame
  const cropDx = shotCrop ? layout.width * shotCrop.left : 0
  const cropDy = shotCrop ? layout.height * shotCrop.top : 0
  const baseLeft = (layout.centerX - offsetX * scale) - layout.width / 2 + cropDx
  const baseTop = layout.top - offsetY * scale + cropDy
  const angle = slide.deviceFrame.rotation ?? 0
  const pivotX = layout.centerX
  const pivotY = layout.top + layout.height / 2
  // Offset-free pivot, used to store the body's _baseLeft/_baseTop already
  // rotated — that keeps syncToZustand's `body.left - _baseLeft` capturing only
  // the user's drag offset even when the device is tilted.
  const basePivotX = layout.centerX - offsetX * scale
  const basePivotY = baseTop + layout.height / 2
  paths.forEach((obj, i) => {
    if (i === 0) {
      obj.set({
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        borderColor: '#6366F1',
        cornerColor: '#6366F1',
        hoverCursor: 'move',
        lockRotation: false,
        lockSkewingX: true,
        lockSkewingY: true,
        lockUniScaling: true,
        centeredScaling: true,
        // Gentle magnetism at the cardinal/diagonal angles so a hand-rotated
        // device is easy to square back up.
        snapAngle: 45,
        snapThreshold: 4,
      })
      // Corner handles scale, mtr rotates; standard middle handles stay hidden
      // (they'd break aspect) — floating mode replaces them with crop controls.
      obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false, mtr: true })
      const base = angle ? rotateAround(baseLeft, baseTop, basePivotX, basePivotY, angle) : { x: baseLeft, y: baseTop }
      Object.assign(obj, {
        _baseLeft: base.x,
        _baseTop: base.y,
        // Unrotated anchors so syncToZustand can re-derive the base at whatever
        // angle an mtr drag ends on (the pre-rotated _baseLeft/_baseTop only
        // hold for the angle this render used).
        _baseRawLeft: baseLeft,
        _baseRawTop: baseTop,
        _basePivotX: basePivotX,
        _basePivotY: basePivotY,
      })
      if (!slide.deviceFrame.show) {
        Object.assign(obj, {
          _crop: { top: 0, right: 0, bottom: 0, left: 0, ...shotCrop },
          _fullW: layout.width,
          _fullH: layout.height,
        })
        attachCropControls(obj)
      }
    }
    rotateObjectAround(obj, pivotX, pivotY, angle)
    canvas.add(obj)
  })
}

function applyTextTop(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  scale: number,
): void {
  addTextBlocks(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.05,
    width: cw * 0.85,
    gap: 8,
    scale,
  })
  addDeviceFrame(canvas, slide, layout, scale)
}

function applyTextBottom(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  scale: number,
): void {
  addDeviceFrame(canvas, slide, layout, scale)
  addTextBlocks(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.74,
    width: cw * 0.85,
    gap: 8,
    scale,
  })
}

function applySplit(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  scale: number,
): void {
  addTextBlocks(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw * 0.21,
    headlineTop: ch * 0.32,
    width: cw * 0.37,
    align: 'left',
    gap: 10,
    scale,
  })
  addDeviceFrame(canvas, slide, layout, scale)
}

/**
 * Hero-bleed: bold stacked text top-left, image extending to bottom-right
 * (with intentional bleed off the right edge if the screenshot is wide).
 */
function applyHeroBleed(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  scale: number,
): void {
  addTextBlocks(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw * 0.25,
    headlineTop: ch * 0.06,
    width: cw * 0.46,
    align: 'left',
    gap: 10,
    scale,
  })
  addDeviceFrame(canvas, slide, layout, scale)
}
