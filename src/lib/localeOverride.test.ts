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
    headline: caption('Hello'),
    subheadline: caption('World'),
    badges: [],
    highlights: [],
    ...over,
  }
}

describe('routeLocalePatch', () => {
  it('routes changed caption text to translations[locale], not the override', () => {
    const base = baseSlide()
    const out = routeLocalePatch(base, 'fr', { headline: { ...base.headline, text: 'Bonjour' } })
    expect(out.headline?.translations).toEqual({ fr: 'Bonjour' })
    expect(out.localeOverrides).toBeUndefined()
  })

  it('skips text that equals what the locale already shows', () => {
    const out = routeLocalePatch(baseSlide(), 'fr', { headline: { ...baseSlide().headline, text: 'Hello' } })
    expect(out.headline).toBeUndefined()
    expect(out.localeOverrides).toBeUndefined()
  })

  it('stores only the changed style props (per-property grain)', () => {
    const base = baseSlide()
    const patch = { headline: { ...base.headline, style: { ...base.headline.style, fontSize: 60 } } }
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeOverrides?.fr.headline?.style).toEqual({ fontSize: 60 }) // colour etc. not frozen
  })

  it('routes caption placement to the override', () => {
    const base = baseSlide()
    const patch = { headline: { ...base.headline, pos: { x: 0.5, y: 0.2 }, boxWidth: 0.7 } }
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeOverrides?.fr.headline).toMatchObject({ pos: { x: 0.5, y: 0.2 }, boxWidth: 0.7 })
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

  it('passes shared elements (badges/ornaments/highlights/screenshot) to the base', () => {
    const base = baseSlide()
    const badges = [{ id: 'b1', text: 'New', translations: {}, style: {} as never, top: 0.1 }]
    const out = routeLocalePatch(base, 'fr', { badges })
    expect(out.badges).toBe(badges)
    expect(out.localeOverrides).toBeUndefined()
  })

  it('merges onto an existing override and preserves other locales', () => {
    const base = baseSlide({
      localeOverrides: { fr: { headline: { boxWidth: 0.6 } }, de: { template: 'hero' } },
    })
    const out = routeLocalePatch(base, 'fr', { deviceFrame: { ...base.deviceFrame, offsetX: 50 } })
    expect(out.localeOverrides?.fr.headline).toEqual({ boxWidth: 0.6 })
    expect(out.localeOverrides?.fr.deviceFrame).toMatchObject({ offsetX: 50 })
    expect(out.localeOverrides?.de).toEqual({ template: 'hero' })
  })

  it('does not mutate the base slide', () => {
    const base = baseSlide({ headline: caption('Hello', { fr: 'X' }) })
    routeLocalePatch(base, 'fr', { headline: { ...base.headline, text: 'Y' }, template: 'hero' })
    expect(base.headline.translations).toEqual({ fr: 'X' })
    expect(base.localeOverrides).toBeUndefined()
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
