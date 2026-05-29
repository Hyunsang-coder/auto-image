import { Canvas } from 'fabric'
import type { Slide, DeviceType } from '../types/project'
import { deviceSpecOf, EDITOR_CANVAS_WIDTH } from '../constants/deviceSpecs'
import { applyTemplate } from '../canvas/templateLayouts'

function withLocaleText(slide: Slide, locale: string | null): Slide {
  if (!locale) return slide
  return {
    ...slide,
    headline: {
      ...slide.headline,
      text: slide.headline.translations[locale] ?? slide.headline.text,
    },
    subheadline: {
      ...slide.subheadline,
      text: slide.subheadline.translations[locale] ?? slide.subheadline.text,
    },
    badge: slide.badge
      ? { ...slide.badge, text: slide.badge.translations[locale] ?? slide.badge.text }
      : null,
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
    badge: slide.badge
      ? {
          ...slide.badge,
          style: {
            ...slide.badge.style,
            fontSize: Math.round(slide.badge.style.fontSize * scale),
            paddingX: slide.badge.style.paddingX * scale,
            paddingY: slide.badge.style.paddingY * scale,
            borderRadius: slide.badge.style.borderRadius * scale,
          },
        }
      : null,
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
  const exportSlide = withScaledFonts(withLocaleText(slide, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })

  await applyTemplate(canvas, exportSlide, { width, height })
  await document.fonts.ready
  canvas.renderAll()

  const blob = await new Promise<Blob | null>((resolve) => {
    el.toBlob((b) => resolve(b), 'image/png')
  })

  canvas.dispose()

  if (!blob) throw new Error('toBlob returned null')
  return blob
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
  const exportSlide = withScaledFonts(withLocaleText(leader, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })

  await applyTemplate(canvas, exportSlide, { width: fullWidth, height }, { spanCentered: true })
  await document.fonts.ready
  canvas.renderAll()

  // Slice — read pixel data from the wide DOM canvas (Fabric writes its render
  // there) into two half-size canvases, then toBlob each.
  const makeHalf = async (sourceOffset: number): Promise<Blob> => {
    const half = document.createElement('canvas')
    half.width = halfWidth
    half.height = height
    const ctx = half.getContext('2d')!
    ctx.drawImage(el, -sourceOffset, 0)
    return new Promise<Blob>((resolve, reject) => {
      half.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png')
    })
  }
  const leftBlob = await makeHalf(0)
  const rightBlob = await makeHalf(halfWidth)

  canvas.dispose()
  return { leader: leftBlob, follower: rightBlob }
}
