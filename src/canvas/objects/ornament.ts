import { Text } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Ornament, OrnamentShape } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

// Ornaments are system emoji glyphs (rendered as Fabric Text) — they read far
// better than line-art icons and need no font bundling. Emoji are multicolor
// glyphs, so color/fill don't apply.
export const ORNAMENT_EMOJI: Record<OrnamentShape, string> = {
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

export interface OrnamentRenderCtx {
  canvasWidth: number
  canvasHeight: number
}

export function renderOrnament(orn: Ornament, ctx: OrnamentRenderCtx): FabricObject | null {
  const emoji = ORNAMENT_EMOJI[orn.shape]
  // A persisted project may carry a since-removed shape (e.g. dot-grid) — skip.
  if (!emoji) return null

  // (x,y) is the glyph center, so originX/Y = center keeps rotation centered.
  // An emoji is ~1em square, so fontSize ≈ target width; the exact size is
  // recovered from getScaledWidth on drag/scale (see syncToZustand).
  const obj: FabricObject = new Text(emoji, {
    left: ctx.canvasWidth * orn.x,
    top: ctx.canvasHeight * orn.y,
    originX: 'center',
    originY: 'center',
    fontSize: ctx.canvasWidth * orn.size,
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
