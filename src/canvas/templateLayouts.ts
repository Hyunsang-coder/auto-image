import { Canvas, FabricImage, Rect, Shadow } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Slide, ScreenshotImage, ScreenshotStyle } from '../types/project'
import { EDITOR_CANVAS_WIDTH, DEVICE_SPECS } from '../constants/deviceSpecs'
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
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  const w = canvasWidth * DEVICE_WIDTH_RATIO
  const h = Math.round((w / spec.exportWidth) * spec.exportHeight)
  return { w, h }
}

// Rotate a point around a pivot in canvas (y-down) space. Positive degrees =
// clockwise, matching Fabric's `angle`.
function rotateAround(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
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

const DEFAULT_SHOT_STYLE: ScreenshotStyle = { cornerRadiusRatio: 0.06, shadow: true }

function effectiveShotStyle(slide: Slide): ScreenshotStyle {
  return slide.screenshotStyle ?? DEFAULT_SHOT_STYLE
}

async function renderScreenshotLayer(
  canvas: Canvas,
  screenshot: ScreenshotImage,
  bounds: ScreenBounds,
  resolveUrl: ImageUrlResolver,
  opts?: { withShadow?: boolean; rotation?: number; pivot?: { x: number; y: number } },
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

  img.clipPath = new Rect({
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    rx: bounds.rx,
    ry: bounds.rx,
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
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  const rx = Math.round((spec.cornerRadius * width) / spec.exportWidth)
  return { centerX: centerX + offsetX, top: top + offsetY, width, height, rx }
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

  canvas.setDimensions({ width: cw, height: ch })

  const { template } = slide
  const device = getDeviceDimensions(slide, cw)
  const deviceLayout = getDeviceLayout(slide, cw, ch, device, spanCentered)

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
        rotation,
        pivot,
      })
    }
  }

  // 4. Text + device frame border
  if (template === 'hero') {
    applyHero(canvas, slide, cw, ch)
  } else if (template === 'hero-bleed') {
    applyHeroBleed(canvas, slide, cw, ch, deviceLayout)
  } else if (template === 'text-top') {
    applyTextTop(canvas, slide, cw, ch, deviceLayout)
  } else if (template === 'text-bottom') {
    applyTextBottom(canvas, slide, cw, ch, deviceLayout)
  } else if (template === 'split') {
    applySplit(canvas, slide, cw, ch, deviceLayout)
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

function addHeadlineAndSubheadline(
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
  },
): void {
  const align = opts.align ?? 'center'

  // A caption with a user-dragged `pos` overrides the template anchor; the
  // stored fractions are denormalized against the current canvas so the same
  // placement holds in the editor and at full export resolution.
  const place = (
    caption: typeof slide.headline,
    layerName: typeof LAYER_NAMES.HEADLINE | typeof LAYER_NAMES.SUBHEADLINE,
    defaultCenterX: number,
    defaultTop: number,
  ) => {
    const centerX = caption.pos ? caption.pos.x * opts.cw : defaultCenterX
    const top = caption.pos ? caption.pos.y * opts.ch : defaultTop
    const width = caption.boxWidth != null ? caption.boxWidth * opts.cw : opts.width
    const obj = renderCaption(caption, { left: centerX, top, width, layerName })
    // The caption's own textAlign is the source of truth (the panel sets it, and
    // a layout switch seeds it with TEMPLATE_TEXT_ALIGN). Fall back to the
    // layout default only if a caption somehow has none.
    const effectiveAlign = caption.style.textAlign ?? align
    obj.set('textAlign', effectiveAlign)
    if (effectiveAlign === 'left') obj.set({ originX: 'left', left: centerX - width / 2 })
    else if (effectiveAlign === 'right') obj.set({ originX: 'right', left: centerX + width / 2 })
    canvas.add(obj)
    return obj
  }

  const headline = place(slide.headline, LAYER_NAMES.HEADLINE, opts.headlineCenterX, opts.headlineTop)
  const subTop = opts.headlineTop + headline.height + (opts.gap ?? 12)
  place(slide.subheadline, LAYER_NAMES.SUBHEADLINE, opts.headlineCenterX, subTop)
}

function applyHero(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.42,
    width: cw * 0.85,
  })
}

function addDeviceFrame(
  canvas: Canvas,
  slide: Slide,
  layout: DeviceLayout | null,
): void {
  if (!layout || !slide.deviceFrame.show) return
  const { paths } = renderDeviceFrame(slide.deviceFrame, {
    left: layout.centerX,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    rx: layout.rx,
  })
  // The body's offset-free position, derived from the actual layout minus the
  // user's drag offset. Deriving it this way (rather than from a separately
  // computed anchor) keeps syncToZustand's `body.left - _baseLeft` exactly equal
  // to offsetX/offsetY for every template and scale — including vertically
  // centered templates whose anchor would otherwise use the unscaled device
  // height and inject a vertical jump on drag-release.
  const { offsetX = 0, offsetY = 0 } = slide.deviceFrame
  const baseLeft = (layout.centerX - offsetX) - layout.width / 2
  const baseTop = layout.top - offsetY
  const angle = slide.deviceFrame.rotation ?? 0
  const pivotX = layout.centerX
  const pivotY = layout.top + layout.height / 2
  // Offset-free pivot, used to store the body's _baseLeft/_baseTop already
  // rotated — that keeps syncToZustand's `body.left - _baseLeft` capturing only
  // the user's drag offset even when the device is tilted.
  const basePivotX = layout.centerX - offsetX
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
        lockRotation: true,
        lockSkewingX: true,
        lockSkewingY: true,
        lockUniScaling: true,
        centeredScaling: true,
      })
      // Only corner handles — middle handles would let the user break aspect.
      obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false, mtr: false })
      const base = angle ? rotateAround(baseLeft, baseTop, basePivotX, basePivotY, angle) : { x: baseLeft, y: baseTop }
      ;(obj as typeof obj & { _baseLeft?: number; _baseTop?: number })._baseLeft = base.x
      ;(obj as typeof obj & { _baseLeft?: number; _baseTop?: number })._baseTop = base.y
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
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.05,
    width: cw * 0.85,
    gap: 8,
  })
  addDeviceFrame(canvas, slide, layout)
}

function applyTextBottom(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
): void {
  addDeviceFrame(canvas, slide, layout)
  addHeadlineAndSubheadline(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.74,
    width: cw * 0.85,
    gap: 8,
  })
}

function applySplit(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw * 0.21,
    headlineTop: ch * 0.32,
    width: cw * 0.37,
    align: 'left',
    gap: 10,
  })
  addDeviceFrame(canvas, slide, layout)
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
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    cw,
    ch,
    headlineCenterX: cw * 0.25,
    headlineTop: ch * 0.06,
    width: cw * 0.46,
    align: 'left',
    gap: 10,
  })
  addDeviceFrame(canvas, slide, layout)
}
