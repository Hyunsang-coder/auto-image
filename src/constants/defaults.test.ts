import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, ascExportCode } from './defaults'

describe('ascExportCode — App Store Connect export folder codes', () => {
  it('canonicalizes bare codes that differ from ASC', () => {
    expect(ascExportCode('en')).toBe('en-US')
    expect(ascExportCode('es')).toBe('es-ES')
    expect(ascExportCode('fr')).toBe('fr-FR')
    expect(ascExportCode('de')).toBe('de-DE')
  })

  it('passes through codes that already match ASC', () => {
    for (const code of ['ko', 'ja', 'zh-Hans', 'zh-Hant', 'pt-BR', 'it', 'pl', 'th', 'id', 'vi', 'tr', 'es-MX']) {
      expect(ascExportCode(code)).toBe(code)
    }
  })

  it('never maps two in-app locales to the same export folder', () => {
    const dirs = SUPPORTED_LOCALES.map(l => ascExportCode(l.code))
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  it('includes the newly added Turkish and Mexican Spanish locales', () => {
    const codes = SUPPORTED_LOCALES.map(l => l.code)
    expect(codes).toContain('tr')
    expect(codes).toContain('es-MX')
  })
})
