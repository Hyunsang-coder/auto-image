import { Canvas } from 'fabric'
import type { Slide, DeviceType } from '../types/project'
import { deviceSpecOf, EDITOR_CANVAS_WIDTH } from '../constants/deviceSpecs'
import { applyTemplate } from '../canvas/templateLayouts'
import { createImageUrlCache } from './imageStore'
import { encodeOpaquePng } from './encodePng'

export function withLocale(slide: Slide, locale: string | null): Slide {
  if (!locale) return slide
  const override = slide.screenshot?.localeOverrides?.[locale]
  return {
    ...slide,
    screenshot:
      override && slide.screenshot
        ? {
            ...slide.screenshot,
            imageKey: override.imageKey,
            originalWidth: override.originalWidth,
            originalHeight: override.originalHeight,
          }
        : slide.screenshot,
    headline: {
      ...slide.headline,
      text: slide.headline.translations[locale] ?? slide.headline.text,
    },
    subheadline: {
      ...slide.subheadline,
      text: slide.subheadline.translations[locale] ?? slide.subheadline.text,
    },
    badges: slide.badges.map((b) => ({
      ...b,
      text: b.translations[locale] ?? b.text,
    })),
  }
}

function withScaledFonts(slide: Slide, scale: number): Slide {
  return {
    ...slide,
    headline: {
      ...slide.headline,
      style: {
        ...slide.headline.style,
        fontSize: Math.round(slide.headline.style.fontSize * scale),
        letterSpacing: (slide.headline.style.letterSpacing ?? 0) * scale,
      },
    },
    subheadline: {
      ...slide.subheadline,
      style: {
        ...slide.subheadline.style,
        fontSize: Math.round(slide.subheadline.style.fontSize * scale),
        letterSpacing: (slide.subheadline.style.letterSpacing ?? 0) * scale,
      },
    },
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
  deviceType: DeviceType,
  locale: string | null,
  previewWidth?: number,
): Promise<Blob> {
  const spec = deviceSpecOf(deviceType)
  const width = previewWidth ?? spec.exportWidth
  const height = previewWidth
    ? Math.round(previewWidth * spec.exportHeight / spec.exportWidth)
    : spec.exportHeight
  const scale = width / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(withLocale(slide, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })
  const urls = createImageUrlCache()

  try {
    await applyTemplate(canvas, exportSlide, { width, height }, { resolveUrl: urls.get })
    await document.fonts.ready
    canvas.renderAll()

    return encodeOpaquePng(el)
  } finally {
    canvas.dispose()
    urls.revokeAll()
  }
}

/**
 * Render a 2-page span group: produces a single 2×-wide canvas from the
 * leader's data, then slices it into two device-sized PNGs. Sequential render
 * → cheaper than two separate full renders, and guarantees objects crossing
 * the seam (device frame, text) line up pixel-perfect across the split.
 */
export async function renderSpanGroup(
  leader: Slide,
  deviceType: DeviceType,
  locale: string | null,
  previewHalfWidth?: number,
): Promise<{ leader: Blob; follower: Blob }> {
  const spec = deviceSpecOf(deviceType)
  const halfWidth = previewHalfWidth ?? spec.exportWidth
  const fullWidth = halfWidth * 2
  const height = previewHalfWidth
    ? Math.round(previewHalfWidth * spec.exportHeight / spec.exportWidth)
    : spec.exportHeight
  // The editor renders grouped slides on a 2× canvas (880px wide); each axis
  // scales by the same single-slide ratio (halfWidth / EDITOR_CANVAS_WIDTH).
  const scale = halfWidth / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(withLocale(leader, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })
  const urls = createImageUrlCache()

  try {
    await applyTemplate(canvas, exportSlide, { width: fullWidth, height }, { spanCentered: true, resolveUrl: urls.get })
    await document.fonts.ready
    canvas.renderAll()

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
