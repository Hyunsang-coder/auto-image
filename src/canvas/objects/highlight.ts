import { FabricImage, Rect, Shadow } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import type { Highlight, ScreenshotImage } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'
import { rotateAround } from '../geometry'
import type { ImageUrlResolver } from '../../lib/imageStore'
import type { ScreenBounds } from './deviceFrame'

export interface HighlightRenderCtx {
  canvasWidth: number
  canvasHeight: number
  screenBounds: ScreenBounds
  /** Device tilt in degrees — source selection boxes ride the rotated screenshot. */
  rotation?: number
  screenshot: ScreenshotImage
  resolveUrl: ImageUrlResolver
}

type RegionBox = { left: number; top: number; width: number; height: number }

/** Card corner radius as a fraction of its shorter side. */
export const POPUP_CORNER_RATIO = 0.06

/**
 * The card's width on canvas in px. `zoom` is the source of truth: it multiplies
 * the region's *rendered* size, so resizing the sampling box keeps the
 * magnification instead of silently changing it. Highlights authored before
 * zoom existed fall back to their stored canvas fraction and render unchanged.
 */
export function popupPixelWidth(
  highlight: Highlight,
  screenWidth: number,
  canvasWidth: number,
): number {
  const { zoom } = highlight.popup
  return typeof zoom === 'number'
    ? zoom * highlight.sourceRegion.w * screenWidth
    : canvasWidth * highlight.popup.width
}

/** Inverse of popupPixelWidth — what a hand-resized card means as a zoom. */
export function zoomFromPixelWidth(
  pixelWidth: number,
  regionWidth: number,
  screenWidth: number,
): number {
  return pixelWidth / Math.max(1, regionWidth * screenWidth)
}

type HighlightObjectProps = { layerName: string; highlightId: string; _renderRot: number }

/**
 * Where a source region's center lands on canvas, device tilt included.
 * The rotation pivot is the screen box center — identical to the device
 * pivot for both the bezel-inset and floating footprints.
 */
export function regionCenterOnCanvas(
  sb: RegionBox,
  region: { x: number; y: number; w: number; h: number },
  rotation = 0,
): { x: number; y: number } {
  const cx = sb.left + sb.width * (region.x + region.w / 2)
  const cy = sb.top + sb.height * (region.y + region.h / 2)
  if (!rotation) return { x: cx, y: cy }
  return rotateAround(cx, cy, sb.left + sb.width / 2, sb.top + sb.height / 2, rotation)
}

/**
 * Inverse of regionCenterOnCanvas: a canvas point (the source selection's
 * center) back to a region origin, clamped so the sampling window stays
 * inside the screenshot.
 */
export function canvasPointToRegionOrigin(
  sb: RegionBox,
  size: { w: number; h: number },
  point: { x: number; y: number },
  rotation = 0,
): { x: number; y: number } {
  const p = rotation
    ? rotateAround(point.x, point.y, sb.left + sb.width / 2, sb.top + sb.height / 2, -rotation)
    : point
  const x = (p.x - sb.left) / sb.width - size.w / 2
  const y = (p.y - sb.top) / sb.height - size.h / 2
  return {
    x: Math.max(0, Math.min(1 - size.w, x)),
    y: Math.max(0, Math.min(1 - size.h, y)),
  }
}

export function sourceRegionRectOnCanvas(
  sb: RegionBox,
  region: { x: number; y: number; w: number; h: number },
  rotation = 0,
): { left: number; top: number; width: number; height: number; angle: number } {
  const left = sb.left + sb.width * region.x
  const top = sb.top + sb.height * region.y
  const width = sb.width * region.w
  const height = sb.height * region.h
  const anchor = rotation
    ? rotateAround(left, top, sb.left + sb.width / 2, sb.top + sb.height / 2, rotation)
    : { x: left, y: top }
  return { left: anchor.x, top: anchor.y, width, height, angle: rotation }
}

export function renderHighlightSource(
  highlight: Highlight,
  ctx: Pick<HighlightRenderCtx, 'screenBounds' | 'rotation'>,
): Rect {
  const box = sourceRegionRectOnCanvas(ctx.screenBounds, highlight.sourceRegion, ctx.rotation ?? 0)
  const rect = new Rect({
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    angle: box.angle,
    originX: 'left',
    originY: 'top',
    fill: 'rgba(99, 102, 241, 0.10)',
    stroke: '#6366F1',
    strokeWidth: 2,
    strokeDashArray: [8, 6],
    strokeUniform: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
    borderColor: '#6366F1',
    cornerColor: '#6366F1',
    hoverCursor: 'move',
  })
  rect.setControlsVisibility({ mtr: false })
  ;(rect as Rect & HighlightObjectProps).layerName = LAYER_NAMES.HIGHLIGHT_SOURCE
  ;(rect as Rect & HighlightObjectProps).highlightId = highlight.id
  ;(rect as Rect & HighlightObjectProps)._renderRot = ctx.rotation ?? 0
  return rect
}

/**
 * Render a highlight popup: a magnified card whose placement is independent
 * from the sampled source region. Legacy highlights without popup x/y still
 * render attached to the source center until the user moves the card.
 */
export async function renderHighlight(
  highlight: Highlight,
  ctx: HighlightRenderCtx,
): Promise<FabricImage | null> {
  const url = await ctx.resolveUrl(ctx.screenshot.imageKey)
  if (!url) return null
  const img = await FabricImage.fromURL(url)

  const { sourceRegion, popup } = highlight
  const { originalWidth: srcW, originalHeight: srcH } = ctx.screenshot

  // Crop region in original-image pixels. sourceRegion is normalized to the
  // visible screenshot area which, since we auto-match the device aspect to the
  // screenshot aspect, equals the original image extent.
  const cropX = srcW * sourceRegion.x
  const cropY = srcH * sourceRegion.y
  const cropW = Math.max(1, srcW * sourceRegion.w)
  const cropH = Math.max(1, srcH * sourceRegion.h)

  // Target popup dimensions on canvas. Height is derived from the crop's aspect
  // so the magnified piece never distorts what it samples.
  const popupW = popupPixelWidth(highlight, ctx.screenBounds.width, ctx.canvasWidth)
  const popupH = popupW * (cropH / cropW)
  const scale = popupW / cropW

  const sourceCenter = regionCenterOnCanvas(ctx.screenBounds, sourceRegion, ctx.rotation ?? 0)
  const center =
    typeof popup.x === 'number' && typeof popup.y === 'number'
      ? { x: ctx.canvasWidth * popup.x, y: ctx.canvasHeight * popup.y }
      : sourceCenter
  // The card tilts about its center: spin the top-left anchor around it and
  // let Fabric's `angle` do the rest (origin is top-left).
  const rotation = popup.rotation ?? 0
  const anchor = rotation
    ? rotateAround(center.x - popupW / 2, center.y - popupH / 2, center.x, center.y, rotation)
    : { x: center.x - popupW / 2, y: center.y - popupH / 2 }
  const left = anchor.x
  const top = anchor.y

  img.set({
    cropX,
    cropY,
    width: cropW,
    height: cropH,
    scaleX: scale,
    scaleY: scale,
    left,
    top,
    angle: rotation,
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: false,
    lockSkewingX: true,
    lockSkewingY: true,
    lockUniScaling: true,
    centeredScaling: true,
    // Same gentle magnetism as the device body so the loupe squares up easily.
    snapAngle: 45,
    snapThreshold: 4,
    borderColor: '#6366F1',
    cornerColor: '#6366F1',
    hoverCursor: 'move',
  })
  img.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false, mtr: true })

  // Round the popup card. clipPath uses absolute coords so it tracks the image
  // position; sync code re-creates the clip after a drag.
  const radius = Math.min(popupW, popupH) * POPUP_CORNER_RATIO
  img.clipPath = new Rect({
    left,
    top,
    width: popupW,
    height: popupH,
    rx: radius,
    ry: radius,
    angle: rotation,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
  })

  // Soft floating-card shadow. nonScaling keeps the shadow constant if the
  // user resizes the popup so it doesn't blow up to an unusable blur.
  img.shadow = new Shadow({
    color: 'rgba(15, 23, 42, 0.32)',
    blur: Math.max(14, popupW * 0.04),
    offsetX: 0,
    offsetY: Math.max(8, popupW * 0.025),
    affectStroke: false,
    nonScaling: true,
  })

  ;(img as FabricImage & HighlightObjectProps).layerName = LAYER_NAMES.HIGHLIGHT_POPUP
  ;(img as FabricImage & HighlightObjectProps).highlightId = highlight.id
  ;(img as FabricImage & HighlightObjectProps)._renderRot = ctx.rotation ?? 0
  return img
}

/** The card's live box on canvas, shared by its clip mask and its rim. */
function popupBox(popup: FabricObject): {
  left: number
  top: number
  width: number
  height: number
  rx: number
  ry: number
  angle: number
} {
  const width = (popup.width ?? 0) * (popup.scaleX ?? 1)
  const height = (popup.height ?? 0) * (popup.scaleY ?? 1)
  const r = Math.min(width, height) * POPUP_CORNER_RATIO
  return {
    left: popup.left ?? 0,
    top: popup.top ?? 0,
    width,
    height,
    rx: r,
    ry: r,
    angle: popup.angle ?? 0,
  }
}

/**
 * Non-evented outline over the magnified card. A card sampling the same UI it
 * floats over has no visible edge of its own — the rim is what separates them.
 * Derived from the card (sync never reads it back), so it is re-placed every
 * gesture tick by trackHighlightPopup rather than carrying its own state.
 */
export function renderHighlightRim(highlight: Highlight, popup: FabricImage, canvasWidth: number): Rect | null {
  const rim = highlight.popup.rim
  if (!rim) return null
  const rect = new Rect({
    ...popupBox(popup),
    fill: 'transparent',
    stroke: rim.color,
    strokeWidth: rim.width * canvasWidth,
    strokeUniform: true,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  Object.assign(rect, {
    layerName: LAYER_NAMES.HIGHLIGHT_RIM,
    highlightId: highlight.id,
  })
  return rect
}

/**
 * Pin the card's absolutely-positioned clip mask and its rim to the card's
 * current geometry. Called every move/scale tick so neither lags the drag.
 */
export function trackHighlightPopup(canvas: Canvas, popup: FabricObject): void {
  const box = popupBox(popup)
  const clip = (popup as FabricObject & { clipPath?: Rect }).clipPath
  if (clip) {
    clip.set({ ...box, scaleX: 1, scaleY: 1 })
    popup.dirty = true
  }
  const id = (popup as FabricObject & { highlightId?: string }).highlightId
  if (!id) return
  for (const obj of canvas.getObjects()) {
    const o = obj as FabricObject & { layerName?: string; highlightId?: string }
    if (o.layerName !== LAYER_NAMES.HIGHLIGHT_RIM || o.highlightId !== id) continue
    o.set({ ...box, scaleX: 1, scaleY: 1 })
    o.setCoords()
  }
}
