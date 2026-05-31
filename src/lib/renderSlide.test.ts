import { describe, expect, it } from 'vitest'
import type { Slide } from '../types/project'
import { makeProject } from '../constants/defaults'
import { withLocale } from './renderSlide'

function baseSlide(): Slide {
  const p = makeProject({ name: 'T', devices: ['iphone'], screenshotCount: 1, themeColor: '#102030' })
  const s = p.slides[0]
  s.screenshot = {
    id: 'shot',
    imageKey: 'img:base',
    originalWidth: 100,
    originalHeight: 200,
    localeOverrides: {
      ja: { imageKey: 'img:ja', originalWidth: 300, originalHeight: 400 },
    },
  }
  s.headline = { ...s.headline, text: 'Hello', translations: { ja: 'こんにちは' } }
  s.subheadline = { ...s.subheadline, text: 'World', translations: { ja: '世界' } }
  s.badges = [{ ...s.badges[0], text: 'New', translations: { ja: '新着' } }]
  return s
}

describe('withLocale — per-locale screenshot + text swap', () => {
  it('source locale (null) returns the base unchanged', () => {
    const s = baseSlide()
    const out = withLocale(s, null)
    expect(out).toBe(s)
    expect(out.screenshot?.imageKey).toBe('img:base')
    expect(out.headline.text).toBe('Hello')
  })

  it('swaps screenshot + dims for a locale that has an override', () => {
    const out = withLocale(baseSlide(), 'ja')
    expect(out.screenshot?.imageKey).toBe('img:ja')
    expect(out.screenshot?.originalWidth).toBe(300)
    expect(out.screenshot?.originalHeight).toBe(400)
    // text is localized too
    expect(out.headline.text).toBe('こんにちは')
    expect(out.subheadline.text).toBe('世界')
    expect(out.badges[0].text).toBe('新着')
  })

  it('falls back to the base screenshot for a locale with no override', () => {
    const out = withLocale(baseSlide(), 'en')
    expect(out.screenshot?.imageKey).toBe('img:base')
    expect(out.screenshot?.originalWidth).toBe(100)
    // no 'en' translation → headline falls back to source text
    expect(out.headline.text).toBe('Hello')
  })

  it('does not invent a screenshot when the base is null', () => {
    const s = baseSlide()
    s.screenshot = null
    const out = withLocale(s, 'ja')
    expect(out.screenshot).toBeNull()
    // text still localizes independently of the missing screenshot
    expect(out.headline.text).toBe('こんにちは')
  })

  it('does not mutate the input slide', () => {
    const s = baseSlide()
    withLocale(s, 'ja')
    expect(s.screenshot?.imageKey).toBe('img:base')
    expect(s.headline.text).toBe('Hello')
  })
})
