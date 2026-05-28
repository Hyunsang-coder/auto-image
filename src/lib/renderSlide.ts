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
