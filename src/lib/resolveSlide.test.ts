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
    headline: {
      text: 'Hello',
      translations: { fr: 'Bonjour' },
      style: { fontFamily: 'Inter', fontSize: 76, fontWeight: 700, color: '#000', textAlign: 'center' },
    },
    subheadline: {
      text: 'World',
      translations: {},
      style: { fontFamily: 'Inter', fontSize: 40, fontWeight: 400, color: '#000', textAlign: 'center' },
    },
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
    expect(r.headline.text).toBe('Bonjour')
    expect(r.subheadline.text).toBe('World') // no fr translation → base
  })

  it('swaps in the locale screenshot override', () => {
    const s = baseSlide({
      screenshot: {
        id: 'sh',
        imageKey: 'img:base',
        originalWidth: 100,
        originalHeight: 200,
        localeOverrides: { fr: { imageKey: 'img:fr', originalWidth: 300, originalHeight: 600 } },
      },
    })
    const r = resolveSlideForLocale(s, 'fr')
    expect(r.screenshot?.imageKey).toBe('img:fr')
    expect(r.screenshot?.originalWidth).toBe(300)
    // base untouched (no mutation)
    expect(s.screenshot?.imageKey).toBe('img:base')
  })

  it('merges per-locale caption geometry and device transform', () => {
    const s = baseSlide({
      localeLayout: {
        fr: {
          headline: { pos: { x: 0.5, y: 0.1 }, boxWidth: 0.8, fontSize: 60 },
          deviceFrame: { offsetX: 20, scale: 0.9 },
        },
      },
    })
    const r = resolveSlideForLocale(s, 'fr')
    expect(r.headline.pos).toEqual({ x: 0.5, y: 0.1 })
    expect(r.headline.boxWidth).toBe(0.8)
    expect(r.headline.style.fontSize).toBe(60)
    expect(r.deviceFrame.offsetX).toBe(20)
    expect(r.deviceFrame.scale).toBe(0.9)
    expect(r.deviceFrame.offsetY).toBe(0) // untouched field kept from base
    // base slide is not mutated
    expect(s.headline.style.fontSize).toBe(76)
  })

  it('leaves geometry on the base when no override exists for the locale', () => {
    const r = resolveSlideForLocale(baseSlide(), 'de')
    expect(r.headline.pos).toBeUndefined()
    expect(r.deviceFrame.offsetX).toBe(0)
    expect(r.headline.text).toBe('Hello') // no de translation → base
  })
})
