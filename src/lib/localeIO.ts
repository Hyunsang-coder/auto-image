// Import/export of translation tables as CSV or JSON. Pure string <-> data
// munging only — no store or React access — so it stays unit-testable. The
// LocalizeEditor builds the rows and applies parsed values back into the store.

export type LocaleFileFormat = 'csv' | 'json'

/** Identity columns written on export (everything else is a labeled language). */
const ID_COLUMNS = ['slide', 'slideId', 'field']
/** Columns ignored when collecting language columns on parse. `source` is a
 * legacy column from the old format — kept for reference, never routed. */
const RESERVED_COLUMNS = [...ID_COLUMNS, 'source']

export interface SerializeRow {
  slideId: string
  /** 0-based slide position; written 1-based as the `slide` column. */
  slideIndex: number
  /** Internal field key: 'headline' | 'subheadline' | 'badge:0' … */
  field: string
  sourceText: string
}

export interface ParsedRow {
  slideId?: string
  /** 1-based slide number as written in the file (matching fallback). */
  slide?: number
  field: string
  /** Locale code -> translation. Only columns present in the file appear. */
  values: Record<string, string>
}

export interface ParseResult {
  rows: ParsedRow[]
  localeColumns: string[]
  warnings: string[]
}

type GetCell = (slideId: string, field: string, locale: string) => string

export function serializeTemplate(
  format: LocaleFileFormat,
  rows: SerializeRow[],
  getCell: GetCell,
  sourceLocale: string,
  targetLocales: string[],
): string {
  // Every language is a labeled column. The source-locale column carries the
  // slide's base text; the rest carry translations.
  const locales = [sourceLocale, ...targetLocales]
  const cellFor = (r: SerializeRow, locale: string) =>
    locale === sourceLocale ? r.sourceText : getCell(r.slideId, r.field, locale)

  if (format === 'json') {
    return JSON.stringify(
      {
        sourceLocale,
        targetLocales,
        rows: rows.map(r => ({
          slide: r.slideIndex + 1,
          slideId: r.slideId,
          field: r.field,
          texts: Object.fromEntries(locales.map(l => [l, cellFor(r, l)])),
        })),
      },
      null,
      2,
    )
  }
  const header = [...ID_COLUMNS, ...locales]
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    const cells = [
      String(r.slideIndex + 1),
      r.slideId,
      r.field,
      ...locales.map(l => cellFor(r, l)),
    ]
    lines.push(cells.map(csvCell).join(','))
  }
  // BOM so Excel opens UTF-8 (Korean/CJK) correctly.
  return '﻿' + lines.join('\r\n')
}

/** A ready-to-paste prompt for translating the exported template in any AI
 * tool. We don't translate in-app (quality is low and users have their own
 * tools) — the value is the round-trip, so we hand them a prompt that fills
 * the template correctly and they re-import the result. */
export function buildTranslationPrompt(
  source: { code: string; label: string },
  targets: { code: string; label: string }[],
): string {
  const targetList = targets.map(t => `${t.label} (${t.code})`).join(', ')
  return [
    'You are translating App Store screenshot caption copy — short, punchy marketing text, not prose.',
    '',
    `Source language: ${source.label} (${source.code})`,
    `Translate into: ${targetList || '(no target languages selected)'}`,
    '',
    'A CSV or JSON translation template follows (pasted or attached). Each row is one caption field (headline / subheadline / badge).',
    'Rules:',
    `- Fill ONLY the empty target-language columns. Leave the ${source.code} column (the source) unchanged.`,
    '- Keep the slide, slideId, and field columns exactly as they are.',
    '- Translate for meaning and tone — natural, benefit-driven copy in each language, not word-for-word.',
    '- Keep each translation about as short as the source so it still fits the screenshot layout.',
    '- Return the COMPLETE file in the same format and structure, nothing else (no explanations, no code fences).',
  ].join('\n')
}

export function parseTemplate(text: string, format: LocaleFileFormat): ParseResult {
  return format === 'json' ? parseJsonTemplate(text) : parseCsvTemplate(text)
}

function parseJsonTemplate(text: string): ParseResult {
  const warnings: string[] = []
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return { rows: [], localeColumns: [], warnings: ['JSON 형식이 올바르지 않습니다'] }
  }
  const rawRows = (obj as { rows?: unknown })?.rows
  if (!Array.isArray(rawRows)) {
    return { rows: [], localeColumns: [], warnings: ['`rows` 배열을 찾을 수 없습니다'] }
  }
  const localeSet = new Set<string>()
  const rows: ParsedRow[] = []
  for (const raw of rawRows as Record<string, unknown>[]) {
    const field = typeof raw.field === 'string' ? raw.field : ''
    if (!field) {
      warnings.push('`field`가 없는 행을 건너뜀')
      continue
    }
    const values: Record<string, string> = {}
    // New format: `texts` maps every language (incl. source) → text. Fall back
    // to the legacy `translations` key (target locales only) for old files.
    const t = raw.texts && typeof raw.texts === 'object' ? raw.texts : raw.translations
    if (t && typeof t === 'object') {
      for (const [loc, v] of Object.entries(t as Record<string, unknown>)) {
        values[loc] = v == null ? '' : String(v)
        localeSet.add(loc)
      }
    }
    rows.push({
      slideId: typeof raw.slideId === 'string' ? raw.slideId : undefined,
      slide: typeof raw.slide === 'number' ? raw.slide : undefined,
      field,
      values,
    })
  }
  return { rows, localeColumns: [...localeSet], warnings }
}

function parseCsvTemplate(text: string): ParseResult {
  const grid = parseCsvGrid(text)
  if (grid.length === 0) return { rows: [], localeColumns: [], warnings: ['빈 파일입니다'] }
  const header = grid[0].map(h => h.trim())
  const fieldIdx = header.indexOf('field')
  if (fieldIdx < 0) {
    return { rows: [], localeColumns: [], warnings: ['`field` 열을 찾을 수 없습니다'] }
  }
  const slideIdx = header.indexOf('slide')
  const slideIdIdx = header.indexOf('slideId')
  const localeColumns = header.filter(h => h && !RESERVED_COLUMNS.includes(h))
  const rows: ParsedRow[] = []
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i]
    if (cells.every(c => c.trim() === '')) continue
    const field = (cells[fieldIdx] ?? '').trim()
    if (!field) continue
    const values: Record<string, string> = {}
    for (const loc of localeColumns) {
      values[loc] = cells[header.indexOf(loc)] ?? ''
    }
    const slideNum = slideIdx >= 0 ? Number((cells[slideIdx] ?? '').trim()) : NaN
    const slideId = slideIdIdx >= 0 ? (cells[slideIdIdx] ?? '').trim() : ''
    rows.push({
      slideId: slideId || undefined,
      slide: Number.isFinite(slideNum) ? slideNum : undefined,
      field,
      values,
    })
  }
  return { rows, localeColumns, warnings: [] }
}

/** RFC-4180-ish CSV tokenizer: handles quoted fields, escaped quotes, and
 * newlines inside quotes. Strips a leading UTF-8 BOM. */
function parseCsvGrid(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); grid.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); grid.push(row) }
  return grid
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}
