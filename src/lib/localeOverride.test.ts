import { describe, it, expect } from 'vitest'
import { routeLocalePatch, clearLocaleOverride } from './localeOverride'
import type { Caption, Slide } from '../types/project'

function caption(text: string, translations: Record<string, string> = {}): Caption {
  return {
    text,
    translations,
    style: { fontFamily: 'Inter', fontSize: 76, fontWeight: 700, color: '#000', textAlign: 'center' },
  }
}

function baseSlide(over: Partial<Slide> = {}): Slide {
  return {
    id: 's1',
    index: 0,
    template: 'text-bottom',
    background: { type: 'solid', color: '#fff' },
    deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black', offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
    screenshot: null,
    texts: [caption('Hello'), caption('World')],
    badges: [],
    highlights: [],
    ...over,
  }
}

// Build a texts patch that mirrors the base but swaps one block.
function patchText(base: Slide, index: number, next: Caption) {
  return { texts: base.texts.map((c, i) => (i === index ? next : c)) }
}

describe('routeLocalePatch', () => {
  it('routes changed caption text to translations[locale], not the override', () => {
    const base = baseSlide()
    const out = routeLocalePatch(base, 'fr', patchText(base, 0, { ...base.texts[0], text: 'Bonjour' }))
    expect(out.texts?.[0].translations).toEqual({ fr: 'Bonjour' })
    expect(out.localeOverrides).toBeUndefined()
  })

  it('skips text that equals what the locale already shows', () => {
    const base = baseSlide()
    const out = routeLocalePatch(base, 'fr', patchText(base, 0, { ...base.texts[0], text: 'Hello' }))
    expect(out.texts).toBeUndefined()
    expect(out.localeOverrides).toBeUndefined()
  })

  it('stores only the changed style props (per-property grain)', () => {
    const base = baseSlide()
    const patch = patchText(base, 0, { ...base.texts[0], style: { ...base.texts[0].style, fontSize: 60 } })
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeOverrides?.fr.texts?.[0]?.style).toEqual({ fontSize: 60 }) // colour etc. not frozen
  })

  it('routes caption placement to the override (keyed by index)', () => {
    const base = baseSlide()
    const patch = patchText(base, 0, { ...base.texts[0], pos: { x: 0.5, y: 0.2 }, boxWidth: 0.7 })
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeOverrides?.fr.texts?.[0]).toMatchObject({ pos: { x: 0.5, y: 0.2 }, boxWidth: 0.7 })
  })

  it('routes a second text block to its own override index', () => {
    const base = baseSlide()
    const patch = patchText(base, 1, { ...base.texts[1], style: { ...base.texts[1].style, fontSize: 30 } })
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeOverrides?.fr.texts?.[1]?.style).toEqual({ fontSize: 30 })
    expect(out.localeOverrides?.fr.texts?.[0]).toBeUndefined()
  })

  it('routes template, background, device transform, screenshot style to the override', () => {
    const base = baseSlide()
    const out = routeLocalePatch(base, 'fr', {
      template: 'hero',
      background: { type: 'solid', color: '#f00' },
      deviceFrame: { ...base.deviceFrame, offsetX: 30, scale: 0.8 },
      screenshotStyle: { cornerRadiusRatio: 0.1, shadow: false },
    })
    const fr = out.localeOverrides?.fr
    expect(fr?.template).toBe('hero')
    expect(fr?.background).toEqual({ type: 'solid', color: '#f00' })
    expect(fr?.deviceFrame).toMatchObject({ offsetX: 30, scale: 0.8 })
    expect(fr?.screenshotStyle).toEqual({ cornerRadiusRatio: 0.1, shadow: false })
  })

  it('passes shared elements (badges/highlights/screenshot) to the base', () => {
    const base = baseSlide()
    const badges = [{ id: 'b1', text: 'New', translations: {}, style: {} as never, top: 0.1 }]
    const out = routeLocalePatch(base, 'fr', { badges })
    expect(out.badges).toBe(badges)
    expect(out.localeOverrides).toBeUndefined()
  })

  it('routes the frame show toggle (false included) to the override', () => {
    const base = baseSlide()
    const out = routeLocalePatch(base, 'fr', { deviceFrame: { ...base.deviceFrame, show: false } })
    expect(out.localeOverrides?.fr.deviceFrame?.show).toBe(false)
    expect(out.deviceFrame).toBeUndefined() // base untouched
  })

  it('routes ornaments to the override, not the base', () => {
    const base = baseSlide()
    const ornaments = [
      { id: 'o1', shape: 'star' as const, x: 0.2, y: 0.3, size: 0.1, rotation: 0, color: '#fff', opacity: 1 },
    ]
    const out = routeLocalePatch(base, 'fr', { ornaments })
    expect(out.ornaments).toBeUndefined()
    expect(out.localeOverrides?.fr.ornaments).toBe(ornaments)
  })

  it('routes shapes to the override, not the base', () => {
    const base = baseSlide()
    const shapes = [
      { id: 's1', kind: 'rect' as const, x: 0.5, y: 0.3, width: 0.5, height: 0.2, rotation: 0, fill: '#fff', opacity: 0.25 },
    ]
    const out = routeLocalePatch(base, 'fr', { shapes })
    expect(out.shapes).toBeUndefined()
    expect(out.localeOverrides?.fr.shapes).toBe(shapes)
  })

  it('merges onto an existing override and preserves other locales', () => {
    const base = baseSlide({
      localeOverrides: { fr: { texts: { 0: { boxWidth: 0.6 } } }, de: { template: 'hero' } },
    })
    const out = routeLocalePatch(base, 'fr', { deviceFrame: { ...base.deviceFrame, offsetX: 50 } })
    expect(out.localeOverrides?.fr.texts?.[0]).toEqual({ boxWidth: 0.6 })
    expect(out.localeOverrides?.fr.deviceFrame).toMatchObject({ offsetX: 50 })
    expect(out.localeOverrides?.de).toEqual({ template: 'hero' })
  })

  it('does not mutate the base slide', () => {
    const base = baseSlide({ texts: [caption('Hello', { fr: 'X' }), caption('World')] })
    routeLocalePatch(base, 'fr', { ...patchText(base, 0, { ...base.texts[0], text: 'Y' }), template: 'hero' })
    expect(base.texts[0].translations).toEqual({ fr: 'X' })
    expect(base.localeOverrides).toBeUndefined()
  })

  it('routes a locale-mode badge variant switch to the shared base style', () => {
    const style = { backgroundColor: '#fff', textColor: '#000', borderRadius: 99, paddingX: 8, paddingY: 4, fontSize: 20, fontWeight: 600 }
    const badge = { id: 'b1', text: 'Hello', translations: {}, style, top: 0.1 }
    const base = baseSlide({ badges: [badge] })
    const out = routeLocalePatch(base, 'fr', { badges: [{ ...badge, style: { ...style, variant: 'laurel' as const } }] })
    expect(out.badges?.[0].style.variant).toBe('laurel')
  })

  // Badge text is per-locale via translations (see resolveSlideForLocale), so
  // a locale-mode text edit must land there — writing the whole array to the
  // base would repaint every locale and destroy the source text.
  it('[H-V2] routes a locale-mode badge text edit to translations, keeping base text', () => {
    const badge = { id: 'b1', text: 'Hello', translations: {}, style: {} as never, top: 0.1 }
    const base = baseSlide({ badges: [badge] })
    const out = routeLocalePatch(base, 'fr', { badges: [{ ...badge, text: 'Bonjour' }] })
    expect(out.badges?.[0].text).toBe('Hello')
    expect(out.badges?.[0].translations).toEqual({ fr: 'Bonjour' })
  })

  it('[H-V2] is a no-op when the locale-mode badge patch changes nothing', () => {
    const badge = { id: 'b1', text: 'Hello', translations: { fr: 'Bonjour' }, style: {} as never, top: 0.1 }
    const base = baseSlide({ badges: [badge] })
    const out = routeLocalePatch(base, 'fr', { badges: [{ ...badge, text: 'Bonjour' }] })
    expect(out.badges).toBeUndefined()
    expect(out.localeOverrides).toBeUndefined()
  })

  it('[H-V2] still passes structural badge changes (add/remove) to the shared base', () => {
    const badge = { id: 'b1', text: 'Hello', translations: {}, style: {} as never, top: 0.1 }
    const base = baseSlide({ badges: [badge] })
    const added = { id: 'b2', text: 'New', translations: {}, style: {} as never, top: 0.2 }
    expect(routeLocalePatch(base, 'fr', { badges: [badge, added] }).badges).toHaveLength(2)
    expect(routeLocalePatch(base, 'fr', { badges: [] }).badges).toEqual([])
  })

  // External images have no per-locale channel (LocaleOverride carries none),
  // so they are shared like badges — but they must reach the base instead of
  // being silently dropped by the router.
  it('[H-V3] routes locale-mode external-image edits to the shared base', () => {
    const img = { id: 'e1', imageKey: 'img:x', originalWidth: 10, originalHeight: 10, x: 0.5, y: 0.5, width: 0.3, rotation: 0, opacity: 1, cornerRadiusRatio: 0.06, shadow: true }
    const base = baseSlide({ externalImages: [] })
    const out = routeLocalePatch(base, 'fr', { externalImages: [img] })
    expect(out.externalImages).toEqual([img])
  })
})

describe('clearLocaleOverride', () => {
  it('removes only the given locale', () => {
    const base = baseSlide({ localeOverrides: { fr: { template: 'hero' }, de: { background: { type: 'solid', color: '#0f0' } } } })
    const out = clearLocaleOverride(base, 'fr')
    expect(out.localeOverrides).toEqual({ de: { background: { type: 'solid', color: '#0f0' } } })
  })

  it('is a no-op when the locale has no override', () => {
    expect(clearLocaleOverride(baseSlide(), 'fr')).toEqual({})
  })
})
