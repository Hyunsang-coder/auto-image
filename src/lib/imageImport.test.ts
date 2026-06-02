import { describe, it, expect } from 'vitest'
import { parseImageName, buildImageNamingGuide } from './imageImport'

const known = new Set(['en', 'ja', 'de', 'zh-Hans', 'zh-Hant', 'pt-BR'])

describe('parseImageName', () => {
  it('parses a per-locale name', () => {
    expect(parseImageName('2.ja.png', known)).toEqual({ slide: 2, locale: 'ja' })
  })

  it('handles hyphenated locale codes', () => {
    expect(parseImageName('3.zh-Hans.png', known)).toEqual({ slide: 3, locale: 'zh-Hans' })
    expect(parseImageName('4.pt-BR.jpg', known)).toEqual({ slide: 4, locale: 'pt-BR' })
  })

  it('strips a leading directory path', () => {
    expect(parseImageName('shots/5.en.png', known)).toEqual({ slide: 5, locale: 'en' })
  })

  it('accepts a descriptive suffix after the slide number', () => {
    expect(parseImageName('01-home.en.png', known)).toEqual({ slide: 1, locale: 'en' })
    expect(parseImageName('02-add-pdf.de.png', known)).toEqual({ slide: 2, locale: 'de' })
    expect(parseImageName('06-dashboard.zh-Hant.png', known)).toEqual({ slide: 6, locale: 'zh-Hant' })
  })

  it('requires a locale suffix', () => {
    expect(parseImageName('1.png', known)).toEqual({ error: expect.stringContaining('언어 접미사') })
    expect(parseImageName('01-home.png', known)).toEqual({ error: expect.stringContaining('언어 접미사') })
  })

  it('rejects an unknown locale', () => {
    expect(parseImageName('1.xx.png', known)).toEqual({ error: expect.stringContaining('xx') })
  })

  it('rejects a non-numeric slide', () => {
    expect(parseImageName('cover.png', known)).toEqual({ error: expect.stringContaining('cover') })
    expect(parseImageName('0.en.png', known)).toEqual({ error: expect.stringContaining('0') })
  })
})

describe('buildImageNamingGuide', () => {
  it('builds project-specific examples with the source as base', () => {
    const guide = buildImageNamingGuide(
      { code: 'ko', label: '한국어' },
      [{ code: 'en', label: 'English' }, { code: 'ja', label: '日本語' }],
    )
    expect(guide).toContain('1.ko.png(베이스)')
    expect(guide).toContain('1.en.png')
    expect(guide).toContain('1.ja.png')
    expect(guide).toContain('원본 언어(한국어, ko)')
  })
})
