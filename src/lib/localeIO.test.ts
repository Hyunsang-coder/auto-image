import { describe, it, expect } from 'vitest'
import { serializeTemplate, parseTemplate, buildTranslationPrompt, type SerializeRow } from './localeIO'

const ROWS: SerializeRow[] = [
  { slideId: 's1', slideIndex: 0, field: 'text:0', sourceText: 'Track your day' },
  { slideId: 's1', slideIndex: 0, field: 'text:1', sourceText: 'Simple, fast' },
  { slideId: 's2', slideIndex: 1, field: 'badge:0', sourceText: 'New' },
]

// Existing translations: ja filled for the title block only.
const cells: Record<string, string> = { 's1|text:0|ja': '一日を記録' }
const getCell = (id: string, f: string, l: string) => cells[`${id}|${f}|${l}`] ?? ''

describe('serializeTemplate / parseTemplate round-trip', () => {
  for (const format of ['csv', 'json'] as const) {
    it(`${format}: round-trips slideId, field, source text, and translations`, () => {
      const text = serializeTemplate(format, ROWS, getCell, 'en', ['ja', 'ko'])
      const { rows, warnings } = parseTemplate(text, format)
      expect(warnings).toEqual([])
      expect(rows).toHaveLength(3)
      expect(rows[0]).toMatchObject({ slideId: 's1', slide: 1, field: 'text:0' })
      // Source locale ('en') is a labeled column carrying the base text.
      expect(rows[0].values.en).toBe('Track your day')
      expect(rows[0].values.ja).toBe('一日を記録')
      expect(rows[0].values.ko).toBe('')
      expect(rows[2]).toMatchObject({ slideId: 's2', slide: 2, field: 'badge:0' })
    })
  }
})

describe('buildTranslationPrompt', () => {
  it('names the source and every target language by label and code', () => {
    const prompt = buildTranslationPrompt(
      { code: 'en', label: 'English' },
      [{ code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' }],
    )
    expect(prompt).toContain('Source language: English (en)')
    expect(prompt).toContain('日本語 (ja), 한국어 (ko)')
    // Must tell the model to leave the source column untouched.
    expect(prompt).toContain('Leave the en column')
  })

  it('handles no target languages without crashing', () => {
    const prompt = buildTranslationPrompt({ code: 'en', label: 'English' }, [])
    expect(prompt).toContain('(no target languages selected)')
  })
})

describe('csv parsing', () => {
  it('handles quoted commas, newlines, and escaped quotes', () => {
    const text = serializeTemplate(
      'csv',
      [{ slideId: 's1', slideIndex: 0, field: 'text:0', sourceText: 'a, "b"\nc' }],
      () => 'val, "x"',
      'en',
      ['ko'],
    )
    const { rows } = parseTemplate(text, 'csv')
    expect(rows[0].values.ko).toBe('val, "x"')
  })

  it('reports a missing field column', () => {
    const { rows, warnings } = parseTemplate('slide,slideId,ko\n1,s1,foo', 'csv')
    expect(rows).toHaveLength(0)
    expect(warnings[0]).toContain('field')
  })

  it('skips fully blank rows', () => {
    const text = 'slide,slideId,field,source,ko\n1,s1,headline,Hi,안녕\n,,,,\n'
    const { rows } = parseTemplate(text, 'csv')
    expect(rows).toHaveLength(1)
  })

  it('ignores a legacy `source` column but keeps every language column', () => {
    // A re-imported old-format file still works: `source` is dropped, `ko` kept.
    const text = 'slide,slideId,field,source,ko\n1,s1,headline,Hi,안녕'
    const { rows, localeColumns } = parseTemplate(text, 'csv')
    expect(localeColumns).toEqual(['ko'])
    expect(rows[0].values).not.toHaveProperty('source')
    expect(rows[0].values.ko).toBe('안녕')
  })

  it('exports the source locale as a labeled column, not a special `source`', () => {
    const text = serializeTemplate('csv', ROWS, getCell, 'en', ['ko'])
    const header = text.replace(/^\uFEFF/, '').split('\r\n')[0]
    expect(header).toBe('slide,slideId,field,en,ko')
    const { localeColumns } = parseTemplate(text, 'csv')
    expect(localeColumns).toEqual(['en', 'ko'])
  })
})

describe('json parsing', () => {
  it('reports invalid json', () => {
    const { warnings } = parseTemplate('{not json', 'json')
    expect(warnings[0]).toContain('JSON')
  })

  it('reports a missing rows array', () => {
    const { warnings } = parseTemplate('{"sourceLocale":"en"}', 'json')
    expect(warnings[0]).toContain('rows')
  })

  it('skips rows without a field', () => {
    const text = JSON.stringify({ rows: [{ slideId: 's1', translations: { ko: 'x' } }] })
    const { rows, warnings } = parseTemplate(text, 'json')
    expect(rows).toHaveLength(0)
    expect(warnings).toHaveLength(1)
  })

  it('reads the new `texts` language map', () => {
    const text = JSON.stringify({
      rows: [{ slideId: 's1', field: 'headline', texts: { en: 'Hi', ko: '안녕' } }],
    })
    const { rows } = parseTemplate(text, 'json')
    expect(rows[0].values).toEqual({ en: 'Hi', ko: '안녕' })
  })

  it('falls back to a legacy `translations` map when `texts` is absent', () => {
    const text = JSON.stringify({
      rows: [{ slideId: 's1', field: 'headline', source: 'Hi', translations: { ko: '안녕' } }],
    })
    const { rows } = parseTemplate(text, 'json')
    expect(rows[0].values).toEqual({ ko: '안녕' })
  })
})
