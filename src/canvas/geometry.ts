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
