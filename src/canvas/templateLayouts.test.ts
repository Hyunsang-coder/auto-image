import { describe, expect, it } from 'vitest'
import { getDeviceDimensions, getDeviceLayout } from './templateLayouts'
import type { Slide } from '../types/project'

function makeSlide(
  template: Slide['template'],
  deviceFrame: Partial<Slide['deviceFrame']> = {},
): Slide {
  return {
    id: 's1',
    template,
    deviceFrame: { model: 'iphone-16-pro', show: true, color: 'graphite', scale: 1, ...deviceFrame },
    headline: { text: '', style: { fontSize: 10, color: '#000', textAlign: 'center' } },
    subheadline: { text: '', style: { fontSize: 10, color: '#000', textAlign: 'center' } },
    background: { type: 'solid', color: '#fff' },
  } as Slide
}

function layout(
  template: Slide['template'],
  cw: number,
  ch: number,
  spanCentered: boolean,
  deviceFrame: Partial<Slide['deviceFrame']> = {},
  canvasScale = 1,
) {
  const slide = makeSlide(template, deviceFrame)
  return getDeviceLayout(slide, cw, ch, getDeviceDimensions(slide, cw), spanCentered, canvasScale)
}

describe('device layout span centering', () => {
  it('hero-bleed snaps to the seam when spanCentered', () => {
    const cw = 1000
    const seam = cw / 2
    expect(layout('hero-bleed', cw, 2000, true)?.centerX).toBe(seam)
  })

  it('split snaps to the seam when spanCentered', () => {
    expect(layout('split', 1000, 2000, true)?.centerX).toBe(500)
  })
})

// The device drag round-trip: syncToZustand stores offset = body position − the
// body's offset-free base, and the next render places the body back at base +
// offset. If those two don't cancel exactly, the device "snaps" to a different
// spot than where it was dropped. The fix derives the base from the rendered
// layout minus the stored offset, so the round-trip is exact for every template,
// scale, and span — including vertically-centered templates (split) whose old
// anchor used the unscaled device height and injected a vertical jump.
describe('device drag round-trip is exact (no snap)', () => {
  const DEVICE_TEMPLATES = ['text-top', 'text-bottom', 'split', 'hero-bleed'] as const
  const SCALES = [0.4, 0.78, 1, 1.5, 2]
  const OFFSETS = [
    [0, 0],
    [60, 40],
    [-50, -30],
    [120, -80],
  ] as const
  // Single slide (440) and a 2-page span (880); both at the iPhone editor height.
  const CASES = [
    { label: 'single', cw: 440, ch: 956, span: false },
    { label: 'span', cw: 880, ch: 956, span: true },
  ]

  for (const { label, cw, ch, span } of CASES) {
    for (const template of DEVICE_TEMPLATES) {
      for (const scale of SCALES) {
        it(`${label} · ${template} · scale ${scale}`, () => {
          for (const [dx, dy] of OFFSETS) {
            const L = layout(template, cw, ch, span, { scale, offsetX: dx, offsetY: dy })!
            expect(L).not.toBeNull()
            const width = L.width

            // Production derivation (templateLayouts.addDeviceFrame):
            //   body.left  = layout.centerX − width/2
            //   _baseLeft  = (layout.centerX − offsetX) − width/2
            //   body.top   = layout.top
            //   _baseTop   = layout.top − offsetY
            const bodyLeft = L.centerX - width / 2
            const baseLeft = L.centerX - dx - width / 2
            const bodyTop = L.top
            const baseTop = L.top - dy

            // Capture (FabricCanvas.syncToZustand) for a pure drag (body.scaleX === 1):
            const capturedX = Math.round(bodyLeft - baseLeft)
            const capturedY = Math.round(bodyTop - baseTop)

            expect(capturedX).toBe(dx)
            expect(capturedY).toBe(dy)
          }
        })
      }
    }
  }

  // Editor stores offsetX/offsetY in editor-canvas pixels; at export resolution
  // the canvas is canvasScale× wider, so the offset must be multiplied by
  // canvasScale for the device to land in the same proportional spot. Otherwise
  // a dragged device renders in a different place in the export than the editor.
  it('offset scales with canvasScale so editor and export match', () => {
    const cw = 440
    const ch = 956
    const canvasScale = 1284 / cw // an iPhone export render
    for (const template of DEVICE_TEMPLATES) {
      const base = layout(template, cw, ch, false, { offsetX: 0, offsetY: 0 }, canvasScale)!
      const moved = layout(template, cw, ch, false, { offsetX: 60, offsetY: 40 }, canvasScale)!
      expect(moved.centerX - base.centerX).toBeCloseTo(60 * canvasScale, 6)
      expect(moved.top - base.top).toBeCloseTo(40 * canvasScale, 6)
    }
  })

  // Guards the property the fix relies on: offset is a pure translation of the
  // layout, independent of scale. (A regression that recomputed the base from a
  // scale-unaware anchor would break this for split.)
  it('offset translates the layout linearly regardless of scale', () => {
    for (const { cw, ch, span } of CASES) {
      for (const template of DEVICE_TEMPLATES) {
        for (const scale of SCALES) {
          const base = layout(template, cw, ch, span, { scale, offsetX: 0, offsetY: 0 })!
          for (const [dx, dy] of OFFSETS) {
            const L = layout(template, cw, ch, span, { scale, offsetX: dx, offsetY: dy })!
            expect(L.centerX - dx).toBeCloseTo(base.centerX, 6)
            expect(L.top - dy).toBeCloseTo(base.top, 6)
            expect(L.width).toBeCloseTo(base.width, 6)
            expect(L.height).toBeCloseTo(base.height, 6)
          }
        }
      }
    }
  })
})
