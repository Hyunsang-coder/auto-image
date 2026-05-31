import type { Caption, CaptionOverride, Slide } from '../types/project'

// Merge a caption's per-locale text + look overrides onto the shared base.
function resolveCaption(caption: Caption, locale: string, ov?: CaptionOverride): Caption {
  const next: Caption = {
    ...caption,
    text: caption.translations[locale] ?? caption.text,
  }
  if (!ov) return next
  if (ov.style) next.style = { ...caption.style, ...ov.style }
  if (ov.pos) next.pos = ov.pos
  if (ov.boxWidth != null) next.boxWidth = ov.boxWidth
  return next
}

/**
 * Flatten a shared base slide into the concrete slide for one locale: text from
 * `translations`, screenshot from `localeOverrides`, and the look (template,
 * background, device transform, screenshot style, caption style/placement) from
 * `slide.localeOverrides`. A null locale (the shared/base view) returns the
 * slide untouched. Absent overrides fall back to the base, so editing the base
 * still shows through everywhere a locale hasn't diverged.
 */
export function resolveSlideForLocale(slide: Slide, locale: string | null): Slide {
  if (!locale) return slide
  const ov = slide.localeOverrides?.[locale]
  const shot = slide.screenshot
  const shotOverride = shot?.localeOverrides?.[locale]

  return {
    ...slide,
    template: ov?.template ?? slide.template,
    background: ov?.background ?? slide.background,
    deviceFrame: ov?.deviceFrame ? { ...slide.deviceFrame, ...ov.deviceFrame } : slide.deviceFrame,
    screenshotStyle: ov?.screenshotStyle ?? slide.screenshotStyle,
    screenshot:
      shotOverride && shot
        ? {
            ...shot,
            imageKey: shotOverride.imageKey,
            originalWidth: shotOverride.originalWidth,
            originalHeight: shotOverride.originalHeight,
          }
        : shot,
    headline: resolveCaption(slide.headline, locale, ov?.headline),
    subheadline: resolveCaption(slide.subheadline, locale, ov?.subheadline),
    badges: slide.badges.map((b) => ({
      ...b,
      text: b.translations[locale] ?? b.text,
    })),
  }
}
