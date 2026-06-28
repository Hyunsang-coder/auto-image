import { FabricImage, Rect, Shadow } from 'fabric'
import type { FabricObject } from 'fabric'
import type { ExternalImage, ScreenshotCrop } from '../../types/project'
import type { ImageUrlResolver } from '../../lib/imageStore'
import { LAYER_NAMES } from '../layerNames'
import { rotateAround } from '../geometry'

export interface ExternalImageRenderCtx {
  canvasWidth: number
  canvasHeight: number
  resolveUrl: ImageUrlResolver
}

const EMPTY_CROP: ScreenshotCrop = { top: 0, right: 0, bottom: 0, left: 0 }
const DEFAULT_CORNER_RADIUS_RATIO = 0.06

export interface ExternalImageObjectProps {
  layerName?: string
  externalImageId?: string
  _externalCrop?: ScreenshotCrop
  _externalCornerRadiusRatio?: number
}

function effectiveCrop(crop: ScreenshotCrop | undefined): ScreenshotCrop {
  return { ...EMPTY_CROP, ...crop }
}

export function updateExternalImageClip(obj: FabricObject): void {
  const target = obj as FabricObject & ExternalImageObjectProps & { clipPath?: FabricObject }
  const crop = effectiveCrop(target._externalCrop)
  const fullW = obj.getScaledWidth()
  const fullH = obj.getScaledHeight()
  const visibleW = Math.max(0, fullW * (1 - crop.left - crop.right))
  const visibleH = Math.max(0, fullH * (1 - crop.top - crop.bottom))
  const center = obj.getCenterPoint()
  const angle = obj.angle ?? 0
  const dx = fullW * (crop.left - crop.right) / 2
  const dy = fullH * (crop.top - crop.bottom) / 2
  const clipCenter = angle
    ? rotateAround(center.x + dx, center.y + dy, center.x, center.y, angle)
    : { x: center.x + dx, y: center.y + dy }
  const radius = Math.max(0, fullW * (target._externalCornerRadiusRatio ?? DEFAULT_CORNER_RADIUS_RATIO))
  const clip = target.clipPath instanceof Rect ? target.clipPath : new Rect()
  clip.set({
    left: clipCenter.x,
    top: clipCenter.y,
    width: visibleW,
    height: visibleH,
    rx: Math.min(radius, visibleW / 2),
    ry: Math.min(radius, visibleH / 2),
    angle,
    originX: 'center',
    originY: 'center',
    scaleX: 1,
    scaleY: 1,
    absolutePositioned: true,
  })
  target.clipPath = clip
  target.dirty = true
}

export async function renderExternalImage(
  image: ExternalImage,
  ctx: ExternalImageRenderCtx,
): Promise<FabricObject | null> {
  const url = await ctx.resolveUrl(image.imageKey)
  if (!url) return null

  const obj = await FabricImage.fromURL(url)
  const targetWidth = ctx.canvasWidth * image.width
  const scale = targetWidth / image.originalWidth
  obj.set({
    left: ctx.canvasWidth * image.x,
    top: ctx.canvasHeight * image.y,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
    angle: image.rotation,
    opacity: image.opacity,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    borderColor: '#0D99FF',
    cornerColor: '#0D99FF',
    hoverCursor: 'move',
    lockUniScaling: true,
    lockSkewingX: true,
    lockSkewingY: true,
    centeredScaling: true,
    snapAngle: 45,
    snapThreshold: 4,
  })
  obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false, mtr: true })
  if (image.shadow ?? true) {
    obj.shadow = new Shadow({
      color: 'rgba(15, 23, 42, 0.28)',
      blur: Math.max(12, targetWidth * 0.05),
      offsetX: 0,
      offsetY: Math.max(8, targetWidth * 0.03),
      affectStroke: false,
      nonScaling: true,
    })
  }
  Object.assign(obj as FabricObject & ExternalImageObjectProps, {
    layerName: LAYER_NAMES.EXTERNAL_IMAGE,
    externalImageId: image.id,
    _externalCrop: effectiveCrop(image.crop),
    _externalCornerRadiusRatio: image.cornerRadiusRatio ?? DEFAULT_CORNER_RADIUS_RATIO,
  })
  updateExternalImageClip(obj)
  return obj
}
