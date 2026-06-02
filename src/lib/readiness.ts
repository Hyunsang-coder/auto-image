import type { Project, Slide } from '../types/project'

/**
 * Slides whose own text/screenshot fields are actually rendered. Span
 * followers inherit everything from their leader, so they never count toward
 * "missing" anything — skip them everywhere readiness is computed.
 */
function ownerSlides(project: Project): Slide[] {
  return project.slides.filter((s) => s.spanRole !== 'follower')
}

/**
 * Target locales that still have at least one owner slide with untranslated
 * headline or subheadline text. Single source of truth shared by ExportPanel's
 * pre-export banner and StepIndicator's readiness dot — do not duplicate this
 * predicate.
 */
export function getUntranslatedLocales(project: Project): string[] {
  const owners = ownerSlides(project)
  return project.targetLocales.filter((locale) =>
    owners.some(
      (slide) =>
        (slide.headline.text && !slide.headline.translations[locale]) ||
        (slide.subheadline.text && !slide.subheadline.translations[locale]),
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
  return ownerSlides(project)
    .filter((slide) => slide.screenshot == null)
    .map((slide) => slide.index + 1)
    .sort((a, b) => a - b)
}
