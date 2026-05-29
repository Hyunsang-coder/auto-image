import { FabricImage, Rect, Gradient } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Background } from '../../types/project'
import type { ImageUrlResolver } from '../../lib/imageStore'
import { LAYER_NAMES } from '../layerNames'

function tagBg<T extends FabricObject>(obj: T): T {
  ;(obj as T & { layerName: string }).layerName = LAYER_NAMES.BACKGROUND
  return obj
}

function solidOrGradientRect(
  canvasWidth: number,
  canvasHeight: number,
  background: Background,
): Rect {
  const rect = new Rect({
    left: 0,
    top: 0,
    width: canvasWidth,
    height: canvasHeight,
    // Fabric v7 defaults originX/originY to 'center', so we'd render only the
    // bottom-right quadrant of the rect inside the canvas. Anchor to top-left.
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })

  if (background.type === 'gradient' && background.gradient) {
    const { stops, direction } = background.gradient
    // direction is degrees: 0 = top-to-bottom vertical, 90 = left-to-right horizontal
    const rad = (direction * Math.PI) / 180
    const x1 = 0.5 - Math.sin(rad) * 0.5
    const y1 = 0.5 - Math.cos(rad) * 0.5
    const x2 = 0.5 + Math.sin(rad) * 0.5
    const y2 = 0.5 + Math.cos(rad) * 0.5

    const gradient = new Gradient({
      type: 'linear',
      coords: {
        x1: x1 * canvasWidth,
        y1: y1 * canvasHeight,
        x2: x2 * canvasWidth,
        y2: y2 * canvasHeight,
      },
      colorStops: stops.map((s) => ({ offset: s.position, color: s.color })),
    })
    rect.set('fill', gradient)
  } else {
    rect.set('fill', background.color ?? '#6366F1')
  }

  return rect
}

/**
 * Build the background layer(s). Solid/gradient return a single Rect; an image
 * background returns a backing fill Rect (covers letterbox gaps / transparency)
 * plus the FabricImage, sized per `imageObjectFit` and clipped to the canvas.
 * Async because the image blob is loaded through `resolveUrl`.
 */
export async function renderBackground(
  canvasWidth: number,
  canvasHeight: number,
  background: Background,
  resolveUrl: ImageUrlResolver,
): Promise<FabricObject[]> {
  if (background.type === 'image' && background.imageKey) {
    const url = await resolveUrl(background.imageKey)
    if (url) {
      const fit = background.imageObjectFit ?? 'cover'
      const back = tagBg(
        new Rect({
          left: 0,
          top: 0,
          width: canvasWidth,
          height: canvasHeight,
          originX: 'left',
          originY: 'top',
          fill: background.color ?? '#FFFFFF',
          selectable: false,
          evented: false,
          hoverCursor: 'default',
        }),
      )

      const img = await FabricImage.fromURL(url)
      const iw = img.width ?? 1
      const ih = img.height ?? 1
      if (fit === 'fill') {
        img.set({ scaleX: canvasWidth / iw, scaleY: canvasHeight / ih, left: 0, top: 0 })
      } else {
        const scale =
          fit === 'contain'
            ? Math.min(canvasWidth / iw, canvasHeight / ih)
            : Math.max(canvasWidth / iw, canvasHeight / ih)
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (canvasWidth - iw * scale) / 2,
          top: (canvasHeight - ih * scale) / 2,
        })
      }
      img.set({ originX: 'left', originY: 'top', selectable: false, evented: false, hoverCursor: 'default' })
      // Clip overflow (cover) to the canvas frame.
      img.clipPath = new Rect({
        left: 0,
        top: 0,
        width: canvasWidth,
        height: canvasHeight,
        originX: 'left',
        originY: 'top',
        absolutePositioned: true,
      })
      return [back, tagBg(img)]
    }
    // Missing blob → fall back to the solid color so the slide still renders.
  }

  return [tagBg(solidOrGradientRect(canvasWidth, canvasHeight, background))]
}
