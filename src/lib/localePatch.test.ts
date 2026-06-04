import { describe, it, expect } from 'vitest'
import { applyCaptionRows, buildImportPatch, buildTranslationPatch } from './localePatch'
import type { Slide } from '../types/project'

// Minimal slide — only the fields the patch builders touch.
function makeSlide(): Slide {
  return {
    id: 's1',
    texts: [
      { text: 'base head', translations: {} },
      { text: 'base sub', translations: {} },
    ],
    badges: [{ id: 'b0', text: 'base badge', translations: {} }],
  } as unknown as Slide
}

describe('buildImportPatch routing by sourceLocale', () => {
  it('writes a non-source locale into translations, leaving base text intact', () => {
    const patch = buildImportPatch([makeSlide()], 's1', 'text:0', 'ja', '日本語', 'en')
    expect(patch).toEqual({
      texts: [
        { text: 'base head', translations: { ja: '日本語' } },
        { text: 'base sub', translations: {} },
      ],
    })
  })

  it('writes the source locale into base .text, not translations', () => {
    const patch = buildImportPatch([makeSlide()], 's1', 'text:0', 'en', 'New head', 'en')
    expect(patch).toEqual({
      texts: [
        { text: 'New head', translations: {} },
        { text: 'base sub', translations: {} },
      ],
    })
  })

  it('targets the right text block by index (text:1)', () => {
    const patch = buildTranslationPatch([makeSlide()], 's1', 'text:1', 'ja', 'サブ')
    expect(patch).toEqual({
      texts: [
        { text: 'base head', translations: {} },
        { text: 'base sub', translations: { ja: 'サブ' } },
      ],
    })
  })

  it('returns null for an out-of-range text index', () => {
    expect(buildTranslationPatch([makeSlide()], 's1', 'text:9', 'ja', 'x')).toBeNull()
    expect(buildImportPatch([makeSlide()], 's1', 'text:9', 'en', 'x', 'en')).toBeNull()
  })

  it('routes the same value to a different place when the source locale flips', () => {
    // Same file column "en". When the project source is en → it's the base.
    // When the project source is ko → "en" is just another translation.
    const asSource = buildImportPatch([makeSlide()], 's1', 'text:0', 'en', 'X', 'en')
    const asTarget = buildImportPatch([makeSlide()], 's1', 'text:0', 'en', 'X', 'ko')
    expect(asSource?.texts?.[0]).toEqual({ text: 'X', translations: {} })
    expect(asTarget?.texts?.[0]).toEqual({ text: 'base head', translations: { en: 'X' } })
  })

  it('routes badges to base text vs translations the same way', () => {
    const base = buildImportPatch([makeSlide()], 's1', 'badge:0', 'ko', '배지', 'ko')
    expect(base).toEqual({ badges: [{ id: 'b0', text: '배지', translations: {} }] })
    const tr = buildImportPatch([makeSlide()], 's1', 'badge:0', 'ja', 'バッジ', 'ko')
    expect(tr).toEqual({ badges: [{ id: 'b0', text: 'base badge', translations: { ja: 'バッジ' } }] })
  })
})

describe('applyCaptionRows', () => {
  const known = new Set(['en', 'ko', 'ja'])

  it('stacks multiple cells on one slide and reports counts', () => {
    const res = applyCaptionRows(
      [makeSlide()],
      [
        { slideId: 's1', field: 'text:0', values: { en: 'Head', ja: '見出し' } },
        { slide: 1, field: 'badge:0', values: { en: 'New', ko: '' } },
      ],
      'en',
      known,
    )
    expect(res.written).toBe(3)
    expect(res.baseWritten).toBe(2)
    expect(res.localesSeen).toEqual(['ja'])
    expect(res.issues).toEqual([])
    expect(res.patches.s1.texts?.[0]).toEqual({ text: 'Head', translations: { ja: '見出し' } })
    expect(res.patches.s1.badges?.[0]).toEqual({ id: 'b0', text: 'New', translations: {} })
  })

  it('matches by slideId first, then 1-based index', () => {
    const res = applyCaptionRows(
      [makeSlide()],
      [{ slideId: 'missing', slide: 1, field: 'text:0', values: { en: 'X' } }],
      'en',
      known,
    )
    expect(res.written).toBe(1)
  })

  it('skips rows whose slide or field slot does not exist', () => {
    const res = applyCaptionRows(
      [makeSlide()],
      [
        { slide: 9, field: 'text:0', values: { en: 'X' } },
        { slide: 1, field: 'text:5', values: { en: 'X' } },
      ],
      'en',
      known,
    )
    expect(res.written).toBe(0)
    expect(res.skippedRows).toBe(2)
    expect(res.issues).toEqual(['2행 건너뜀 (슬라이드 또는 필드 없음)'])
    expect(res.patches).toEqual({})
  })

  it('warns on unknown locales and ignores empty cells', () => {
    const res = applyCaptionRows(
      [makeSlide()],
      [{ slide: 1, field: 'text:0', values: { xx: 'X', en: '' } }],
      'en',
      known,
    )
    expect(res.written).toBe(0)
    expect(res.issues).toEqual(['지원하지 않는 언어 "xx"'])
  })

  it('a row addressed to a span follower index writes the follower, not the leader', () => {
    // Span pair: texts are per-slide, so the follower's 1-based row must land
    // on its own caption array (pre-change it landed on dead data).
    const leader = { ...makeSlide(), id: 'lead', spanGroupId: 'g', spanRole: 'leader' as const }
    const follower = {
      ...makeSlide(),
      id: 'foll',
      spanGroupId: 'g',
      spanRole: 'follower' as const,
      texts: [{ text: 'right head', translations: {} }],
    }
    const res = applyCaptionRows(
      [leader, follower] as never,
      [{ slide: 2, field: 'text:0', values: { ja: '右ページ' } }],
      'en',
      known,
    )
    expect(res.written).toBe(1)
    expect(res.patches.foll.texts?.[0]).toEqual({ text: 'right head', translations: { ja: '右ページ' } })
    expect(res.patches.lead).toBeUndefined()
  })
})
