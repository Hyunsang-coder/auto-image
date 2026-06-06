// Pure builders that turn a single (slide, field, locale, value) cell into a
// store patch. No store/React deps so the import routing stays unit-testable.
// A target-locale value lands in `translations[locale]`; a source-locale value
// lands in the slide's base `.text` — which language is the source is the app's
// `project.sourceLocale` setting, so the same file imports differently when the
// user flips the source language.

import type { Slide } from '../types/project'
import { t } from '../i18n'
import type { ParsedRow } from './localeIO'

export type FieldKey = 'image' | `text:${number}` | `badge:${number}`

export interface CaptionApplyResult {
  /** Final texts/badges per touched slide — feed to updateSlides or fold into a detached array. */
  patches: Record<string, Partial<Slide>>
  written: number
  baseWritten: number
  skippedRows: number
  /** Non-source locales that received values (caller may add them to targetLocales). */
  localesSeen: string[]
  issues: string[]
}

/**
 * Apply parsed localize-template rows onto a slide array. Matching: slideId
 * first, then the 1-based `slide` index. A row whose text/badge slot doesn't
 * exist is skipped (counted), empty cells are ignored, unknown locales warn.
 * Cells compose onto a working copy so multi-row writes to one slide stack.
 */
export function applyCaptionRows(
  slides: Slide[],
  rows: ParsedRow[],
  sourceLocale: string,
  knownLocales: Set<string>,
): CaptionApplyResult {
  let work = slides
  const touched = new Set<string>()
  const localesSeen = new Set<string>()
  const issues: string[] = []
  let written = 0
  let baseWritten = 0
  let skippedRows = 0
  for (const row of rows) {
    const slide =
      (row.slideId && work.find(s => s.id === row.slideId)) ||
      (row.slide != null ? work[row.slide - 1] : undefined)
    if (!slide) {
      skippedRows++
      continue
    }
    const fieldOk =
      (row.field.startsWith('text:') && !!slide.texts[Number(row.field.slice(5))]) ||
      (row.field.startsWith('badge:') && !!slide.badges?.[Number(row.field.slice(6))])
    if (!fieldOk) {
      skippedRows++
      continue
    }
    for (const [locale, value] of Object.entries(row.values)) {
      if (!value) continue
      if (!knownLocales.has(locale)) {
        issues.push(t('지원하지 않는 언어 "{locale}"', { locale }))
        continue
      }
      const patch = buildImportPatch(work, slide.id, row.field as FieldKey, locale, value, sourceLocale)
      if (!patch) continue
      work = work.map(s => (s.id === slide.id ? { ...s, ...patch } : s))
      touched.add(slide.id)
      if (locale === sourceLocale) baseWritten++
      else localesSeen.add(locale)
      written++
    }
  }
  if (skippedRows > 0) issues.push(t('{n}행 건너뜀 (슬라이드 또는 필드 없음)', { n: skippedRows }))
  const patches: Record<string, Partial<Slide>> = {}
  for (const id of touched) {
    const s = work.find(w => w.id === id)!
    patches[id] = { texts: s.texts, badges: s.badges }
  }
  return { patches, written, baseWritten, skippedRows, localesSeen: [...localesSeen], issues }
}

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
