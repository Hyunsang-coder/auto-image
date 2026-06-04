import { describe, it, expect } from 'vitest'
import { fitFontSize, containsCJK } from './caption'

describe('fitFontSize (shrink-only fit policy)', () => {
  it('keeps the base size when the text already fits the box', () => {
    // widest line narrower than the box → no growth past the design size.
    expect(fitFontSize(100, 200, 400)).toBe(100)
  })

  it('caps at the base size exactly when the line equals the box width', () => {
    expect(fitFontSize(100, 400, 400)).toBe(100)
  })

  it('shrinks proportionally when the text overflows the box', () => {
    // 800px wide at base 100 → must halve to fit a 400px box.
    expect(fitFontSize(100, 800, 400)).toBe(50)
  })

  it('floors the shrink at 10px', () => {
    // Extreme overflow would compute < 10; clamp keeps it readable.
    expect(fitFontSize(100, 100_000, 400)).toBe(10)
  })

  it('returns the base size when nothing was measured', () => {
    expect(fitFontSize(72, 0, 400)).toBe(72)
  })
})

describe('containsCJK (grapheme-wrap eligibility)', () => {
  it('matches Hangul syllables and jamo', () => {
    expect(containsCJK('운동기록')).toBe(true)
    expect(containsCJK('ㅋㅋ')).toBe(true)
  })

  it('matches kana and CJK ideographs', () => {
    expect(containsCJK('すごい')).toBe(true)
    expect(containsCJK('カタカナ')).toBe(true)
    expect(containsCJK('漢字')).toBe(true)
  })

  it('matches mixed Latin + CJK', () => {
    expect(containsCJK('PDF를 한 번에')).toBe(true)
  })

  it('rejects pure Latin / digits / punctuation', () => {
    expect(containsCJK('Track your runs — 100% free!')).toBe(false)
  })
})
