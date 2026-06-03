import { describe, expect, it } from 'vitest'
import type { FabricObject } from 'fabric'
import { addTextBlocks, cropScreenBounds, getDeviceDimensions, getDeviceLayout } from './templateLayouts'
import { LAYER_NAMES } from './layerNames'
import type { Caption, Slide } from '../types/project'

function makeSlide(
  template: Slide['template'],
  deviceFrame: Partial<Slide['deviceFrame']> = {},
): Slide {
  return {
    id: 's1',
    template,
    deviceFrame: { model: 'iphone-16-pro', show: true, color: 'graphite', scale: 1, ...deviceFrame },
    texts: [{ text: '', translations: {}, style: { fontFamily: 'Inter', fontSize: 10, fontWeight: 400, color: '#000', textAlign: 'center' } }],
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

// Floating-mode edge trim: cropScreenBounds shrinks the visible card by per-edge
// fractions without touching the image fit. The drag handle and the clip mask
// both go through it, so the handle's base shift must keep the drag round-trip
// exact (same invariant as the uncropped cases above).
describe('cropScreenBounds (floating edge trim)', () => {
  const B = { left: 100, top: 200, width: 400, height: 800, rx: 24 }

  it('no crop → identity', () => {
    expect(cropScreenBounds(B)).toEqual(B)
    expect(cropScreenBounds(B, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual(B)
  })

  it('bottom trim shortens the card, top edge fixed', () => {
    const c = cropScreenBounds(B, { top: 0, right: 0, bottom: 0.3, left: 0 })
    expect(c.top).toBe(B.top)
    expect(c.height).toBeCloseTo(B.height * 0.7, 6)
    expect(c.left).toBe(B.left)
    expect(c.width).toBe(B.width)
  })

  it('per-edge trims shift origin and shrink size, rx unchanged', () => {
    const c = cropScreenBounds(B, { top: 0.1, right: 0.2, bottom: 0.3, left: 0.05 })
    expect(c.left).toBeCloseTo(100 + 400 * 0.05, 6)
    expect(c.top).toBeCloseTo(200 + 800 * 0.1, 6)
    expect(c.width).toBeCloseTo(400 * 0.75, 6)
    expect(c.height).toBeCloseTo(800 * 0.6, 6)
    expect(c.rx).toBe(B.rx)
  })

  it('drag round-trip stays exact with a crop applied', () => {
    const crop = { top: 0.1, right: 0.15, bottom: 0.3, left: 0.05 }
    for (const [dx, dy] of [[0, 0], [60, 40], [-50, -30]] as const) {
      const L = layout('text-top', 440, 956, false, { show: false, offsetX: dx, offsetY: dy })!
      const base = layout('text-top', 440, 956, false, { show: false, offsetX: 0, offsetY: 0 })!
      // Production derivation (templateLayouts.addDeviceFrame, floating branch):
      // both the handle and _baseLeft/_baseTop get the same crop shift, so the
      // captured delta is still exactly the user's offset.
      const body = cropScreenBounds({ left: L.centerX - L.width / 2, top: L.top, width: L.width, height: L.height, rx: 0 }, crop)
      const baseLeft = (base.centerX - base.width / 2) + base.width * crop.left
      const baseTop = base.top + base.height * crop.top
      expect(Math.round(body.left - baseLeft)).toBe(dx)
      expect(Math.round(body.top - baseTop)).toBe(dy)
    }
  })
})

// addTextBlocks lays out slide.texts (1..4) as a vertical stack from headlineTop,
// advancing the cursor by each block's rendered height + gap. A block carrying a
// `pos` is absolute (positioned by its fractions) and must NOT advance the stack
// cursor. Every block is tagged layerName 'text' + its textIndex. No size cap.
type AddedObj = FabricObject & { layerName?: string; textIndex?: number; height: number; top: number }

function fakeCanvas() {
  const added: AddedObj[] = []
  return {
    canvas: { add: (o: AddedObj) => { added.push(o) } } as never,
    added,
  }
}

function cap(text: string, over: Partial<Caption> = {}): Caption {
  return {
    text,
    translations: {},
    style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: '#000', textAlign: 'center' },
    ...over,
  }
}

function textSlide(texts: Caption[]): Slide {
  const s = makeSlide('text-top')
  s.texts = texts
  return s
}

const OPTS = { cw: 440, ch: 956, headlineCenterX: 220, headlineTop: 50, width: 374, gap: 8, scale: 1 }

describe('addTextBlocks', () => {
  it('renders one object per block, tagged layerName "text" + textIndex', () => {
    for (const n of [1, 2, 4]) {
      const { canvas, added } = fakeCanvas()
      const texts = Array.from({ length: n }, (_, i) => cap(`block ${i}`))
      addTextBlocks(canvas, textSlide(texts), OPTS)
      expect(added).toHaveLength(n)
      added.forEach((o, i) => {
        expect(o.layerName).toBe(LAYER_NAMES.TEXT)
        expect(o.textIndex).toBe(i)
      })
    }
  })

  it('stacks non-positioned blocks: each starts below the previous + gap', () => {
    const { canvas, added } = fakeCanvas()
    addTextBlocks(canvas, textSlide([cap('one'), cap('two'), cap('three')]), OPTS)
    expect(added[0].top).toBe(OPTS.headlineTop)
    // Each subsequent block sits at prev.top + prev.height + gap*scale.
    for (let i = 1; i < added.length; i++) {
      const expected = added[i - 1].top + added[i - 1].height + OPTS.gap * OPTS.scale
      expect(added[i].top).toBeCloseTo(expected, 6)
    }
  })

  it('a block with pos is absolute and does NOT advance the stack cursor', () => {
    const { canvas, added } = fakeCanvas()
    // Middle block is absolutely positioned; the third block should stack right
    // after the first (as if the middle one weren't in the flow).
    const blocks = [cap('one'), cap('floating', { pos: { x: 0.5, y: 0.6 } }), cap('three')]
    addTextBlocks(canvas, textSlide(blocks), OPTS)
    expect(added[1].top).toBeCloseTo(0.6 * OPTS.ch, 6) // absolute placement
    const afterFirst = added[0].top + added[0].height + OPTS.gap * OPTS.scale
    expect(added[2].top).toBeCloseTo(afterFirst, 6) // cursor not advanced by the pos block
  })

  it('does not cap a later block to block 0 size (no size hierarchy)', () => {
    const { canvas, added } = fakeCanvas()
    const small = cap('a', { style: { fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: '#000', textAlign: 'center' } })
    const big = cap('b', { style: { fontFamily: 'Inter', fontSize: 80, fontWeight: 700, color: '#000', textAlign: 'center' } })
    addTextBlocks(canvas, textSlide([small, big]), OPTS)
    // Block 1 keeps its own (larger) size; it is NOT clamped to block 0's.
    expect((added[1] as AddedObj & { fontSize?: number }).fontSize).toBe(80)
  })
})
