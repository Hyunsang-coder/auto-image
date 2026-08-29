import type { Project, Slide } from '../types/project'

/**
 * Slides whose own screenshot field is actually rendered. Span followers
 * inherit the shared look (screenshot included) from their leader, so they
 * never count toward a missing screenshot. Texts are per-slide — every slide
 * owns its own — so the translation check does NOT use this filter.
 */
function screenshotOwnerSlides(project: Project): Slide[] {
  return project.slides.filter((s) => s.spanRole !== 'follower')
}

/** One translatable string that is still missing at least one target locale. */
export interface PendingTranslation {
  /** 1-based slide number — the way `setText` addresses a slide. */
  slide: number
  slideId: string
  /** `setText` field address: `text:N` or `badge:N`. */
  field: string
  /** The source-locale text to translate from. */
  sourceText: string
  /** Target locales with no translation for this string yet. */
  missing: string[]
}

/**
 * Every translatable string × the target locales it still lacks — the worklist
 * behind the localize step, the readiness dot, and the `live_list_untranslated`
 * bridge method. Addresses match `setText`'s vocabulary so a caller can turn a
 * row straight into a patch op.
 *
 * Texts are per-slide (a span follower owns its own); badges are leader-owned,
 * mirroring what `setText` accepts.
 */
export function getPendingTranslations(project: Project): PendingTranslation[] {
  const pending: PendingTranslation[] = []
  for (const slide of project.slides) {
    const strings: { field: string; text: string; translations: Record<string, string> }[] = []
    slide.texts.forEach((c, i) => {
      if (c.text) strings.push({ field: `text:${i}`, text: c.text, translations: c.translations })
    })
    if (slide.spanRole !== 'follower') {
      slide.badges?.forEach((b, i) => {
        if (b.text) strings.push({ field: `badge:${i}`, text: b.text, translations: b.translations })
      })
    }
    for (const s of strings) {
      const missing = project.targetLocales.filter((locale) => !s.translations[locale])
      if (missing.length) {
        pending.push({
          slide: slide.index + 1,
          slideId: slide.id,
          field: s.field,
          sourceText: s.text,
          missing,
        })
      }
    }
  }
  return pending
}

/**
 * Target locales that still have at least one untranslated string. Single source
 * of truth shared by ExportPanel's pre-export banner and StepIndicator's
 * readiness dot — do not duplicate this predicate.
 */
export function getUntranslatedLocales(project: Project): string[] {
  const missing = new Set(getPendingTranslations(project).flatMap((p) => p.missing))
  return project.targetLocales.filter((locale) => missing.has(locale))
}

/**
 * 1-based display numbers of owner slides that have no base screenshot. None of
 * the current templates is intentionally image-less — each renders the device
 * frame / text when `screenshot == null` — so a null screenshot is always worth
 * a soft warning (the frame still exports, just empty). Followers are skipped
 * (they inherit the leader's screenshot).
 */
export function getSlidesMissingScreenshot(project: Project): number[] {
  return screenshotOwnerSlides(project)
    .filter((slide) => slide.screenshot == null)
    .map((slide) => slide.index + 1)
    .sort((a, b) => a - b)
}
