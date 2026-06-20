import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_LOCALES,
  THEME_PRESETS,
  ascExportCode,
  badgePlaceholder,
  headlinePlaceholder,
  makeBadge,
  makeSlide,
  presetFromSlide,
  relocalizePlaceholder,
  themePresetPatch,
} from './defaults'
import type { Slide } from '../types/project'

describe('ascExportCode — App Store Connect export folder codes', () => {
  it('canonicalizes bare codes that differ from ASC', () => {
    expect(ascExportCode('en')).toBe('en-US')
    expect(ascExportCode('es')).toBe('es-ES')
    expect(ascExportCode('fr')).toBe('fr-FR')
    expect(ascExportCode('de')).toBe('de-DE')
  })

  it('passes through codes that already match ASC', () => {
    for (const code of ['ko', 'ja', 'pt-BR', 'it', 'es-MX', 'vi', 'id', 'th']) {
      expect(ascExportCode(code)).toBe(code)
    }
  })

  it('never maps two in-app locales to the same export folder', () => {
    const dirs = SUPPORTED_LOCALES.map(l => ascExportCode(l.code))
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  it('includes the ASO seed-locale set and Southeast Asian locales', () => {
    const codes = SUPPORTED_LOCALES.map(l => l.code)
    expect(codes).toContain('es-MX')
    for (const added of ['vi', 'id', 'th']) {
      expect(codes).toContain(added)
    }
    for (const dropped of ['zh-Hans', 'zh-Hant', 'pl', 'tr']) {
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

  it('seeds the headline in the given source locale', () => {
    expect(makeSlide(0, 'iphone', undefined, 'ja').texts[0].text).toBe('あなたの見出し')
  })
})

describe('themePresetPatch', () => {
  function slideWithBadge(): Slide {
    const s = makeSlide(0)
    s.badges = [makeBadge()]
    return s
  }

  it('recolors badges to the preset accent with a readable label', () => {
    const preset = THEME_PRESETS.find((p) => p.id === 'sage')!
    const patch = themePresetPatch(slideWithBadge(), preset)
    expect(patch.badges?.[0].style.backgroundColor).toBe(preset.accentColor)
    expect(['#FFFFFF', '#1C1C24']).toContain(patch.badges?.[0].style.textColor)
    expect(patch.texts?.[0].style.color).toBe(preset.headlineColor)
    expect(patch.background).toEqual(preset.background)
  })

  it('round-trips: presetFromSlide captures the accent the patch applied', () => {
    const preset = THEME_PRESETS.find((p) => p.id === 'blush')!
    const slide = { ...slideWithBadge(), ...themePresetPatch(slideWithBadge(), preset) } as Slide
    expect(presetFromSlide(slide, 'x').accentColor).toBe(preset.accentColor)
  })
})

describe('placeholder copy', () => {
  it('covers every supported locale without falling back to English', () => {
    for (const { code } of SUPPORTED_LOCALES) {
      if (code === 'en') continue
      // es/es-MX intentionally share copy; what matters is no Korean/English leak.
      expect(headlinePlaceholder(code)).not.toBe(headlinePlaceholder('en'))
      expect(badgePlaceholder(code)).not.toBe(badgePlaceholder('en'))
    }
  })

  it('relocalizes between any two supported locales and round-trips', () => {
    for (const { code } of SUPPORTED_LOCALES) {
      const there = relocalizePlaceholder(headlinePlaceholder('ko'), 'ko', code)
      expect(there).toBe(headlinePlaceholder(code))
      expect(relocalizePlaceholder(there, code, 'ko')).toBe(headlinePlaceholder('ko'))
    }
  })

  it('passes user-written text through unchanged', () => {
    expect(relocalizePlaceholder('내가 쓴 카피', 'ko', 'en')).toBe('내가 쓴 카피')
  })
})
