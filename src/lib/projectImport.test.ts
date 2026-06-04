import { describe, it, expect } from 'vitest'
import { buildProjectFromManifest, isManifestShaped, parseManifest } from './projectImport'
import { DEFAULT_BACKGROUND, THEME_PRESETS, headlinePlaceholder } from '../constants/defaults'

function minimal(extra: Record<string, unknown> = {}, slides: unknown[] = [{}]) {
  return JSON.stringify({ version: 1, name: 'Dogo', slides, ...extra })
}

describe('parseManifest fatals', () => {
  it('rejects broken JSON', () => {
    const r = parseManifest('{nope')
    expect(r.manifest).toBeNull()
    expect(r.issues).toHaveLength(1)
  })

  it('rejects a non-object root', () => {
    expect(parseManifest('[1,2]').manifest).toBeNull()
    expect(parseManifest('"x"').manifest).toBeNull()
  })

  it('rejects a wrong version', () => {
    const r = parseManifest(minimal({ version: 2 }))
    expect(r.manifest).toBeNull()
    expect(r.issues[0]).toContain('버전')
  })

  it('rejects a missing or blank name', () => {
    expect(parseManifest(JSON.stringify({ version: 1, slides: [{}] })).manifest).toBeNull()
    expect(parseManifest(minimal({ name: '  ' })).manifest).toBeNull()
  })

  it('rejects empty slides', () => {
    expect(parseManifest(minimal({}, [])).manifest).toBeNull()
    expect(parseManifest(JSON.stringify({ version: 1, name: 'x' })).manifest).toBeNull()
  })
})

describe('parseManifest normalization', () => {
  it('applies defaults for an all-defaults manifest', () => {
    const { manifest, issues } = parseManifest(minimal())
    expect(issues).toEqual([])
    expect(manifest).toEqual({
      name: 'Dogo',
      device: 'iphone',
      deviceModel: 'iphone-16-pro',
      sourceLocale: 'ko',
      targetLocales: [],
      themeBackground: DEFAULT_BACKGROUND,
      slides: [{ layout: 'text-top', textBlocks: 1, badges: 0, showDeviceFrame: true }],
    })
  })

  it('clamps slides to 10 with a warning', () => {
    const { manifest, issues } = parseManifest(minimal({}, Array.from({ length: 12 }, () => ({}))))
    expect(manifest?.slides).toHaveLength(10)
    expect(issues.some((i) => i.includes('최대 10장'))).toBe(true)
  })

  it('falls back on unknown device / mismatched deviceModel', () => {
    const r1 = parseManifest(minimal({ device: 'watch' }))
    expect(r1.manifest?.device).toBe('iphone')
    expect(r1.issues).toHaveLength(1)
    // an iPad model on an iphone project is rejected
    const r2 = parseManifest(minimal({ deviceModel: 'ipad-pro-13' }))
    expect(r2.manifest?.deviceModel).toBe('iphone-16-pro')
    expect(r2.issues).toHaveLength(1)
    // a valid pairing passes
    const r3 = parseManifest(minimal({ device: 'ipad', deviceModel: 'ipad-11' }))
    expect(r3.manifest?.deviceModel).toBe('ipad-11')
    expect(r3.issues).toEqual([])
  })

  it('drops unknown locales and dedupes/strips the source from targets', () => {
    const r = parseManifest(
      minimal({ sourceLocale: 'en', targetLocales: ['ko', 'xx', 'ko', 'en', 'ja'] }),
    )
    expect(r.manifest?.sourceLocale).toBe('en')
    expect(r.manifest?.targetLocales).toEqual(['ko', 'ja'])
    expect(r.issues.some((i) => i.includes('"xx"'))).toBe(true)
    const r2 = parseManifest(minimal({ sourceLocale: 'xx' }))
    expect(r2.manifest?.sourceLocale).toBe('ko')
  })

  it('resolves a theme preset id and rejects an unknown one', () => {
    const preset = THEME_PRESETS[0]
    const ok = parseManifest(minimal({ themeBackground: preset.id }))
    expect(ok.manifest?.themeBackground).toEqual(preset.background)
    const bad = parseManifest(minimal({ themeBackground: 'neon-void' }))
    expect(bad.manifest?.themeBackground).toEqual(DEFAULT_BACKGROUND)
    expect(bad.issues.some((i) => i.includes('프리셋'))).toBe(true)
  })

  it('accepts inline solid/gradient backgrounds, rejects image', () => {
    const solid = parseManifest(minimal({ themeBackground: { type: 'solid', color: '#112233' } }))
    expect(solid.manifest?.themeBackground).toEqual({ type: 'solid', color: '#112233' })
    const grad = parseManifest(
      minimal({
        themeBackground: {
          type: 'gradient',
          gradient: { direction: 90, stops: [{ color: '#000', position: 0 }, { color: '#fff', position: 1 }] },
        },
      }),
    )
    expect(grad.manifest?.themeBackground.type).toBe('gradient')
    const img = parseManifest(minimal({ themeBackground: { type: 'image', imageKey: 'img:x' } }))
    expect(img.manifest?.themeBackground).toEqual(DEFAULT_BACKGROUND)
    expect(img.issues.some((i) => i.includes('image 배경'))).toBe(true)
  })

  it('normalizes per-slide fields with warnings', () => {
    const { manifest, issues } = parseManifest(
      minimal({}, [
        { layout: 'mosaic', textBlocks: 9, badges: -1 },
        { layout: 'split', textBlocks: 2, badges: 1, deviceFrame: false },
      ]),
    )
    expect(manifest?.slides[0]).toEqual({
      layout: 'text-top',
      textBlocks: 1,
      badges: 0,
      showDeviceFrame: true,
    })
    expect(issues).toHaveLength(3)
    expect(manifest?.slides[1]).toEqual({
      layout: 'split',
      textBlocks: 2,
      badges: 1,
      showDeviceFrame: false,
    })
  })
})

describe('buildProjectFromManifest', () => {
  const base = () => parseManifest(
    minimal(
      { sourceLocale: 'en', targetLocales: ['ko', 'ja'], device: 'iphone', deviceModel: 'iphone-6-5' },
      [
        { layout: 'split', textBlocks: 2, badges: 1 },
        { layout: 'hero', deviceFrame: false, background: { type: 'solid', color: '#101010' } },
      ],
    ),
  ).manifest!

  it('carries project-level settings over makeProject defaults', () => {
    const p = buildProjectFromManifest(base())
    expect(p.name).toBe('Dogo')
    expect(p.devices).toEqual(['iphone'])
    expect(p.deviceModels).toEqual({ iphone: 'iphone-6-5' })
    expect(p.sourceLocale).toBe('en')
    expect(p.targetLocales).toEqual(['ko', 'ja'])
    expect(p.slides).toHaveLength(2)
    expect(p.slides[0].deviceFrame.model).toBe('iphone-6-5')
  })

  it('creates the declared text-block and badge slots', () => {
    const p = buildProjectFromManifest(base())
    expect(p.slides[0].texts).toHaveLength(2)
    expect(p.slides[0].texts[0].text).toBe(headlinePlaceholder('en'))
    expect(p.slides[0].texts[1].text).toBe('')
    expect(p.slides[0].badges).toHaveLength(1)
    expect(p.slides[1].texts).toHaveLength(1)
    expect(p.slides[1].badges).toHaveLength(0)
  })

  it('applies layout, per-slide background, and device-frame visibility', () => {
    const p = buildProjectFromManifest(base())
    expect(p.slides[0].template).toBe('split')
    expect(p.slides[0].deviceFrame.show).toBe(true)
    expect(p.slides[1].template).toBe('hero')
    expect(p.slides[1].deviceFrame.show).toBe(false)
    expect(p.slides[1].background).toEqual({ type: 'solid', color: '#101010' })
    expect(p.slides[0].background).toEqual(DEFAULT_BACKGROUND)
  })
})

describe('isManifestShaped', () => {
  it('distinguishes a manifest from a caption template JSON', () => {
    expect(isManifestShaped({ version: 1, slides: [] })).toBe(true)
    expect(isManifestShaped({ rows: [], sourceLocale: 'ko' })).toBe(false)
    expect(isManifestShaped(null)).toBe(false)
    expect(isManifestShaped([])).toBe(false)
  })
})
