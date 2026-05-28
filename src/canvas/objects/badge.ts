import { FabricText, Group, Rect } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Badge } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

function measureTextWidth(
  text: string,
  fontSize: number,
  fontWeight: number,
  fontFamily: string,
): number {
  const el = document.createElement('canvas')
  const ctx = el.getContext('2d')
  if (!ctx) return text.length * fontSize * 0.55
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  return ctx.measureText(text).width
}

export interface BadgeRenderOpts {
  centerX: number
  top: number
}

export function renderBadge(badge: Badge, opts: BadgeRenderOpts): FabricObject {
  const { style } = badge
  const textW = measureTextWidth(badge.text, style.fontSize, style.fontWeight, 'Inter')
  const badgeW = textW + style.paddingX * 2
  const badgeH = style.fontSize + style.paddingY * 2
  const rx = Math.min(style.borderRadius, badgeH / 2)

  // Children are positioned in world coords; Group normalizes them on construction.
  const bg = new Rect({
    left: opts.centerX - badgeW / 2,
    top: opts.top,
    width: badgeW,
    height: badgeH,
    fill: style.backgroundColor,
    rx,
    ry: rx,
    strokeWidth: 0,
    originX: 'left',
    originY: 'top',
  })

  const text = new FabricText(badge.text, {
    left: opts.centerX,
    top: opts.top + style.paddingY,
    fontSize: style.fontSize,
    fontFamily: 'Inter',
    fontWeight: String(style.fontWeight),
    fill: style.textColor,
    originX: 'center',
    originY: 'top',
  })

  const group = new Group([bg, text], {
    originX: 'center',
    originY: 'top',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    borderColor: '#6366F1',
    cornerColor: '#6366F1',
    hoverCursor: 'move',
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    lockUniScaling: true,
    centeredScaling: true,
    subTargetCheck: false,
  })
  group.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false, mtr: false })
  ;(group as FabricObject & { layerName: string }).layerName = LAYER_NAMES.BADGE
  return group
}
