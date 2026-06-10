import { describe, it, expect } from 'vitest'
import { buildProjectFromManifest, isManifestShaped, parseManifest } from './projectImport'
import { DEFAULT_BACKGROUND, THEME_PRESETS, headlinePlaceholder } from '../constants/defaults'
import { getDeviceDimensions, getDeviceLayout } from '../canvas/templateLayouts'
import { DEVICE_SPECS, EDITOR_CANVAS_WIDTH } from '../constants/deviceSpecs'

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
      slides: [{ layout: 'text-top', textBlocks: 1, deviceFrame: { show: true } }],
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
        { layout: 'mosaic', textBlocks: 9 },
        { layout: 'split', textBlocks: 2, deviceFrame: false },
      ]),
    )
    expect(manifest?.slides[0]).toEqual({
      layout: 'text-top',
      textBlocks: 1,
      deviceFrame: { show: true },
    })
    expect(issues).toHaveLength(2)
    expect(manifest?.slides[1]).toEqual({
      layout: 'split',
      textBlocks: 2,
      deviceFrame: { show: false },
    })
  })

  it('parses the object-form deviceFrame with transform fields', () => {
    const { manifest, issues } = parseManifest(
      minimal({}, [
        { deviceFrame: { show: false, offsetX: 30, offsetY: -20, scale: 1.2, rotation: -8, color: 'silver' } },
      ]),
    )
    expect(issues).toEqual([])
    expect(manifest?.slides[0].deviceFrame).toEqual({
      show: false,
      offsetX: 30,
      offsetY: -20,
      scale: 1.2,
      rotation: -8,
      color: 'silver',
    })
  })

  it('clamps deviceFrame transform values to the editor ranges with warnings', () => {
    const { manifest, issues } = parseManifest(
      minimal({}, [{ deviceFrame: { scale: 5, offsetX: 9999, rotation: 350, color: 'gold' } }]),
    )
    const f = manifest?.slides[0].deviceFrame
    expect(f?.scale).toBe(2.0)
    expect(f?.offsetX).toBe(400)
    expect(f?.rotation).toBe(-10) // 350° normalizes, not clamps
    expect(f?.color).toBeUndefined()
    expect(issues.length).toBe(3) // scale + offsetX clamped, color rejected
  })

  it('parses and clamps screenshotStyle', () => {
    const { manifest, issues } = parseManifest(
      minimal({}, [
        {
          deviceFrame: false,
          screenshotStyle: { cornerRadiusRatio: 0.3, shadow: false, crop: { bottom: 0.7 } },
        },
      ]),
    )
    expect(manifest?.slides[0].screenshotStyle).toEqual({
      cornerRadiusRatio: 0.2,
      shadow: false,
      crop: { top: 0, right: 0, bottom: 0.5, left: 0 },
    })
    expect(issues.length).toBe(2) // ratio + crop.bottom clamped
  })

  it('parses ornaments, skips unknown shapes, and caps the count', () => {
    const six = Array.from({ length: 6 }, () => ({ shape: 'star' }))
    const capped = parseManifest(minimal({}, [{ ornaments: six }]))
    expect(capped.manifest?.slides[0].ornaments).toHaveLength(5)
    expect(capped.issues.some((i) => i.includes('최대 5개'))).toBe(true)

    const { manifest, issues } = parseManifest(
      minimal({}, [
        { ornaments: [{ shape: 'sparkles', x: 0.9, y: 0.1, size: 0.12, opacity: 0.8 }, { shape: 'unicorn' }] },
      ]),
    )
    expect(manifest?.slides[0].ornaments).toEqual([
      { shape: 'sparkles', x: 0.9, y: 0.1, size: 0.12, opacity: 0.8 },
    ])
    expect(issues.some((i) => i.includes('"unicorn"'))).toBe(true)
  })

  it('parses per-block text overrides with clamps and sub-objects', () => {
    const { manifest, issues } = parseManifest(
      minimal({}, [
        {
          textBlocks: 2,
          texts: [
            {
              fontScale: 1.3,
              color: '#FFFFFF',
              align: 'left',
              weight: 800,
              pos: { x: 0.2, y: 0.18 },
              boxWidth: 0.7,
              box: { fill: '#000000', opacity: 0.5 },
              outline: { color: '#000', width: 3 },
              shadow: { color: '#000', offsetY: 4 },
            },
            { fontSize: 999 }, // clamps to 200
          ],
        },
      ]),
    )
    const tx = manifest?.slides[0].texts
    expect(tx?.[0]).toEqual({
      fontScale: 1.3,
      color: '#FFFFFF',
      align: 'left',
      weight: 800,
      pos: { x: 0.2, y: 0.18 },
      boxWidth: 0.7,
      box: { fill: '#000000', opacity: 0.5, paddingX: 16, paddingY: 10, borderRadius: 12 },
      outline: { color: '#000', width: 3 },
      shadow: { color: '#000', opacity: 0.4, offsetX: 0, offsetY: 4, blur: 6 },
    })
    expect(tx?.[1]).toEqual({ fontSize: 200 })
    expect(issues.some((i) => i.includes('fontSize'))).toBe(true)
  })

  it('warns on non-array texts and bad fields but keeps index alignment', () => {
    const { manifest, issues } = parseManifest(minimal({}, [{ texts: { fontSize: 40 } }]))
    expect(manifest?.slides[0].texts).toBeUndefined()
    expect(issues.some((i) => i.includes('texts는 배열'))).toBe(true)

    const r = parseManifest(
      minimal({}, [
        { textBlocks: 2, texts: [{ align: 'sideways', box: { opacity: 0.5 } }, { fontScale: 1.1 }] },
      ]),
    )
    // slot 0: align rejected + box dropped (no fill) → empty override, slot 1 kept
    expect(r.manifest?.slides[0].texts).toEqual([{}, { fontScale: 1.1 }])
    expect(r.issues.some((i) => i.includes('align'))).toBe(true)
    expect(r.issues.some((i) => i.includes('box.fill'))).toBe(true)
  })

  it('parses highlights, fills defaults, clamps, and caps the count', () => {
    const { manifest, issues } = parseManifest(
      minimal({}, [
        {
          highlights: [
            { sourceRegion: { x: 0.2, y: 0.3, w: 0.5, h: 0.2 }, popup: { width: 0.9, rotation: -8 } },
            { popup: { width: 5 } }, // width clamps to 1.5, region → defaults
          ],
        },
      ]),
    )
    const hl = manifest?.slides[0].highlights
    expect(hl?.[0]).toEqual({
      sourceRegion: { x: 0.2, y: 0.3, w: 0.5, h: 0.2 },
      popup: { width: 0.9, rotation: -8 },
    })
    expect(hl?.[1]).toEqual({
      sourceRegion: { x: 0.08, y: 0.42, w: 0.84, h: 0.18 },
      popup: { width: 1.5 },
    })
    expect(issues.some((i) => i.includes('popup.width'))).toBe(true)

    const capped = parseManifest(
      minimal({}, [{ highlights: Array.from({ length: 4 }, () => ({})) }]),
    )
    expect(capped.manifest?.slides[0].highlights).toHaveLength(3)
    expect(capped.issues.some((i) => i.includes('최대 3개'))).toBe(true)

    const bad = parseManifest(minimal({}, [{ highlights: { width: 0.5 } }]))
    expect(bad.manifest?.slides[0].highlights).toBeUndefined()
    expect(bad.issues.some((i) => i.includes('highlights는 배열'))).toBe(true)
  })
})

describe('buildProjectFromManifest', () => {
  const base = () => parseManifest(
    minimal(
      { sourceLocale: 'en', targetLocales: ['ko', 'ja'], device: 'iphone', deviceModel: 'iphone-6-5' },
      [
        { layout: 'split', textBlocks: 2 },
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

  it('creates the declared text-block slots and no badges (text+image only)', () => {
    const p = buildProjectFromManifest(base())
    expect(p.slides[0].texts).toHaveLength(2)
    expect(p.slides[0].texts[0].text).toBe(headlinePlaceholder('en'))
    expect(p.slides[0].texts[1].text).toBe('')
    expect(p.slides[0].badges).toHaveLength(0)
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

  it('applies manifest device transform onto the factory deviceFrame', () => {
    const m = parseManifest(
      minimal({}, [{ deviceFrame: { offsetX: 24, offsetY: -16, scale: 1.1, rotation: 8, color: 'silver' } }]),
    ).manifest!
    const f = buildProjectFromManifest(m).slides[0].deviceFrame
    expect(f.show).toBe(true)
    expect(f.offsetX).toBe(24)
    expect(f.offsetY).toBe(-16)
    expect(f.scale).toBe(1.1)
    expect(f.rotation).toBe(8)
    expect(f.color).toBe('silver')
    expect(f.model).toBe('iphone-16-pro') // factory field untouched
  })

  it('lets an explicit manifest scale override the text-bottom auto-seed', () => {
    const m = parseManifest(
      minimal({}, [{ layout: 'text-bottom', deviceFrame: { scale: 0.7 } }, { layout: 'text-bottom' }]),
    ).manifest!
    const p = buildProjectFromManifest(m)
    expect(p.slides[0].deviceFrame.scale).toBe(0.7)
    expect(p.slides[1].deviceFrame.scale).toBe(0.85)
  })

  it('drops the headline to an absolute position via textY', () => {
    const m = parseManifest(
      minimal({}, [{ textY: 0.2 }, { textX: 0.3, textY: 0.5 }, {}]),
    ).manifest!
    const p = buildProjectFromManifest(m)
    expect(p.slides[0].texts[0].pos).toEqual({ x: 0.5, y: 0.2 })
    expect(p.slides[1].texts[0].pos).toEqual({ x: 0.3, y: 0.5 })
    // no textY → no absolute pos (stacks from the layout default)
    expect(p.slides[2].texts[0].pos).toBeUndefined()
  })

  it('applies per-block text overrides onto the factory blocks', () => {
    const m = parseManifest(
      minimal({}, [
        {
          textBlocks: 2,
          texts: [
            {
              fontScale: 1.5,
              color: '#FFFFFF',
              weight: 800,
              align: 'left',
              pos: { x: 0.2, y: 0.15 },
              boxWidth: 0.7,
              box: { fill: '#000000', opacity: 0.5 },
              outline: { color: '#111', width: 2 },
              shadow: { color: '#000', offsetY: 4 },
            },
            { fontSize: 30 },
          ],
        },
      ]),
    ).manifest!
    const slide = buildProjectFromManifest(m).slides[0]
    const [h, sub] = slide.texts
    // text-top headline default is 40 → ×1.5 = 60
    expect(h.style.fontSize).toBe(60)
    expect(h.style.color).toBe('#FFFFFF')
    expect(h.style.fontWeight).toBe(800)
    expect(h.style.textAlign).toBe('left')
    expect(h.pos).toEqual({ x: 0.2, y: 0.15 })
    expect(h.boxWidth).toBe(0.7)
    expect(h.style.box).toEqual({ fill: '#000000', opacity: 0.5, paddingX: 16, paddingY: 10, borderRadius: 12 })
    expect(h.style.outline).toEqual({ color: '#111', width: 2 })
    expect(h.style.shadow).toEqual({ color: '#000', opacity: 0.4, offsetX: 0, offsetY: 4, blur: 6 })
    // subhead: absolute fontSize override; everything else stays the layout default
    expect(sub.style.fontSize).toBe(30)
    expect(sub.pos).toBeUndefined()
    expect(sub.style.box).toBeUndefined()
  })

  it('lets texts[0].pos override the headline textY/textX shorthand', () => {
    const m = parseManifest(
      minimal({}, [{ textY: 0.28, textX: 0.5, texts: [{ pos: { x: 0.1, y: 0.4 } }] }]),
    ).manifest!
    expect(buildProjectFromManifest(m).slides[0].texts[0].pos).toEqual({ x: 0.1, y: 0.4 })
  })

  it('materializes highlights via the factory with fresh ids', () => {
    const m = parseManifest(
      minimal({}, [
        { highlights: [{ sourceRegion: { x: 0.1, y: 0.5, w: 0.4, h: 0.15 }, popup: { width: 0.8, rotation: 6 } }] },
        {},
      ]),
    ).manifest!
    const p = buildProjectFromManifest(m)
    const hl = p.slides[0].highlights
    expect(hl).toHaveLength(1)
    expect(hl[0].sourceRegion).toEqual({ x: 0.1, y: 0.5, w: 0.4, h: 0.15 })
    expect(hl[0].popup).toEqual({ width: 0.8, rotation: 6 })
    expect(hl[0].id).toBeTruthy()
    // untouched slide keeps the factory empty default
    expect(p.slides[1].highlights).toEqual([])
  })

  it('materializes screenshotStyle over defaults and ornaments via the factory', () => {
    const m = parseManifest(
      minimal({}, [
        {
          deviceFrame: false,
          screenshotStyle: { cornerRadiusRatio: 0.1 },
          ornaments: [{ shape: 'sparkles', x: 0.9, opacity: 0.8 }],
        },
        {},
      ]),
    ).manifest!
    const p = buildProjectFromManifest(m)
    expect(p.slides[0].screenshotStyle).toEqual({ cornerRadiusRatio: 0.1, shadow: true })
    const orn = p.slides[0].ornaments![0]
    expect(orn.shape).toBe('sparkles')
    expect(orn.x).toBe(0.9) // manifest override
    expect(orn.y).toBe(0.16) // shape default
    expect(orn.opacity).toBe(0.8)
    expect(orn.id).toBeTruthy()
    // untouched slide keeps the factory defaults
    expect(p.slides[1].screenshotStyle).toEqual({ cornerRadiusRatio: 0.06, shadow: true })
    expect(p.slides[1].ornaments).toEqual([])
  })

  it('shrinks the device on text-bottom slides so it clears the text band', () => {
    const m = parseManifest(minimal({}, [{ layout: 'text-bottom', textBlocks: 2 }])).manifest!
    const slide = buildProjectFromManifest(m).slides[0]
    const cw = EDITOR_CANVAS_WIDTH
    const spec = DEVICE_SPECS[slide.deviceFrame.model]
    const ch = Math.round((cw / spec.exportWidth) * spec.exportHeight)
    const layout = getDeviceLayout(slide, cw, ch, getDeviceDimensions(slide, cw), false, 1)!
    // 0.74 = applyTextBottom's headline anchor — the device must end above it.
    expect(layout.top + layout.height).toBeLessThanOrEqual(ch * 0.74)
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
