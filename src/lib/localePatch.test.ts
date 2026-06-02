import { describe, it, expect } from 'vitest'
import { buildImportPatch, buildTranslationPatch } from './localePatch'
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
