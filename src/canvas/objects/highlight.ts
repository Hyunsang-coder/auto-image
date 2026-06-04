import { FabricImage, Rect, Shadow } from 'fabric'
import type { Highlight, ScreenshotImage } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'
import { rotateAround } from '../geometry'
import type { ImageUrlResolver } from '../../lib/imageStore'
import type { ScreenBounds } from './deviceFrame'

export interface HighlightRenderCtx {
  canvasWidth: number
  canvasHeight: number
  screenBounds: ScreenBounds
  /** Device tilt in degrees — the loupe rides the rotated screenshot. */
  rotation?: number
  screenshot: ScreenshotImage
  resolveUrl: ImageUrlResolver
}

type RegionBox = { left: number; top: number; width: number; height: number }

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
 * Inverse of regionCenterOnCanvas: a canvas point (the dragged loupe's
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

/**
 * Render a highlight: a single magnified card (loupe) glued onto its source
 * region's current on-canvas position. There is no separate source marker.
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

  // Target popup dimensions on canvas. popup.width is a fraction of canvas
  // width; height is derived from the crop's aspect so the magnified piece
  // never distorts what it samples.
  const popupW = ctx.canvasWidth * popup.width
  const popupH = popupW * (cropH / cropW)
  const scale = popupW / cropW

  // Loupe placement: centered on the source region's rendered position.
  const center = regionCenterOnCanvas(ctx.screenBounds, sourceRegion, ctx.rotation ?? 0)
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
  const radius = Math.min(popupW, popupH) * 0.06
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

  ;(img as FabricImage & { layerName: string; highlightId: string }).layerName =
    LAYER_NAMES.HIGHLIGHT_POPUP
  ;(img as FabricImage & { highlightId: string }).highlightId = highlight.id
  // The device tilt this render used. Sync un-rotates the dragged loupe with
  // THIS value (not the store's current one); a device-rotation gesture orbits
  // the card and advances _renderRot in step, so the inverse mapping keeps
  // deriving the unchanged region.
  ;(img as FabricImage & { _renderRot: number })._renderRot = ctx.rotation ?? 0
  return img
}
