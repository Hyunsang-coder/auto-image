import { Path, Text } from 'fabric'
import type { FabricObject } from 'fabric'
import type { EmojiOrnamentShape, Ornament, OrnamentShape, VectorOrnamentShape } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'
import { starPoints } from './badge'

// Ornaments are single-colour vector marks inked in `color`. The emoji set they
// replaced is no longer offered, but saved projects still carry it, so those
// shapes keep rendering as system emoji glyphs (where color doesn't apply).

export interface VectorOrnament {
  /** The artboard the path is drawn in; the picker icon uses it as its viewBox. */
  box: [number, number]
  d: string
  fill: boolean
  /** In artboard units. On a filled shape it only rounds the corners. */
  strokeWidth?: number
  /** Annotation marks point at the UI, so they paint above the device and text. */
  front?: boolean
}

function sparkle(cx: number, cy: number, r: number): string {
  const a = 0.05 * r
  const b = 0.45 * r
  return (
    `M${cx} ${cy - r}C${cx + a} ${cy - b} ${cx + b} ${cy - a} ${cx + r} ${cy}` +
    `C${cx + b} ${cy + a} ${cx + a} ${cy + b} ${cx} ${cy + r}` +
    `C${cx - a} ${cy + b} ${cx - b} ${cy + a} ${cx - r} ${cy}` +
    `C${cx - b} ${cy - a} ${cx - a} ${cy - b} ${cx} ${cy - r}Z`
  )
}

const STAR = starPoints(10.5)
  .map((p, i) => `${i ? 'L' : 'M'}${(12 + p.x).toFixed(2)} ${(13 + p.y).toFixed(2)}`)
  .join('') + 'Z'

export const ORNAMENT_VECTORS: Record<VectorOrnamentShape, VectorOrnament> = {
  sparkle: { box: [24, 24], d: sparkle(12, 12, 12), fill: true },
  'sparkle-trio': { box: [48, 48], d: sparkle(18, 28, 17) + sparkle(39, 10, 8) + sparkle(41, 36, 5), fill: true },
  'star-filled': { box: [24, 24], d: STAR, fill: true, strokeWidth: 1.6 },
  quote: {
    box: [56, 40],
    d:
      'M2 27C2 14 8 5 19 1L21 5C14 8.5 11 12 11 16.2C11.6 16.1 12.3 16 13 16A11 11 0 1 1 2 27Z' +
      'M33 27C33 14 39 5 50 1L52 5C45 8.5 42 12 42 16.2C42.6 16.1 43.3 16 44 16A11 11 0 1 1 33 27Z',
    fill: true,
  },
  'hand-underline': { box: [200, 22], d: 'M2 18C60 6 140 1 198 7C142 9 64 13 2 18Z', fill: true },
  'hand-circle': {
    box: [200, 104],
    d: 'M64 10C22 16 4 48 28 76C58 104 162 100 190 66C206 42 182 8 112 5C72 3 42 12 22 30',
    fill: false,
    strokeWidth: 3.5,
    front: true,
  },
  'hand-arrow': { box: [120, 100], d: 'M8 90C18 44 56 16 106 18M88 5L107 18L90 33', fill: false, strokeWidth: 5.5, front: true },
  'hand-check': { box: [64, 50], d: 'M5 28C11 33 16 39 21 45C31 27 45 12 60 5', fill: false, strokeWidth: 6, front: true },
  'heart-filled': {
    box: [24, 24],
    d: 'M12 21s-7.5-4.6-10-9.2C.3 8.5 2.2 4 6.4 4c2.3 0 4 1.3 5.6 3.2C13.6 5.3 15.3 4 17.6 4c4.2 0 6.1 4.5 4.4 7.8C19.5 16.4 12 21 12 21Z',
    fill: true,
  },
}

export function isFrontOrnament(shape: OrnamentShape): boolean {
  return ORNAMENT_VECTORS[shape as VectorOrnamentShape]?.front === true
}

export const ORNAMENT_EMOJI: Record<EmojiOrnamentShape, string> = {
  star: '⭐',
  sparkles: '✨',
  heart: '❤️',
  flower: '🌸',
  leaf: '🍃',
  paw: '🐾',
  fire: '🔥',
  party: '🎉',
  rocket: '🚀',
  bulb: '💡',
  bolt: '⚡',
  check: '✅',
  thumbsup: '👍',
  trophy: '🏆',
  gem: '💎',
  target: '🎯',
  bell: '🔔',
  hundred: '💯',
}

/** Korean source strings — pass through t(). */
export const ORNAMENT_LABELS: Record<OrnamentShape, string> = {
  sparkle: '스파클',
  'sparkle-trio': '스파클 3개',
  'star-filled': '별',
  quote: '따옴표',
  'hand-underline': '손그림 밑줄',
  'hand-circle': '손그림 동그라미',
  'hand-arrow': '손그림 화살표',
  'hand-check': '손그림 체크',
  'heart-filled': '하트',
  star: '별',
  sparkles: '스파클',
  heart: '하트',
  flower: '꽃',
  leaf: '잎',
  paw: '발자국',
  fire: '불',
  party: '파티',
  rocket: '로켓',
  bulb: '전구',
  bolt: '번개',
  check: '체크',
  thumbsup: '따봉',
  trophy: '트로피',
  gem: '보석',
  target: '과녁',
  bell: '벨',
  hundred: '백점',
}

export interface OrnamentRenderCtx {
  canvasWidth: number
  canvasHeight: number
}

export function renderOrnament(orn: Ornament, ctx: OrnamentRenderCtx): FabricObject | null {
  const obj =
    orn.shape in ORNAMENT_VECTORS
      ? renderVector(orn, ORNAMENT_VECTORS[orn.shape as VectorOrnamentShape], ctx)
      : renderEmoji(orn, ctx)
  // A persisted project may carry a since-removed shape (e.g. dot-grid) — skip.
  if (!obj) return null

  // (x,y) is the ornament center, so originX/Y = center keeps rotation centered.
  obj.set({
    left: ctx.canvasWidth * orn.x,
    top: ctx.canvasHeight * orn.y,
    originX: 'center',
    originY: 'center',
    angle: orn.rotation,
    opacity: orn.opacity,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    borderColor: '#0D99FF',
    cornerColor: '#0D99FF',
    hoverCursor: 'move',
  })
  ;(obj as FabricObject & { layerName: string; ornamentId: string }).layerName = LAYER_NAMES.ORNAMENT
  ;(obj as FabricObject & { ornamentId: string }).ornamentId = orn.id
  return obj
}

function renderVector(orn: Ornament, vector: VectorOrnament, ctx: OrnamentRenderCtx): FabricObject {
  const strokeWidth = vector.strokeWidth ?? 0
  const path = new Path(vector.d, {
    fill: vector.fill ? orn.color : null,
    stroke: strokeWidth ? orn.color : null,
    strokeWidth,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
  })
  // Scale against the stroked width: the drag sync reads size back from
  // getScaledWidth(), which includes the stroke, so this keeps a drag from growing it.
  path.scale((ctx.canvasWidth * orn.size) / (path.width + strokeWidth))
  return path
}

function renderEmoji(orn: Ornament, ctx: OrnamentRenderCtx): FabricObject | null {
  const emoji = ORNAMENT_EMOJI[orn.shape as EmojiOrnamentShape]
  if (!emoji) return null
  // An emoji is ~1em square, so fontSize ≈ target width; the exact size is
  // recovered from getScaledWidth on drag/scale (see syncToZustand).
  return new Text(emoji, { fontSize: ctx.canvasWidth * orn.size })
}
