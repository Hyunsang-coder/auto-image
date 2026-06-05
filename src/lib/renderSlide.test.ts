import { describe, it, expect } from 'vitest'
import { withScaledFonts } from './renderSlide'
import { makeSlide } from '../constants/defaults'
import type { Badge } from '../types/project'

const THUMB_SCALE = 220 / 440 // thumbnail strip
const IPAD_SCALE = 2064 / 440 // non-integer export scale (iPad 13")

function slideWithBadge() {
  const slide = makeSlide(0)
  const badge: Badge = {
    id: 'b1',
    text: '4.9 ★',
    translations: {},
    top: 0.1,
    style: {
      backgroundColor: '#000',
      textColor: '#fff',
      borderRadius: 999,
      paddingX: 10,
      paddingY: 5,
      fontSize: 13,
      fontWeight: 600,
    },
  }
  slide.badges = [badge]
  return slide
}

describe('withScaledFonts (export/thumbnail ↔ editor proportionality)', () => {
  it('scales caption fontSize exactly, without rounding', () => {
    const slide = slideWithBadge()
    slide.texts[0].style.fontSize = 35

    expect(withScaledFonts(slide, THUMB_SCALE).texts[0].style.fontSize).toBe(17.5)
    expect(withScaledFonts(slide, IPAD_SCALE).texts[0].style.fontSize).toBe(35 * IPAD_SCALE)
  })

  it('leaves letterSpacing unscaled — charSpacing is em-relative and already tracks fontSize', () => {
    const slide = slideWithBadge()
    slide.texts[0].style.letterSpacing = -2.2

    expect(withScaledFonts(slide, IPAD_SCALE).texts[0].style.letterSpacing).toBe(-2.2)
    expect(withScaledFonts(slide, THUMB_SCALE).texts[0].style.letterSpacing).toBe(-2.2)
  })

  it('scales outline width and shadow geometry, leaving colors/opacity alone', () => {
    const slide = slideWithBadge()
    slide.texts[0].style.outline = { color: '#000000', width: 2 }
    slide.texts[0].style.shadow = { color: '#112233', opacity: 0.4, offsetX: 3, offsetY: 4, blur: 8 }

    const scaled = withScaledFonts(slide, IPAD_SCALE).texts[0].style
    expect(scaled.outline).toEqual({ color: '#000000', width: 2 * IPAD_SCALE })
    expect(scaled.shadow).toEqual({
      color: '#112233',
      opacity: 0.4,
      offsetX: 3 * IPAD_SCALE,
      offsetY: 4 * IPAD_SCALE,
      blur: 8 * IPAD_SCALE,
    })
  })

  it('leaves outline/shadow absent when the caption has none', () => {
    const scaled = withScaledFonts(slideWithBadge(), IPAD_SCALE).texts[0].style
    expect(scaled.outline).toBeUndefined()
    expect(scaled.shadow).toBeUndefined()
  })

  it('scales badge fontSize and paddings exactly', () => {
    const scaled = withScaledFonts(slideWithBadge(), THUMB_SCALE).badges[0].style
    expect(scaled.fontSize).toBe(6.5)
    expect(scaled.paddingX).toBe(5)
    expect(scaled.paddingY).toBe(2.5)
  })

  it('does not mutate the input slide', () => {
    const slide = slideWithBadge()
    const baseFontSize = slide.texts[0].style.fontSize
    withScaledFonts(slide, IPAD_SCALE)
    expect(slide.texts[0].style.fontSize).toBe(baseFontSize)
    expect(slide.badges[0].style.paddingX).toBe(10)
  })
})
