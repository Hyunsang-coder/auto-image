// Pure builders that turn a single (slide, field, locale, value) cell into a
// store patch. No store/React deps so the import routing stays unit-testable.
// A target-locale value lands in `translations[locale]`; a source-locale value
// lands in the slide's base `.text` — which language is the source is the app's
// `project.sourceLocale` setting, so the same file imports differently when the
// user flips the source language.

import type { Slide } from '../types/project'

export type FieldKey = 'image' | `text:${number}` | `badge:${number}`

/** Write a translation into `translations[locale]` (used by the grid + non-source import columns). */
export function buildTranslationPatch(
  slides: Slide[],
  slideId: string,
  field: FieldKey,
  locale: string,
  value: string,
): Partial<Slide> | null {
  const slide = slides.find(s => s.id === slideId)
  if (!slide) return null
  if (field.startsWith('text:')) {
    const ti = Number(field.slice(5))
    if (!slide.texts[ti]) return null
    return {
      texts: slide.texts.map((c, i) =>
        i === ti ? { ...c, translations: { ...c.translations, [locale]: value } } : c,
      ),
    }
  }
  if (field.startsWith('badge:')) {
    const bi = Number(field.slice(6))
    if (!slide.badges?.[bi]) return null
    return {
      badges: slide.badges.map((b, i) =>
        i === bi ? { ...b, translations: { ...b.translations, [locale]: value } } : b,
      ),
    }
  }
  return null
}

/** Overwrite the slide's base `.text` (used when an import column is the source locale). */
export function buildBasePatch(
  slides: Slide[],
  slideId: string,
  field: FieldKey,
  value: string,
): Partial<Slide> | null {
  const slide = slides.find(s => s.id === slideId)
  if (!slide) return null
  if (field.startsWith('text:')) {
    const ti = Number(field.slice(5))
    if (!slide.texts[ti]) return null
    return { texts: slide.texts.map((c, i) => (i === ti ? { ...c, text: value } : c)) }
  }
  if (field.startsWith('badge:')) {
    const bi = Number(field.slice(6))
    if (!slide.badges?.[bi]) return null
    return { badges: slide.badges.map((b, i) => (i === bi ? { ...b, text: value } : b)) }
  }
  return null
}

/** Route an imported cell: source locale → base text, everything else → translation. */
export function buildImportPatch(
  slides: Slide[],
  slideId: string,
  field: FieldKey,
  locale: string,
  value: string,
  sourceLocale: string,
): Partial<Slide> | null {
  return locale === sourceLocale
    ? buildBasePatch(slides, slideId, field, value)
    : buildTranslationPatch(slides, slideId, field, locale, value)
}
