import { describe, it, expect } from 'vitest'
import { routeLocalePatch, clearLocaleLayout } from './localeOverride'
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
  it('routes a changed caption text to translations[locale]', () => {
    const base = baseSlide()
    const patch = { headline: { ...base.headline, text: 'Bonjour' } }
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.headline?.translations).toEqual({ fr: 'Bonjour' })
    // Geometry untouched on the base caption.
    expect(out.headline?.pos).toBeUndefined()
    expect(out.localeLayout).toBeUndefined()
  })

  it('skips text that equals what the locale already shows', () => {
    // No translation yet → resolved text is the base text; an unchanged sync
    // must not create a redundant translation entry.
    const base = baseSlide()
    const out = routeLocalePatch(base, 'fr', { headline: { ...base.headline, text: 'Hello' } })
    expect(out.headline).toBeUndefined()
  })

  it('rewrites an existing translation even when the new text equals the base', () => {
    const base = baseSlide({ headline: caption('Hello', { fr: 'Bonjour' }) })
    const out = routeLocalePatch(base, 'fr', { headline: { ...base.headline, text: 'Hello' } })
    expect(out.headline?.translations).toEqual({ fr: 'Hello' })
  })

  it('routes caption placement to localeLayout[locale]', () => {
    const base = baseSlide()
    const patch = { headline: { ...base.headline, pos: { x: 0.5, y: 0.2 }, boxWidth: 0.7 } }
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeLayout?.fr.headline).toEqual({ pos: { x: 0.5, y: 0.2 }, boxWidth: 0.7 })
  })

  it('routes the device transform to localeLayout[locale].deviceFrame', () => {
    const base = baseSlide()
    const patch = { deviceFrame: { ...base.deviceFrame, offsetX: 30, offsetY: -10, scale: 0.8 } }
    const out = routeLocalePatch(base, 'fr', patch)
    expect(out.localeLayout?.fr.deviceFrame).toMatchObject({ offsetX: 30, offsetY: -10, scale: 0.8 })
  })

  it('merges onto an existing override and preserves other locales', () => {
    const base = baseSlide({
      localeLayout: {
        fr: { headline: { boxWidth: 0.6 } },
        de: { deviceFrame: { scale: 1.2 } },
      },
    })
    // fr drag emits only a new device offset; fr's existing headline override
    // and de's override must survive.
    const out = routeLocalePatch(base, 'fr', { deviceFrame: { ...base.deviceFrame, offsetX: 50 } })
    expect(out.localeLayout?.fr.headline).toEqual({ boxWidth: 0.6 })
    expect(out.localeLayout?.fr.deviceFrame).toMatchObject({ offsetX: 50 })
    expect(out.localeLayout?.de).toEqual({ deviceFrame: { scale: 1.2 } })
  })

  it('does not mutate the base slide', () => {
    const base = baseSlide({ headline: caption('Hello', { fr: 'X' }) })
    routeLocalePatch(base, 'fr', { headline: { ...base.headline, text: 'Y' }, deviceFrame: { ...base.deviceFrame, offsetX: 9 } })
    expect(base.headline.translations).toEqual({ fr: 'X' })
    expect(base.localeLayout).toBeUndefined()
  })
})

describe('clearLocaleLayout', () => {
  it('removes only the given locale', () => {
    const base = baseSlide({ localeLayout: { fr: { deviceFrame: { scale: 2 } }, de: { headline: { boxWidth: 0.5 } } } })
    const out = clearLocaleLayout(base, 'fr')
    expect(out.localeLayout).toEqual({ de: { headline: { boxWidth: 0.5 } } })
  })

  it('is a no-op when the locale has no overrides', () => {
    expect(clearLocaleLayout(baseSlide(), 'fr')).toEqual({})
  })
})
