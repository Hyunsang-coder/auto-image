import { describe, it, expect } from 'vitest'
import { fitFontSize, containsCJK, renderCaption } from './caption'
import { makeTextBlock } from '../../constants/defaults'
import { LAYER_NAMES } from '../layerNames'

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

describe('renderCaption outline/shadow', () => {
  const OPTS = { left: 220, top: 100, width: 300, layerName: LAYER_NAMES.TEXT }

  it('renders with no stroke and no shadow by default', () => {
    const obj = renderCaption(makeTextBlock(0, 'text-top', 'Hello'), OPTS)
    expect(obj.strokeWidth).toBe(0)
    expect(obj.stroke).toBeUndefined()
    expect(obj.shadow).toBeFalsy()
  })

  it('applies the outline as a behind-fill stroke', () => {
    const cap = makeTextBlock(0, 'text-top', 'Hello')
    cap.style.outline = { color: '#FF0000', width: 3 }
    const obj = renderCaption(cap, OPTS)
    expect(obj.stroke).toBe('#FF0000')
    expect(obj.strokeWidth).toBe(3)
    expect(obj.paintFirst).toBe('stroke')
    expect(obj.strokeLineJoin).toBe('round')
  })

  it('composes the shadow color from hex + opacity', () => {
    const cap = makeTextBlock(0, 'text-top', 'Hello')
    cap.style.shadow = { color: '#112233', opacity: 0.4, offsetX: 3, offsetY: 4, blur: 8 }
    const obj = renderCaption(cap, OPTS)
    expect(obj.shadow?.color).toBe('rgba(17, 34, 51, 0.4)')
    expect(obj.shadow?.offsetX).toBe(3)
    expect(obj.shadow?.offsetY).toBe(4)
    expect(obj.shadow?.blur).toBe(8)
  })
})
