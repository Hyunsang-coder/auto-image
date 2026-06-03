import { describe, it, expect } from 'vitest'
import { computeSnap, type SnapBox } from './snapGuides'

// A 100×40 box centered at (200, 100): left 150, right 250, top 80, bottom 120.
const box: SnapBox = { left: 150, centerX: 200, right: 250, top: 80, centerY: 100, bottom: 120 }

describe('computeSnap', () => {
  it('returns no shift when nothing is within threshold', () => {
    const r = computeSnap(box, [400], [400], 6)
    expect(r.dx).toBe(0)
    expect(r.dy).toBe(0)
    expect(r.vLines).toEqual([])
    expect(r.hLines).toEqual([])
  })

  it('snaps the center to a nearby candidate (e.g. canvas center) and draws that line', () => {
    // canvas center 205 is 5px from centerX 200.
    const r = computeSnap(box, [205], [], 6)
    expect(r.dx).toBe(5)
    expect(r.vLines).toEqual([205])
  })

  it('prefers the closest anchor/candidate pair', () => {
    // left(150)→152 is +2; centerX(200)→205 is +5. Closest wins → +2.
    const r = computeSnap(box, [152, 205], [], 6)
    expect(r.dx).toBe(2)
    expect(r.vLines).toEqual([152])
  })

  it('snaps an edge to another object edge', () => {
    // Another object's left edge at 147 → snap our left(150) by -3.
    const r = computeSnap(box, [147], [], 6)
    expect(r.dx).toBe(-3)
    expect(r.vLines).toEqual([147])
  })

  it('snaps X and Y independently', () => {
    const r = computeSnap(box, [203], [98], 6)
    expect(r.dx).toBe(3) // centerX 200 → 203
    expect(r.dy).toBe(-2) // centerY 100 → 98
    expect(r.vLines).toEqual([203])
    expect(r.hLines).toEqual([98])
  })

  it('shows every candidate an anchor coincides with after the shift', () => {
    // Shift +5 lands centerX(200) on 205 AND right(250) on 255 simultaneously.
    const r = computeSnap(box, [205, 255], [], 6)
    expect(r.dx).toBe(5)
    expect(r.vLines).toContain(205)
    expect(r.vLines).toContain(255)
  })

  it('ignores candidates just outside the threshold', () => {
    const r = computeSnap(box, [207], [], 6) // 7px from centerX → no snap
    expect(r.dx).toBe(0)
    expect(r.vLines).toEqual([])
  })
})
