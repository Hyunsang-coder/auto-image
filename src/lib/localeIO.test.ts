import { describe, it, expect } from 'vitest'
import { serializeTemplate, parseTemplate, type SerializeRow } from './localeIO'

const ROWS: SerializeRow[] = [
  { slideId: 's1', slideIndex: 0, field: 'headline', sourceText: 'Track your day' },
  { slideId: 's1', slideIndex: 0, field: 'subheadline', sourceText: 'Simple, fast' },
  { slideId: 's2', slideIndex: 1, field: 'badge:0', sourceText: 'New' },
]

// Existing translations: ja filled for the headline only.
const cells: Record<string, string> = { 's1|headline|ja': '一日を記録' }
const getCell = (id: string, f: string, l: string) => cells[`${id}|${f}|${l}`] ?? ''

describe('serializeTemplate / parseTemplate round-trip', () => {
  for (const format of ['csv', 'json'] as const) {
    it(`${format}: round-trips slideId, field, and translations`, () => {
      const text = serializeTemplate(format, ROWS, getCell, 'en', ['ja', 'ko'])
      const { rows, warnings } = parseTemplate(text, format)
      expect(warnings).toEqual([])
      expect(rows).toHaveLength(3)
      expect(rows[0]).toMatchObject({ slideId: 's1', slide: 1, field: 'headline' })
      expect(rows[0].values.ja).toBe('一日を記録')
      expect(rows[0].values.ko).toBe('')
      expect(rows[2]).toMatchObject({ slideId: 's2', slide: 2, field: 'badge:0' })
    })
  }
})

describe('csv parsing', () => {
  it('handles quoted commas, newlines, and escaped quotes', () => {
    const text = serializeTemplate(
      'csv',
      [{ slideId: 's1', slideIndex: 0, field: 'headline', sourceText: 'a, "b"\nc' }],
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

  it('treats source as reserved, not a locale column', () => {
    const text = serializeTemplate('csv', ROWS, getCell, 'en', ['ko'])
    const { localeColumns } = parseTemplate(text, 'csv')
    expect(localeColumns).toEqual(['ko'])
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
})
