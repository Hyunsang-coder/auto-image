import { describe, expect, it } from 'vitest'
import { Rect, type FabricObject, type TPointerEvent, type Transform } from 'fabric'
import { addTextBlocks, attachCropControls, cropScreenBounds, deviceBodyAnchors, getDeviceDimensions, getDeviceLayout, rotateAround, trimCrop } from './templateLayouts'
import { canvasPointToRegionOrigin, regionCenterOnCanvas } from './objects/highlight'
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

// trimCrop: dragging one edge control of the floating handle, in handle-local
// coords (center origin). Only the dragged edge's fraction changes; each edge
// clamps to [0, 0.45].
describe('trimCrop (edge-control drag)', () => {
  const FULL = { w: 400, h: 800 }
  const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }

  it('drags each edge inward by the local-space distance', () => {
    const size = { w: 400, h: 800 } // uncropped: handle == full
    expect(trimCrop('right', { x: 100, y: 0 }, ZERO, FULL, size).right).toBeCloseTo(0.25, 6)
    expect(trimCrop('left', { x: -100, y: 0 }, ZERO, FULL, size).left).toBeCloseTo(0.25, 6)
    expect(trimCrop('top', { x: 0, y: -300 }, ZERO, FULL, size).top).toBeCloseTo(0.125, 6)
    expect(trimCrop('bottom', { x: 0, y: 200 }, ZERO, FULL, size).bottom).toBeCloseTo(0.25, 6)
  })

  it('leaves the other edges untouched', () => {
    const crop = { top: 0.1, right: 0.2, bottom: 0.05, left: 0.15 }
    const size = { w: FULL.w * 0.65, h: FULL.h * 0.85 }
    const next = trimCrop('right', { x: 0, y: 0 }, crop, FULL, size)
    expect(next.top).toBe(crop.top)
    expect(next.bottom).toBe(crop.bottom)
    expect(next.left).toBe(crop.left)
  })

  it('accumulates on top of an existing crop', () => {
    const crop = { ...ZERO, right: 0.2 }
    const size = { w: FULL.w * 0.8, h: FULL.h } // 320 wide
    // Right edge sits at local x=160; dragging to 120 trims 40px = 0.1 more.
    expect(trimCrop('right', { x: 120, y: 0 }, crop, FULL, size).right).toBeCloseTo(0.3, 6)
  })

  it('clamps to the 0.45 ceiling and the 0 floor (no negative crop)', () => {
    const size = { w: 400, h: 800 }
    // Massive inward drag → ceiling.
    expect(trimCrop('right', { x: -300, y: 0 }, ZERO, FULL, size).right).toBe(0.45)
    // Outward drag past the full footprint → floor.
    const cropped = { ...ZERO, right: 0.2 }
    const croppedSize = { w: 320, h: 800 }
    expect(trimCrop('right', { x: 400, y: 0 }, cropped, FULL, croppedSize).right).toBe(0)
  })
})

// cropEdgeAction through the real attached controls: a left/top trim moves the
// body anchor, so the raw anchors must advance by the same (unrotated) delta or
// syncToZustand reads the shift as a drag offset and the card jumps on release.
describe('cropEdgeAction keeps the raw anchors in step with the trim', () => {
  const FULL = { w: 320, h: 640 }
  const OFFSET = { x: 60, y: 40 }

  function makeBody(angle = 0) {
    const body = new Rect({ left: 100, top: 150, width: FULL.w, height: FULL.h, originX: 'left', originY: 'top', angle })
    Object.assign(body, {
      _crop: { top: 0, right: 0, bottom: 0, left: 0 },
      _fullW: FULL.w,
      _fullH: FULL.h,
      _baseRawLeft: 100 - OFFSET.x,
      _baseRawTop: 150 - OFFSET.y,
    })
    attachCropControls(body)
    return body as Rect & { _crop: { top: number; right: number; bottom: number; left: number }; _baseRawLeft: number; _baseRawTop: number }
  }

  function dragEdge(body: Rect, key: string, local: { x: number; y: number }) {
    // Control handlers receive the pointer in scene coords; map the local
    // (center-origin, rotated-with-the-body) point the way Fabric would.
    const c = body.getCenterPoint()
    const p = rotateAround(local.x, local.y, 0, 0, body.angle ?? 0)
    return body.controls[key].actionHandler({} as TPointerEvent, { target: body } as unknown as Transform, c.x + p.x, c.y + p.y)
  }

  it('left trim moves anchor + raw together, offset capture unchanged', () => {
    const body = makeBody()
    dragEdge(body, 'cropL', { x: -FULL.w / 2 + 40, y: 0 })
    expect(body.left).toBeCloseTo(140, 6)
    expect(body._crop.left).toBeCloseTo(40 / FULL.w, 6)
    expect(body._baseRawLeft).toBeCloseTo(80, 6)
    // Sync derivation (FabricCanvas.syncToZustand, angle 0):
    expect(Math.round((body.left ?? 0) - body._baseRawLeft)).toBe(OFFSET.x)
  })

  it('top trim moves anchor + raw together, offset capture unchanged', () => {
    const body = makeBody()
    dragEdge(body, 'cropT', { x: 0, y: -FULL.h / 2 + 50 })
    expect(body.top).toBeCloseTo(200, 6)
    expect(body._crop.top).toBeCloseTo(50 / FULL.h, 6)
    expect(body._baseRawTop).toBeCloseTo(160, 6)
    expect(Math.round((body.top ?? 0) - body._baseRawTop)).toBe(OFFSET.y)
  })

  it('right/bottom trims leave both anchors fixed', () => {
    const body = makeBody()
    dragEdge(body, 'cropR', { x: FULL.w / 2 - 30, y: 0 })
    dragEdge(body, 'cropB', { x: 0, y: FULL.h / 2 - 60 })
    expect(body.left).toBeCloseTo(100, 6)
    expect(body.top).toBeCloseTo(150, 6)
    expect(body._baseRawLeft).toBeCloseTo(100 - OFFSET.x, 6)
    expect(body._baseRawTop).toBeCloseTo(150 - OFFSET.y, 6)
    expect(body._crop.right).toBeCloseTo(30 / FULL.w, 6)
    expect(body._crop.bottom).toBeCloseTo(60 / FULL.h, 6)
  })

  it('on a tilted body the anchor moves along rotated axes, the raw along plain axes', () => {
    const body = makeBody(30)
    dragEdge(body, 'cropT', { x: 0, y: -FULL.h / 2 + 50 })
    // Raw anchors live in the unrotated frame: plain (0, dT).
    expect(body._baseRawLeft).toBeCloseTo(100 - OFFSET.x, 6)
    expect(body._baseRawTop).toBeCloseTo(150 - OFFSET.y + 50, 6)
    // Body anchor moves by R(30°)·(0, 50) — the same vector sync re-derives via
    // rotateAround on the raws, so the captured offset stays the user's drag.
    const d = rotateAround(0, 50, 0, 0, 30)
    expect(body.left).toBeCloseTo(100 + d.x, 6)
    expect(body.top).toBeCloseTo(150 + d.y, 6)
  })
})

// Rotation-aware offset capture: after an mtr drag, sync re-derives the base by
// rotating the raw (unrotated) anchors at the NEW angle. The identity
// rotate(P+o, C+o, θ) = rotate(P, C, θ) + o guarantees the captured delta is
// exactly the user's offset at any tilt.
describe('offset capture stays exact under rotation', () => {
  const ANGLES = [0, 15, -30, 90, 179]
  const OFFSETS = [[0, 0], [60, 40], [-50, -30]] as const

  it('body − rotated raw base === offset for every angle', () => {
    for (const θ of ANGLES) {
      for (const [dx, dy] of OFFSETS) {
        const L = layout('text-top', 440, 956, false, { offsetX: dx, offsetY: dy })!
        // Production placement (templateLayouts.addDeviceFrame):
        const bodyLeft = L.centerX - L.width / 2
        const bodyTop = L.top
        const pivot = { x: L.centerX, y: L.top + L.height / 2 }
        const body = rotateAround(bodyLeft, bodyTop, pivot.x, pivot.y, θ)
        // Raw anchors stored on the body (offset-free):
        const rawLeft = bodyLeft - dx
        const rawTop = bodyTop - dy
        const basePivot = { x: pivot.x - dx, y: pivot.y - dy }
        // Sync derivation (FabricCanvas.syncToZustand):
        const base = rotateAround(rawLeft, rawTop, basePivot.x, basePivot.y, θ)
        expect(Math.round(body.x - base.x)).toBe(dx)
        expect(Math.round(body.y - base.y)).toBe(dy)
      }
    }
  })
})

// Full mtr round-trip: render places the (possibly cropped) floating card and
// rotates it about the device center; an mtr drag then spins it about its OWN
// center (Fabric centeredRotation); sync re-derives the base about the stored
// pivot. The released anchor and the next render must coincide for any crop
// and any starting angle — this only holds when the stored pivot is the
// offset-free twin of the render pivot (crop-free!), which is what regressed
// when basePivotY inherited the crop shift.
describe('mtr rotation round-trip is exact for cropped cards and non-zero start angles', () => {
  const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }
  const CROPS = [
    ZERO,
    { ...ZERO, top: 0.2 },
    { ...ZERO, left: 0.2 },
    { top: 0.1, right: 0.15, bottom: 0.3, left: 0.05 },
  ]
  const SPINS = [
    [0, 30],
    [30, 75],
    [45, -60],
  ] as const
  const OFFSETS = [
    [0, 0],
    [60, 40],
  ] as const

  // Render placement replicated from addDeviceFrame's floating branch; the
  // stored anchors/pivot come from the REAL deviceBodyAnchors so this test
  // breaks if the production derivation regresses.
  function renderBody(crop: typeof ZERO, dx: number, dy: number, θ: number) {
    const L = layout('text-top', 440, 956, false, { show: false, offsetX: dx, offsetY: dy })!
    const C = cropScreenBounds({ left: L.centerX - L.width / 2, top: L.top, width: L.width, height: L.height, rx: 0 }, crop)
    const pivot = { x: L.centerX, y: L.top + L.height / 2 }
    const a = deviceBodyAnchors(L, dx, dy, 1, crop)
    return {
      anchor: rotateAround(C.left, C.top, pivot.x, pivot.y, θ),
      center: rotateAround(C.left + C.width / 2, C.top + C.height / 2, pivot.x, pivot.y, θ),
      size: { w: C.width, h: C.height },
      raw: { x: a.rawLeft, y: a.rawTop },
      basePivot: { x: a.pivotX, y: a.pivotY },
    }
  }

  for (const crop of CROPS) {
    for (const [from, to] of SPINS) {
      for (const [dx, dy] of OFFSETS) {
        it(`crop(${crop.top},${crop.right},${crop.bottom},${crop.left}) · ${from}°→${to}° · offset(${dx},${dy})`, () => {
          const r = renderBody(crop, dx, dy, from)
          // mtr drag: Fabric keeps the body center fixed and re-derives the
          // anchor for the new angle: anchor = center − R(θ)·(w/2, h/2).
          const half = rotateAround(r.size.w / 2, r.size.h / 2, 0, 0, to)
          const released = { x: r.center.x - half.x, y: r.center.y - half.y }
          // Sync derivation (FabricCanvas.syncToZustand), without the int
          // rounding production applies to the stored offset:
          const base = rotateAround(r.raw.x, r.raw.y, r.basePivot.x, r.basePivot.y, to)
          const captured = { x: released.x - base.x, y: released.y - base.y }
          // Next render at the captured offset must land exactly on the
          // released anchor — otherwise the card visibly snaps.
          const again = renderBody(crop, captured.x, captured.y, to)
          expect(again.anchor.x).toBeCloseTo(released.x, 6)
          expect(again.anchor.y).toBeCloseTo(released.y, 6)
        })
      }
    }
  }
})

// Loupe geometry: the card renders at regionCenterOnCanvas, and a dragged
// card maps back to a region origin via canvasPointToRegionOrigin. The two
// must be exact inverses at any device tilt, or the loupe jumps on release.
describe('loupe region ↔ canvas mapping', () => {
  const SB = { left: 48.4, top: 286.8, width: 343.2, height: 745.7 }
  const REGION = { x: 0.2, y: 0.35, w: 0.4, h: 0.12 }

  it('center lands inside the screen box, tilt rotates it about the box center', () => {
    const flat = regionCenterOnCanvas(SB, REGION, 0)
    expect(flat.x).toBeCloseTo(SB.left + SB.width * 0.4, 6)
    expect(flat.y).toBeCloseTo(SB.top + SB.height * 0.41, 6)
    const tilted = regionCenterOnCanvas(SB, REGION, 30)
    const expected = rotateAround(flat.x, flat.y, SB.left + SB.width / 2, SB.top + SB.height / 2, 30)
    expect(tilted.x).toBeCloseTo(expected.x, 6)
    expect(tilted.y).toBeCloseTo(expected.y, 6)
  })

  it('round-trips exactly at any rotation', () => {
    for (const θ of [0, 33, -120, 179]) {
      const center = regionCenterOnCanvas(SB, REGION, θ)
      const origin = canvasPointToRegionOrigin(SB, { w: REGION.w, h: REGION.h }, center, θ)
      expect(origin.x).toBeCloseTo(REGION.x, 6)
      expect(origin.y).toBeCloseTo(REGION.y, 6)
    }
  })

  it('clamps the dragged loupe so the sampling window stays inside the shot', () => {
    const farOut = { x: SB.left - 500, y: SB.top + SB.height + 500 }
    const origin = canvasPointToRegionOrigin(SB, { w: 0.4, h: 0.12 }, farOut, 0)
    expect(origin.x).toBe(0)
    expect(origin.y).toBe(1 - 0.12)
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
