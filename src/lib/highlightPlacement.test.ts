import { describe, expect, it } from 'vitest'
import { placeHighlightCard, placeHighlightCards, type Box, type PlacementCtx } from './highlightPlacement'

const CTX: PlacementCtx = { canvasWidth: 440, canvasHeight: 956, margin: 20 }

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, width, height }
}

function overlaps(a: Box, b: Box): boolean {
  return (
    Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) &&
    Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top)
  )
}

function placed(center: { x: number; y: number }, size: { width: number; height: number }): Box {
  return box(center.x - size.width / 2, center.y - size.height / 2, size.width, size.height)
}

describe('placeHighlightCard', () => {
  const card = { width: 300, height: 120 }

  it('centers the card horizontally on the canvas', () => {
    expect(placeHighlightCard(card, box(60, 200, 200, 60), [], CTX).x).toBe(220)
  })

  it('drops below a region near the top', () => {
    const c = placeHighlightCard(card, box(60, 200, 200, 60), [], CTX)
    expect(c.y).toBeGreaterThan(260)
  })

  it('goes above when below would run off the bottom', () => {
    const source = box(60, 880, 200, 60)
    const c = placeHighlightCard(card, source, [], CTX)
    expect(placed(c, card).top + card.height).toBeLessThan(source.top)
  })

  it('never covers the region it magnifies', () => {
    for (const top of [40, 200, 400, 600, 800, 900]) {
      const source = box(60, top, 200, 60)
      expect(overlaps(placed(placeHighlightCard(card, source, [], CTX), card), source)).toBe(false)
    }
  })

  it('stays inside the canvas margins', () => {
    for (const top of [0, 300, 700, 940]) {
      const b = placed(placeHighlightCard(card, box(60, top, 200, 40), [], CTX), card)
      expect(b.top).toBeGreaterThanOrEqual(CTX.margin)
      expect(b.top + b.height).toBeLessThanOrEqual(CTX.canvasHeight - CTX.margin)
    }
  })

  it('flips to the other side rather than land on a caption', () => {
    const source = box(60, 300, 200, 60)
    const caption = box(0, 380, 440, 300) // fills the space below the region
    const c = placeHighlightCard(card, source, [caption], CTX)
    expect(c.y).toBeLessThan(source.top)
  })

  it('takes the lesser evil when both sides collide', () => {
    const source = box(60, 400, 200, 60)
    const heavy = box(0, 480, 440, 400) // below: full-width blocker
    const light = box(0, 340, 60, 40) // above: a sliver
    const c = placeHighlightCard(card, source, [heavy, light], CTX)
    expect(c.y).toBeLessThan(source.top)
  })

  it('centers a card too tall for the margins instead of jamming an edge', () => {
    const tall = { width: 300, height: 1200 }
    expect(placeHighlightCard(tall, box(60, 400, 200, 60), [], CTX).y).toBe(CTX.canvasHeight / 2)
  })
})

describe('placeHighlightCards', () => {
  const size = { width: 300, height: 120 }

  it('leaves a user-placed card alone', () => {
    const out = placeHighlightCards(
      [{ size, source: box(60, 200, 200, 60), auto: false }],
      [],
      CTX,
    )
    expect(out).toEqual([null])
  })

  it('keeps two auto cards off each other', () => {
    const [a, b] = placeHighlightCards(
      [
        { size, source: box(60, 200, 200, 60), auto: true },
        { size, source: box(60, 300, 200, 60), auto: true },
      ],
      [],
      CTX,
    )
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(overlaps(placed(a!, size), placed(b!, size))).toBe(false)
  })

  it('treats a pinned sibling as an obstacle only once it is an obstacle', () => {
    // The pinned card returns null and contributes nothing, so the auto card
    // places against the source alone — callers pass pinned boxes in `obstacles`.
    const out = placeHighlightCards(
      [
        { size, source: box(60, 200, 200, 60), auto: false },
        { size, source: box(60, 200, 200, 60), auto: true },
      ],
      [],
      CTX,
    )
    expect(out[0]).toBeNull()
    expect(out[1]).not.toBeNull()
  })
})
