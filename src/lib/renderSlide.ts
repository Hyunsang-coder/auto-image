import { Canvas } from 'fabric'
import type { Slide } from '../types/project'
import { DEVICE_SPECS, EDITOR_CANVAS_WIDTH } from '../constants/deviceSpecs'
import { applyTemplate } from '../canvas/templateLayouts'
import { createImageUrlCache } from './imageStore'
import { encodeOpaquePng } from './encodePng'
import { resolveSlideForLocale } from './resolveSlide'
import { awaitSlideFonts } from './fonts'

function withScaledFonts(slide: Slide, scale: number): Slide {
  return {
    ...slide,
    texts: slide.texts.map((c) => ({
      ...c,
      style: {
        ...c.style,
        fontSize: Math.round(c.style.fontSize * scale),
        letterSpacing: (c.style.letterSpacing ?? 0) * scale,
      },
    })),
    badges: slide.badges.map((b) => ({
      ...b,
      style: {
        ...b.style,
        fontSize: Math.round(b.style.fontSize * scale),
        paddingX: b.style.paddingX * scale,
        paddingY: b.style.paddingY * scale,
        borderRadius: b.style.borderRadius * scale,
      },
    })),
  }
}

export async function renderSlide(
  slide: Slide,
  locale: string | null,
  previewWidth?: number,
): Promise<Blob> {
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  const width = previewWidth ?? spec.exportWidth
  const height = previewWidth
    ? Math.round(previewWidth * spec.exportHeight / spec.exportWidth)
    : spec.exportHeight
  const scale = width / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(resolveSlideForLocale(slide, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })
  const urls = createImageUrlCache()

  try {
    // Fonts must be loaded BEFORE applyTemplate: it measures text for fit-to-box
    // sizing and badge width, and Fabric caches those dimensions at layout time
    // (a later renderAll repaints glyphs but won't recompute them). Measuring
    // against an unloaded Noto JP would bake fallback-font metrics into the export.
    await awaitSlideFonts(exportSlide)
    await applyTemplate(canvas, exportSlide, { width, height }, { resolveUrl: urls.get })

    return encodeOpaquePng(el)
  } finally {
    canvas.dispose()
    urls.revokeAll()
  }
}

/**
 * Render a 2-page span group: produces a single 2×-wide canvas — the leader's
 * shared layers plus each slide's own texts on its own page — then slices it
 * into two device-sized PNGs. Sequential render → cheaper than two separate
 * full renders, and guarantees objects crossing the seam (device frame, text)
 * line up pixel-perfect across the split.
 */
export async function renderSpanGroup(
  leader: Slide,
  follower: Slide,
  locale: string | null,
  previewHalfWidth?: number,
): Promise<{ leader: Blob; follower: Blob }> {
  const spec = DEVICE_SPECS[leader.deviceFrame.model]
  const halfWidth = previewHalfWidth ?? spec.exportWidth
  const fullWidth = halfWidth * 2
  const height = previewHalfWidth
    ? Math.round(previewHalfWidth * spec.exportHeight / spec.exportWidth)
    : spec.exportHeight
  // The editor renders grouped slides on a 2× canvas (880px wide); each axis
  // scales by the same single-slide ratio (halfWidth / EDITOR_CANVAS_WIDTH).
  const scale = halfWidth / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(resolveSlideForLocale(leader, locale), scale)
  const exportFollower = withScaledFonts(resolveSlideForLocale(follower, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })
  const urls = createImageUrlCache()

  try {
    // Load fonts before layout — applyTemplate measures text for fit/badge sizing
    // and Fabric won't recompute those dimensions on a later render (see renderSlide).
    await awaitSlideFonts(exportSlide)
    await awaitSlideFonts(exportFollower)
    await applyTemplate(canvas, exportSlide, { width: fullWidth, height }, {
      spanCentered: true,
      resolveUrl: urls.get,
      spanFollower: { texts: exportFollower.texts, template: exportFollower.template },
    })

    // Slice — read pixel data from the wide DOM canvas (Fabric writes its render
    // there) into two half-size canvases, then toBlob each.
    const makeHalf = (sourceOffset: number): Blob => {
      const half = document.createElement('canvas')
      half.width = halfWidth
      half.height = height
      const ctx = half.getContext('2d')!
      ctx.drawImage(el, -sourceOffset, 0)
      return encodeOpaquePng(half)
    }
    const leftBlob = makeHalf(0)
    const rightBlob = makeHalf(halfWidth)

    return { leader: leftBlob, follower: rightBlob }
  } finally {
    canvas.dispose()
    urls.revokeAll()
  }
}
