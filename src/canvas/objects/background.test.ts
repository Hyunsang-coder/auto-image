import { describe, it, expect } from 'vitest'
import { Circle, Gradient, Pattern, Rect } from 'fabric'
import { renderBackground } from './background'

const resolveNone = async () => undefined

const solid = { type: 'solid' as const, color: '#FFFFFF' }

describe('renderBackground overlays', () => {
  it('returns a single rect when no overlays are set', async () => {
    const objs = await renderBackground(1000, 2000, solid, resolveNone)
    expect(objs).toHaveLength(1)
  })

  it('appends one soft radial circle per blob above the base fill', async () => {
    const objs = await renderBackground(
      1000,
      2000,
      { ...solid, blobs: [{ color: '#FF0000', x: 0.5, y: 0.25, radius: 0.5 }] },
      resolveNone,
    )
    expect(objs).toHaveLength(2)
    const blob = objs[1] as Circle
    expect(blob).toBeInstanceOf(Circle)
    // radius = 0.5 × min(1000, 2000) = 500; centered at (500, 500) → top-left (0, 0)
    expect(blob.radius).toBe(500)
    expect(blob.left).toBe(0)
    expect(blob.top).toBe(0)
    expect(blob.opacity).toBe(0.55)
    expect(blob.selectable).toBe(false)
    const fill = blob.fill as Gradient<'radial'>
    expect(fill.type).toBe('radial')
    expect(fill.colorStops[0].color).toBe('rgba(255,0,0,1)')
    expect(fill.colorStops.at(-1)?.color).toBe('rgba(255,0,0,0)')
  })

  it('honors a custom blob opacity and caps the blob count at 6', async () => {
    const blob = { color: '#00FF00', x: 0.5, y: 0.5, radius: 0.3 }
    const objs = await renderBackground(
      1000,
      1000,
      { ...solid, blobs: [{ ...blob, opacity: 0.2 }, ...Array(7).fill(blob)] },
      resolveNone,
    )
    // base + 6 blobs (8 authored, capped)
    expect(objs).toHaveLength(7)
    expect((objs[1] as Circle).opacity).toBe(0.2)
  })

  it('adds a full-canvas grain rect above everything when noise is set', async () => {
    const objs = await renderBackground(1000, 2000, { ...solid, noise: 0.3 }, resolveNone)
    expect(objs).toHaveLength(2)
    const grain = objs[1] as Rect
    expect(grain).toBeInstanceOf(Rect)
    expect(grain.width).toBe(1000)
    expect(grain.height).toBe(2000)
    expect(grain.fill).toBeInstanceOf(Pattern)
  })
})
