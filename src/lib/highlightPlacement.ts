/**
 * Where a loupe's magnified card goes when the user hasn't placed it.
 *
 * Two of the five layout-report rules (`highlight-popup-source-overlap`,
 * `highlight-popup-overflow`) exist only to catch a hand-placed card covering
 * what it magnifies or hanging off the page. Computing the placement makes both
 * unreachable for a card the user never touched.
 *
 * The cap of two loupes per slide is what keeps this a scored pick between two
 * candidates rather than a free-area search: a card goes on one side of its
 * source region or the other, and whichever collides less wins.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface PlacementCtx {
  canvasWidth: number
  canvasHeight: number
  /** Keep-out band at the canvas edge, in px. */
  margin: number
}

/** Gap between the source box and the card, as a fraction of canvas height. */
const GAP_RATIO = 0.025

/**
 * Covering the sampled region defeats the loupe, so that overlap outweighs
 * landing on a caption — which is untidy but still readable.
 */
const SOURCE_OVERLAP_WEIGHT = 4

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

function boxAt(center: { x: number; y: number }, size: { width: number; height: number }): Box {
  return {
    left: center.x - size.width / 2,
    top: center.y - size.height / 2,
    width: size.width,
    height: size.height,
  }
}

/** Pull a center back until its box sits inside the canvas margins. */
function clampCenter(
  center: { x: number; y: number },
  size: { width: number; height: number },
  ctx: PlacementCtx,
): { x: number; y: number } {
  // A card wider or taller than the usable area can't satisfy both edges;
  // centering it splits the overflow instead of jamming it against one side.
  const clampAxis = (v: number, half: number, extent: number): number => {
    const lo = ctx.margin + half
    const hi = extent - ctx.margin - half
    return lo > hi ? extent / 2 : Math.max(lo, Math.min(hi, v))
  }
  return {
    x: clampAxis(center.x, size.width / 2, ctx.canvasWidth),
    y: clampAxis(center.y, size.height / 2, ctx.canvasHeight),
  }
}

/**
 * Place one card: centered horizontally, on whichever side of its source
 * region collides less with the source, the captions, and any card already
 * placed on this slide.
 */
export function placeHighlightCard(
  card: { width: number; height: number },
  source: Box,
  obstacles: Box[],
  ctx: PlacementCtx,
): { x: number; y: number } {
  const gap = ctx.canvasHeight * GAP_RATIO
  const x = ctx.canvasWidth / 2
  const below = { x, y: source.top + source.height + gap + card.height / 2 }
  const above = { x, y: source.top - gap - card.height / 2 }

  let best: { x: number; y: number } | null = null
  let bestScore = Infinity
  // Below first so it wins ties: a card under the region reads as "here it is,
  // bigger", and the caption band is usually above.
  for (const candidate of [below, above]) {
    const center = clampCenter(candidate, card, ctx)
    const box = boxAt(center, card)
    let score = overlapArea(box, source) * SOURCE_OVERLAP_WEIGHT
    for (const o of obstacles) score += overlapArea(box, o)
    if (score < bestScore) {
      bestScore = score
      best = center
    }
  }
  return best as { x: number; y: number }
}

export interface AutoCard {
  /** Card size on canvas, in px. */
  size: { width: number; height: number }
  /** The sampled region's box on canvas, in px. */
  source: Box
  /** False for a card the user placed — it keeps its own position. */
  auto: boolean
}

/**
 * Place every auto card on a slide. Cards are laid in order and each placed
 * card becomes an obstacle for the next, so two loupes don't stack.
 * A non-auto card yields null and keeps whatever the highlight stored.
 */
export function placeHighlightCards(
  cards: AutoCard[],
  obstacles: Box[],
  ctx: PlacementCtx,
): ({ x: number; y: number } | null)[] {
  const taken = [...obstacles]
  return cards.map((card) => {
    if (!card.auto) return null
    const center = placeHighlightCard(card.size, card.source, taken, ctx)
    taken.push(boxAt(center, card.size))
    return center
  })
}
