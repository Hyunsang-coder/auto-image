import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, ascExportCode, makeSlide } from './defaults'

describe('ascExportCode — App Store Connect export folder codes', () => {
  it('canonicalizes bare codes that differ from ASC', () => {
    expect(ascExportCode('en')).toBe('en-US')
    expect(ascExportCode('es')).toBe('es-ES')
    expect(ascExportCode('fr')).toBe('fr-FR')
    expect(ascExportCode('de')).toBe('de-DE')
  })

  it('passes through codes that already match ASC', () => {
    for (const code of ['ko', 'ja', 'pt-BR', 'it', 'es-MX']) {
      expect(ascExportCode(code)).toBe(code)
    }
  })

  it('never maps two in-app locales to the same export folder', () => {
    const dirs = SUPPORTED_LOCALES.map(l => ascExportCode(l.code))
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  it('is scoped to the ASO seed-locale set (no Chinese/Thai/etc.)', () => {
    const codes = SUPPORTED_LOCALES.map(l => l.code)
    expect(codes).toContain('es-MX')
    for (const dropped of ['zh-Hans', 'zh-Hant', 'pl', 'th', 'id', 'vi', 'tr']) {
      expect(codes).not.toContain(dropped)
    }
  })
})

describe('makeSlide', () => {
  it('starts with exactly one text block (the title)', () => {
    const slide = makeSlide(0)
    expect(slide.texts).toHaveLength(1)
    expect(slide.texts[0].text).toBe('당신의 헤드라인')
  })
})
