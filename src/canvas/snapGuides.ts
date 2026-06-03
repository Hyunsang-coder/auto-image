// Pure alignment-snap math — no Fabric/React deps so it is unit-testable.
// The caller supplies the dragged object's bounding box and the candidate
// alignment coordinates (canvas center/margins + every other object's edges and
// centers) in model (un-zoomed) coordinates; this returns the shift to apply
// and which guide lines are now coincident so they can be drawn.

export interface SnapBox {
  left: number
  centerX: number
  right: number
  top: number
  centerY: number
  bottom: number
}

export interface SnapResult {
  /** Shift to add to the target's position so an edge/center lands on a guide. */
  dx: number
  dy: number
  /** X coords (model) where a vertical guide should be drawn (post-snap). */
  vLines: number[]
  /** Y coords (model) where a horizontal guide should be drawn (post-snap). */
  hLines: number[]
}

// Smallest signed shift that lands one of `anchors` on one of `candidates`,
// among pairs within `threshold`. 0 if nothing is close enough.
function bestShift(anchors: number[], candidates: number[], threshold: number): number {
  let best = 0
  let bestAbs = Infinity
  for (const a of anchors) {
    for (const c of candidates) {
      const d = c - a
      const abs = Math.abs(d)
      if (abs <= threshold && abs < bestAbs) {
        bestAbs = abs
        best = d
      }
    }
  }
  return best
}

// Candidate coords that an anchor sits exactly on after `shift` is applied —
// the lines to draw so the user sees what they aligned to.
function coincident(anchors: number[], candidates: number[], shift: number, eps: number): number[] {
  const hits = new Set<number>()
  for (const a of anchors) {
    for (const c of candidates) {
      if (Math.abs(a + shift - c) <= eps) hits.add(c)
    }
  }
  return [...hits]
}

export function computeSnap(
  box: SnapBox,
  candidatesX: number[],
  candidatesY: number[],
  threshold: number,
  showEps = 0.5,
): SnapResult {
  const ax = [box.left, box.centerX, box.right]
  const ay = [box.top, box.centerY, box.bottom]
  const dx = bestShift(ax, candidatesX, threshold)
  const dy = bestShift(ay, candidatesY, threshold)
  return {
    dx,
    dy,
    vLines: coincident(ax, candidatesX, dx, showEps),
    hLines: coincident(ay, candidatesY, dy, showEps),
  }
}
