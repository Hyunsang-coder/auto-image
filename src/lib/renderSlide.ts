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
  }
}

export async function renderSlide(
  slide: Slide,
  deviceType: DeviceType,
  locale: string | null,
): Promise<Blob> {
  const spec = deviceSpecOf(deviceType)
  const scale = spec.exportWidth / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(withLocaleText(slide, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })

  await applyTemplate(canvas, exportSlide, { width: spec.exportWidth, height: spec.exportHeight })
  await document.fonts.ready
  canvas.renderAll()

  const blob = await new Promise<Blob | null>((resolve) => {
    el.toBlob((b) => resolve(b), 'image/png')
  })

  canvas.dispose()

  if (!blob) throw new Error('toBlob returned null')
  return blob
}
