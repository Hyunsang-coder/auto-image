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

/**
 * Target locales that still have at least one slide with an untranslated
 * text block. Single source of truth shared by ExportPanel's
 * pre-export banner and StepIndicator's readiness dot — do not duplicate this
 * predicate.
 */
export function getUntranslatedLocales(project: Project): string[] {
  return project.targetLocales.filter((locale) =>
    project.slides.some((slide) =>
      slide.texts.some((t) => t.text && !t.translations[locale]),
    ),
  )
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
