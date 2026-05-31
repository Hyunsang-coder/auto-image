import type { Caption, CaptionLayout, Slide } from '../types/project'

// Merge a caption's per-locale text + geometry overrides onto the shared base.
function resolveCaption(caption: Caption, locale: string, layout?: CaptionLayout): Caption {
  const next: Caption = {
    ...caption,
    text: caption.translations[locale] ?? caption.text,
  }
  if (!layout) return next
  if (layout.pos) next.pos = layout.pos
  if (layout.boxWidth != null) next.boxWidth = layout.boxWidth
  if (layout.fontSize != null) next.style = { ...caption.style, fontSize: layout.fontSize }
  return next
}

/**
 * Flatten a shared base slide into the concrete slide for one locale: text from
 * `translations`, screenshot from `localeOverrides`, and geometry from
 * `localeLayout`. A null locale (the shared/base view) returns the slide
 * untouched. Absent overrides fall back to the base, so editing the base still
 * shows through everywhere a locale hasn't diverged.
 */
export function resolveSlideForLocale(slide: Slide, locale: string | null): Slide {
  if (!locale) return slide
  const layout = slide.localeLayout?.[locale]
  const shot = slide.screenshot
  const shotOverride = shot?.localeOverrides?.[locale]

  return {
    ...slide,
    screenshot:
      shotOverride && shot
        ? {
            ...shot,
            imageKey: shotOverride.imageKey,
            originalWidth: shotOverride.originalWidth,
            originalHeight: shotOverride.originalHeight,
          }
        : shot,
    headline: resolveCaption(slide.headline, locale, layout?.headline),
    subheadline: resolveCaption(slide.subheadline, locale, layout?.subheadline),
    badges: slide.badges.map((b) => ({
      ...b,
      text: b.translations[locale] ?? b.text,
    })),
    deviceFrame: layout?.deviceFrame
      ? { ...slide.deviceFrame, ...layout.deviceFrame }
      : slide.deviceFrame,
  }
}
