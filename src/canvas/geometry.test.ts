import { describe, expect, it } from 'vitest'
import { normalizeAngle, rotateAround } from './geometry'

describe('normalizeAngle', () => {
  it('folds into [-180, 180) — +180 aliases to -180 so store values never flip-flop', () => {
    expect(normalizeAngle(180)).toBe(-180)
    expect(normalizeAngle(-180)).toBe(-180)
    expect(normalizeAngle(540)).toBe(-180)
    expect(normalizeAngle(0)).toBe(0)
    expect(normalizeAngle(190)).toBe(-170)
    expect(normalizeAngle(-190)).toBe(170)
    expect(normalizeAngle(359.96)).toBeCloseTo(0, 6) // -0: only |Δ| comparisons consume this
  })

  it('is idempotent', () => {
    for (const a of [-720, -180, -33.3, 0, 45, 179.9, 180, 1234]) {
      expect(normalizeAngle(normalizeAngle(a))).toBe(normalizeAngle(a))
    }
  })
})

describe('rotateAround', () => {
  it('positive degrees rotate clockwise in y-down canvas space', () => {
    const p = rotateAround(10, 0, 0, 0, 90)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(10, 6)
  })
})
