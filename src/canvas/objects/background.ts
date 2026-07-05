import { FabricImage, Rect, Circle, Gradient, Pattern, Color } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Background, BackgroundBlob } from '../../types/project'
import type { ImageUrlResolver } from '../../lib/imageStore'
import { MAX_BACKGROUND_BLOBS } from '../../constants/defaults'
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
    const { stops, direction, kind } = background.gradient
    const colorStops = stops.map((s) => ({ offset: s.position, color: s.color }))

    let gradient: Gradient<'linear'> | Gradient<'radial'>
    if (kind === 'radial') {
      const cx = canvasWidth / 2
      const cy = canvasHeight / 2
      // Radius reaches the corners so the final stop fully covers the frame.
      const r = Math.sqrt(canvasWidth ** 2 + canvasHeight ** 2) / 2
      gradient = new Gradient({
        type: 'radial',
        coords: { x1: cx, y1: cy, r1: 0, x2: cx, y2: cy, r2: r },
        colorStops,
      })
    } else {
      // direction is degrees: 0 = top-to-bottom vertical, 90 = left-to-right horizontal
      const rad = (direction * Math.PI) / 180
      const x1 = 0.5 - Math.sin(rad) * 0.5
      const y1 = 0.5 - Math.cos(rad) * 0.5
      const x2 = 0.5 + Math.sin(rad) * 0.5
      const y2 = 0.5 + Math.cos(rad) * 0.5
      gradient = new Gradient({
        type: 'linear',
        coords: {
          x1: x1 * canvasWidth,
          y1: y1 * canvasHeight,
          x2: x2 * canvasWidth,
          y2: y2 * canvasHeight,
        },
        colorStops,
      })
    }
    rect.set('fill', gradient)
  } else {
    rect.set('fill', background.color ?? '#6366F1')
  }

  return rect
}

function blobCircle(canvasWidth: number, canvasHeight: number, blob: BackgroundBlob): Circle {
  const r = blob.radius * Math.min(canvasWidth, canvasHeight)
  const alpha = (a: number) => new Color(blob.color).setAlpha(a).toRgba()
  const circle = new Circle({
    left: blob.x * canvasWidth - r,
    top: blob.y * canvasHeight - r,
    radius: r,
    originX: 'left',
    originY: 'top',
    opacity: blob.opacity ?? 0.55,
    ...(blob.blendMode ? { globalCompositeOperation: blob.blendMode } : {}),
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  circle.set(
    'fill',
    new Gradient({
      type: 'radial',
      gradientUnits: 'percentage',
      coords: { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 },
      // Gaussian-ish falloff so the blob reads as blurred, not as a hard disc.
      colorStops: [
        { offset: 0, color: alpha(1) },
        { offset: 0.5, color: alpha(0.55) },
        { offset: 0.78, color: alpha(0.18) },
        { offset: 1, color: alpha(0) },
      ],
    }),
  )
  return circle
}

/** Deterministic (seeded) grain tile so re-renders of the same slide are stable. */
function noiseTile(intensity: number): HTMLCanvasElement | null {
  const size = 128
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const ctx = tile.getContext('2d')
  if (!ctx) return null // jsdom in unit tests has no 2d context
  const img = ctx.createImageData(size, size)
  let seed = 0x9e3779b9
  const rand = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() < 0.5 ? 0 : 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = Math.round(rand() * intensity * 110)
  }
  ctx.putImageData(img, 0, 0)
  return tile
}

function noiseRect(canvasWidth: number, canvasHeight: number, intensity: number): Rect | null {
  const tile = noiseTile(intensity)
  if (!tile) return null
  // Scale grain with canvas height so the editor preview (~500px) and the
  // full-resolution export (~2800px) show the same relative grain size.
  const s = canvasHeight / 2800
  return new Rect({
    left: 0,
    top: 0,
    width: canvasWidth,
    height: canvasHeight,
    originX: 'left',
    originY: 'top',
    fill: new Pattern({ source: tile, repeat: 'repeat', patternTransform: [s, 0, 0, s, 0, 0] }),
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
}

function overlayObjects(canvasWidth: number, canvasHeight: number, background: Background): FabricObject[] {
  const objects: FabricObject[] = []
  for (const blob of (background.blobs ?? []).slice(0, MAX_BACKGROUND_BLOBS)) {
    objects.push(tagBg(blobCircle(canvasWidth, canvasHeight, blob)))
  }
  if (background.noise && background.noise > 0) {
    const grain = noiseRect(canvasWidth, canvasHeight, Math.min(background.noise, 1))
    if (grain) objects.push(tagBg(grain))
  }
  return objects
}

/**
 * Build the background layer(s). Solid/gradient return a single Rect; an image
 * background returns a backing fill Rect (covers letterbox gaps / transparency)
 * plus the FabricImage, sized per `imageObjectFit` and clipped to the canvas.
 * Optional `blobs` (soft radial color spots) and `noise` (grain) stack on top
 * of any base, in that order. Async because the image blob is loaded through
 * `resolveUrl`.
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
      return [back, tagBg(img), ...overlayObjects(canvasWidth, canvasHeight, background)]
    }
    // Missing blob → fall back to the solid color so the slide still renders.
  }

  return [
    tagBg(solidOrGradientRect(canvasWidth, canvasHeight, background)),
    ...overlayObjects(canvasWidth, canvasHeight, background),
  ]
}
