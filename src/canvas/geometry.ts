// Rotate a point around a pivot in canvas (y-down) space. Positive degrees =
// clockwise, matching Fabric's `angle`. Lives outside templateLayouts so the
// object renderers (highlight) can use it without an import cycle.
export function rotateAround(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = x - cx
  const dy = y - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

/**
 * Fold any angle into [-180, 180) at 0.1° precision — the canonical range the
 * store keeps rotations in. Sync and the panel sliders both write through
 * this, so +180 and -180 can't alias into a spurious rotation-changed patch.
 */
export function normalizeAngle(a: number): number {
  return Math.round((((a + 180) % 360 + 360) % 360 - 180) * 10) / 10
}
