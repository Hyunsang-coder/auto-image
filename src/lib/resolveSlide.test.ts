import { describe, it, expect } from 'vitest'
import { resolveSlideForLocale } from './resolveSlide'
import type { Slide } from '../types/project'

function baseSlide(over: Partial<Slide> = {}): Slide {
  return {
    id: 's1',
    index: 0,
    template: 'text-bottom',
    background: { type: 'solid', color: '#fff' },
    deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black', offsetX: 0, offsetY: 0, scale: 1 },
    screenshot: { id: 'sh', imageKey: 'img:base', originalWidth: 100, originalHeight: 200 },
    texts: [
      {
        text: 'Hello',
        translations: { fr: 'Bonjour' },
        style: { fontFamily: 'Inter', fontSize: 76, fontWeight: 700, color: '#000', textAlign: 'center' },
      },
      {
        text: 'World',
        translations: {},
        style: { fontFamily: 'Inter', fontSize: 40, fontWeight: 400, color: '#000', textAlign: 'center' },
      },
    ],
    badges: [],
    highlights: [],
    ...over,
  }
}

describe('resolveSlideForLocale', () => {
  it('returns the base untouched for a null locale', () => {
    const s = baseSlide()
    expect(resolveSlideForLocale(s, null)).toBe(s)
  })

  it('applies translated text, falling back to base when absent', () => {
    const r = resolveSlideForLocale(baseSlide(), 'fr')
    expect(r.texts[0].text).toBe('Bonjour')
    expect(r.texts[1].text).toBe('World')
  })

  it('swaps in the locale screenshot override', () => {
    const s = baseSlide({
      screenshot: {
        id: 'sh', imageKey: 'img:base', originalWidth: 100, originalHeight: 200,
        localeOverrides: { fr: { imageKey: 'img:fr', originalWidth: 300, originalHeight: 600 } },
      },
    })
    const r = resolveSlideForLocale(s, 'fr')
    expect(r.screenshot?.imageKey).toBe('img:fr')
    expect(s.screenshot?.imageKey).toBe('img:base')
  })

  it('merges per-locale caption style/placement (partial style over base)', () => {
    const s = baseSlide({
      localeOverrides: {
        fr: { texts: { 0: { pos: { x: 0.5, y: 0.1 }, boxWidth: 0.8, style: { fontSize: 60 } } } },
      },
    })
    const r = resolveSlideForLocale(s, 'fr')
    expect(r.texts[0].pos).toEqual({ x: 0.5, y: 0.1 })
    expect(r.texts[0].boxWidth).toBe(0.8)
    expect(r.texts[0].style.fontSize).toBe(60)
    expect(r.texts[0].style.color).toBe('#000') // untouched style prop kept from base
    expect(s.texts[0].style.fontSize).toBe(76)  // base not mutated
  })

  it('merges per-locale device transform, template, background', () => {
    const s = baseSlide({
      localeOverrides: {
        fr: { template: 'hero', background: { type: 'solid', color: '#f00' }, deviceFrame: { offsetX: 20, scale: 0.9 } },
      },
    })
    const r = resolveSlideForLocale(s, 'fr')
    expect(r.template).toBe('hero')
    expect(r.background).toEqual({ type: 'solid', color: '#f00' })
    expect(r.deviceFrame.offsetX).toBe(20)
    expect(r.deviceFrame.scale).toBe(0.9)
    expect(r.deviceFrame.offsetY).toBe(0) // base kept
    expect(s.template).toBe('text-bottom') // base not mutated
  })

  it('leaves everything on the base when the locale has no override', () => {
    const r = resolveSlideForLocale(baseSlide(), 'de')
    expect(r.template).toBe('text-bottom')
    expect(r.texts[0].pos).toBeUndefined()
    expect(r.deviceFrame.offsetX).toBe(0)
    expect(r.texts[0].text).toBe('Hello')
  })

  it('applies a per-locale frame show override (frameless in one locale only)', () => {
    const s = baseSlide({ localeOverrides: { fr: { deviceFrame: { show: false } } } })
    expect(resolveSlideForLocale(s, 'fr').deviceFrame.show).toBe(false)
    expect(resolveSlideForLocale(s, 'de').deviceFrame.show).toBe(true)
  })

  it('applies per-locale ornaments, falling back to base when absent', () => {
    const baseOrn = [{ id: 'o1', shape: 'star' as const, x: 0.1, y: 0.1, size: 0.1, rotation: 0, color: '#fff', opacity: 1 }]
    const frOrn = [{ ...baseOrn[0], x: 0.9 }]
    const s = baseSlide({ ornaments: baseOrn, localeOverrides: { fr: { ornaments: frOrn } } })
    expect(resolveSlideForLocale(s, 'fr').ornaments).toBe(frOrn)
    expect(resolveSlideForLocale(s, 'de').ornaments).toBe(baseOrn)
  })

  it('borrows a donor locale screenshot via localeSource when set', () => {
    const s = baseSlide({
      screenshot: {
        id: 'sh', imageKey: 'img:base', originalWidth: 100, originalHeight: 200,
        localeOverrides: { en: { imageKey: 'img:en', originalWidth: 300, originalHeight: 600 } },
        localeSource: { es: 'en' },
      },
    })
    // es has no own override → borrows en's screenshot.
    expect(resolveSlideForLocale(s, 'es').screenshot?.imageKey).toBe('img:en')
    // de has no override and no donor → base.
    expect(resolveSlideForLocale(s, 'de').screenshot?.imageKey).toBe('img:base')
  })

  it('prefers a locale own override over its donor pointer', () => {
    const s = baseSlide({
      screenshot: {
        id: 'sh', imageKey: 'img:base', originalWidth: 100, originalHeight: 200,
        localeOverrides: {
          en: { imageKey: 'img:en', originalWidth: 300, originalHeight: 600 },
          es: { imageKey: 'img:es', originalWidth: 300, originalHeight: 600 },
        },
        localeSource: { es: 'en' },
      },
    })
    expect(resolveSlideForLocale(s, 'es').screenshot?.imageKey).toBe('img:es')
  })

  it('falls back to base when the donor locale has no override', () => {
    const s = baseSlide({
      screenshot: {
        id: 'sh', imageKey: 'img:base', originalWidth: 100, originalHeight: 200,
        localeSource: { es: 'en' }, // en has no override
      },
    })
    expect(resolveSlideForLocale(s, 'es').screenshot?.imageKey).toBe('img:base')
  })
})
