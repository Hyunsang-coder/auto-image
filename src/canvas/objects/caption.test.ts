import { describe, it, expect } from 'vitest'
import { fitFontSize, containsCJK, renderCaption, renderCaptionBox, placeCaptionBoxUnderlay } from './caption'
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

describe('renderCaptionBox (caption box underlay)', () => {
  const OPTS = { left: 220, top: 100, width: 300, layerName: LAYER_NAMES.TEXT }

  it('returns null when the caption has no box', () => {
    const obj = renderCaption(makeTextBlock(0, 'text-top', 'Hello'), OPTS)
    expect(renderCaptionBox(makeTextBlock(0, 'text-top', 'Hello'), obj)).toBeNull()
  })

  it('wraps the textbox bbox with the padding, centered origin', () => {
    const cap = makeTextBlock(0, 'text-top', 'Hello')
    cap.style.box = { fill: '#112233', opacity: 0.5, paddingX: 16, paddingY: 10, borderRadius: 12 }
    const obj = renderCaption(cap, OPTS)
    const rect = renderCaptionBox(cap, obj)!
    // originX center → bbox left = left - width/2
    expect(rect.left).toBe(220 - 300 / 2 - 16)
    expect(rect.top).toBe(100 - 10)
    expect(rect.width).toBe(300 + 32)
    expect(rect.height).toBe(obj.height + 20)
    expect(rect.rx).toBe(12)
    expect(rect.fill).toBe('rgba(17, 34, 51, 0.5)')
    expect(rect.evented).toBe(false)
    expect(rect.selectable).toBe(false)
    const tagged = rect as typeof rect & { layerName?: string; owner?: string }
    expect(tagged.layerName).toBe(LAYER_NAMES.TEXT_BOX)
    expect(tagged.owner).toBe('leader')
  })

  it('applies border and shadow when present', () => {
    const cap = makeTextBlock(0, 'text-top', 'Hello')
    cap.style.box = {
      fill: '#000000', opacity: 1, paddingX: 0, paddingY: 0, borderRadius: 0,
      border: { color: '#FF0000', width: 3 },
      shadow: { color: '#112233', opacity: 0.4, offsetX: 1, offsetY: 2, blur: 6 },
    }
    const rect = renderCaptionBox(cap, renderCaption(cap, OPTS))!
    expect(rect.stroke).toBe('#FF0000')
    expect(rect.strokeWidth).toBe(3)
    expect(rect.shadow?.color).toBe('rgba(17, 34, 51, 0.4)')
    expect(rect.shadow?.blur).toBe(6)
  })

  it('re-places against a right-origin textbox (left-edge = left - width)', () => {
    const cap = makeTextBlock(0, 'text-top', 'Hello')
    cap.style.box = { fill: '#000000', opacity: 1, paddingX: 8, paddingY: 4, borderRadius: 0 }
    const obj = renderCaption(cap, OPTS)
    const rect = renderCaptionBox(cap, obj)!
    obj.set({ originX: 'right', left: 400, top: 50 })
    placeCaptionBoxUnderlay(rect, obj)
    expect(rect.left).toBe(400 - 300 - 8)
    expect(rect.top).toBe(50 - 4)
  })

  it('folds a corner-scale into the underlay size', () => {
    const cap = makeTextBlock(0, 'text-top', 'Hello')
    cap.style.box = { fill: '#000000', opacity: 1, paddingX: 10, paddingY: 10, borderRadius: 0 }
    const obj = renderCaption(cap, OPTS)
    const rect = renderCaptionBox(cap, obj)!
    obj.set({ scaleX: 2, scaleY: 2 })
    placeCaptionBoxUnderlay(rect, obj)
    expect(rect.width).toBe(300 * 2 + 20)
    expect(rect.height).toBe(obj.height * 2 + 20)
    expect(rect.left).toBe(220 - 300 - 10)
  })
})
