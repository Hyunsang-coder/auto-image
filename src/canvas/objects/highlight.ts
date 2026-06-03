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
  screenshot: ScreenshotImage
  resolveUrl: ImageUrlResolver
}

export interface HighlightRender {
  source: Rect | null
  popup: FabricImage | null
}

function makeSourceRect(highlight: Highlight, ctx: HighlightRenderCtx): Rect {
  const { sourceRegion, borderColor, borderWidth } = highlight
  const sb = ctx.screenBounds
  const left = sb.left + sb.width * sourceRegion.x
  const top = sb.top + sb.height * sourceRegion.y
  const w = sb.width * sourceRegion.w
  const h = sb.height * sourceRegion.h

  const rect = new Rect({
    left,
    top,
    width: w,
    height: h,
    fill: 'transparent',
    stroke: borderColor,
    strokeWidth: borderWidth,
    strokeDashArray: [borderWidth * 2, borderWidth * 2],
    rx: Math.min(w, h) * 0.06,
    ry: Math.min(w, h) * 0.06,
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    borderColor: '#6366F1',
    cornerColor: '#6366F1',
    hoverCursor: 'move',
  })
  // Hide middle handles — corner-only resize keeps the region rectangular and
  // predictable. Aspect doesn't need to be locked since users may want to crop
  // wider or taller regions independently.
  rect.setControlsVisibility({ mtr: false })
  ;(rect as Rect & { layerName: string; highlightId: string }).layerName =
    LAYER_NAMES.HIGHLIGHT_SOURCE
  ;(rect as Rect & { highlightId: string }).highlightId = highlight.id
  return rect
}

async function makePopupImage(
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

  const centerX = ctx.canvasWidth * popup.x
  const centerY = ctx.canvasHeight * popup.y
  // The card tilts about its center: spin the top-left anchor around it and
  // let Fabric's `angle` do the rest (origin is top-left).
  const rotation = popup.rotation ?? 0
  const anchor = rotation
    ? rotateAround(centerX - popupW / 2, centerY - popupH / 2, centerX, centerY, rotation)
    : { x: centerX - popupW / 2, y: centerY - popupH / 2 }
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
  const radius = popup.borderRadius ?? Math.min(popupW, popupH) * 0.06
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
    color: popup.shadowColor ?? 'rgba(15, 23, 42, 0.32)',
    blur: Math.max(14, popupW * 0.04),
    offsetX: 0,
    offsetY: Math.max(8, popupW * 0.025),
    affectStroke: false,
    nonScaling: true,
  })

  ;(img as FabricImage & { layerName: string; highlightId: string }).layerName =
    LAYER_NAMES.HIGHLIGHT_POPUP
  ;(img as FabricImage & { highlightId: string }).highlightId = highlight.id
  return img
}

export async function renderHighlight(
  highlight: Highlight,
  ctx: HighlightRenderCtx,
): Promise<HighlightRender> {
  // Source rect only renders if the user wants a visible border; borderWidth 0
  // hides it. Either way the popup still renders so a "hidden source / visible
  // magnified card" composition (like the Claude reference) is possible.
  const source = highlight.borderWidth > 0 ? makeSourceRect(highlight, ctx) : null
  const popup = await makePopupImage(highlight, ctx)
  return { source, popup }
}

/**
 * Recompute the popup's clipPath after a drag/resize so its rounded mask
 * tracks the image's new absolute position.
 */
export function syncPopupClipPath(img: FabricImage): void {
  const w = (img.width ?? 0) * (img.scaleX ?? 1)
  const h = (img.height ?? 0) * (img.scaleY ?? 1)
  const left = img.left ?? 0
  const top = img.top ?? 0
  const radius = Math.min(w, h) * 0.06
  img.clipPath = new Rect({
    left,
    top,
    width: w,
    height: h,
    rx: radius,
    ry: radius,
    angle: img.angle ?? 0,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
  })
}
