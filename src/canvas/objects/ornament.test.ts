import { describe, expect, it } from 'vitest'
import { Path, Text } from 'fabric'
import { isFrontOrnament, renderOrnament } from './ornament'
import { makeOrnament, ORNAMENT_SHAPES } from '../../constants/defaults'
import type { OrnamentShape } from '../../types/project'

const ctx = { canvasWidth: 1000, canvasHeight: 2000 }

describe('renderOrnament', () => {
  it('draws every offered shape as a vector as wide as its size fraction', () => {
    for (const shape of ORNAMENT_SHAPES) {
      const obj = renderOrnament(makeOrnament(shape, { size: 0.2 }), ctx)
      expect(obj, shape).toBeInstanceOf(Path)
      // The drag sync reads size back as getScaledWidth() / canvasWidth.
      expect(obj!.getScaledWidth(), shape).toBeCloseTo(200, 1)
    }
  })

  it('inks filled shapes with fill and hand-drawn strokes with stroke', () => {
    const filled = renderOrnament(makeOrnament('sparkle', { color: '#D97706' }), ctx)!
    expect(filled.fill).toBe('#D97706')
    const stroked = renderOrnament(makeOrnament('hand-arrow', { color: '#D97706' }), ctx)!
    expect(stroked.stroke).toBe('#D97706')
    expect(stroked.fill).toBeNull()
  })

  it('places the ornament center at its canvas fractions', () => {
    const obj = renderOrnament(makeOrnament('quote', { x: 0.25, y: 0.5 }), ctx)!
    expect(obj.getCenterPoint().x).toBeCloseTo(250)
    expect(obj.getCenterPoint().y).toBeCloseTo(1000)
  })

  it('keeps rendering the emoji shapes saved projects still carry', () => {
    expect(renderOrnament(makeOrnament('fire'), ctx)).toBeInstanceOf(Text)
  })

  it('skips a shape it no longer knows', () => {
    expect(renderOrnament({ ...makeOrnament('sparkle'), shape: 'dot-grid' as OrnamentShape }, ctx)).toBeNull()
  })
})

describe('isFrontOrnament', () => {
  it('lifts only the hand-drawn annotation marks above the device', () => {
    expect(ORNAMENT_SHAPES.filter(isFrontOrnament)).toEqual(['hand-circle', 'hand-arrow', 'hand-check'])
    expect(isFrontOrnament('fire')).toBe(false)
  })
})
