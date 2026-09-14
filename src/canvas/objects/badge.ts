import { FabricText, Group, Path, Polygon, Rect } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Badge } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'
import { scriptFallback } from '../../lib/fonts'
import { LAUREL_MAX_STARS } from '../../constants/defaults'
import { LAUREL_LEFT, LAUREL_RIGHT } from './laurel'

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

// Every laurel measure is a fraction of fontSize, so the editor's
// scale → fontSize sync and export scaling resize the whole lockup together.
export const LAUREL_SMALL_RATIO = 0.42
const LAUREL_ROW_GAP = 0.12
const LAUREL_SIDE_GAP = 0.18
const LAUREL_BRANCH_OVERHANG = 1.3
const LAUREL_LEAF_STROKE = 0.5

export function starPoints(radius: number): { x: number; y: number }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? radius * 0.45 : radius
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

export function renderBadge(badge: Badge, opts: BadgeRenderOpts): FabricObject {
  const children = badge.style.variant === 'laurel' ? laurelChildren(badge, opts) : pillChildren(badge, opts)

  const group = new Group(children, {
    originX: 'center',
    originY: 'top',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    borderColor: '#0D99FF',
    cornerColor: '#0D99FF',
    hoverCursor: 'move',
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    centeredScaling: true,
    subTargetCheck: false,
  })
  // lockUniScaling isn't in Fabric 7's GroupProps type but is honored at
  // runtime; set it via the string-key overload to keep corner drags uniform.
  group.set('lockUniScaling', true)
  group.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false, mtr: false })
  ;(group as FabricObject & { layerName?: string; badgeId?: string }).layerName =
    LAYER_NAMES.BADGE
  ;(group as FabricObject & { badgeId?: string }).badgeId = badge.id
  return group
}

function pillChildren(badge: Badge, opts: BadgeRenderOpts): FabricObject[] {
  const { style } = badge
  const fontFamily = `Inter, ${scriptFallback(badge.text)}`
  const textW = measureTextWidth(badge.text, style.fontSize, style.fontWeight, fontFamily)
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
    fontFamily,
    fontWeight: String(style.fontWeight),
    fill: style.textColor,
    originX: 'center',
    originY: 'top',
  })

  return [bg, text]
}

function laurelChildren(badge: Badge, opts: BadgeRenderOpts): FabricObject[] {
  const { style } = badge
  const ink = style.textColor
  const small = style.fontSize * LAUREL_SMALL_RATIO
  const gap = style.fontSize * LAUREL_ROW_GAP
  const [first, ...rest] = badge.text.split('\n')
  const second = rest.join(' ').trim()
  const stars = Math.max(0, Math.min(LAUREL_MAX_STARS, Math.round(style.stars ?? 0)))

  const text = (value: string, fontSize: number) =>
    new FabricText(value, {
      fontSize,
      fontFamily: `Inter, ${scriptFallback(value)}`,
      fontWeight: String(style.fontWeight),
      fill: ink,
      originX: 'center',
      originY: 'top',
    })

  const rows: FabricObject[] = [text(first, style.fontSize)]
  if (stars > 0) rows.push(starRow(stars, small, ink))
  if (second) rows.push(text(second, small))

  const contentHeight = rows.reduce((h, r) => h + r.getScaledHeight(), 0) + gap * (rows.length - 1)
  const contentWidth = Math.max(...rows.map((r) => r.getScaledWidth()))
  const left = laurelBranch(LAUREL_LEFT, contentHeight * LAUREL_BRANCH_OVERHANG, ink)
  const right = laurelBranch(LAUREL_RIGHT, contentHeight * LAUREL_BRANCH_OVERHANG, ink)
  const branchHeight = left.getScaledHeight()
  const branchOffset = contentWidth / 2 + style.fontSize * LAUREL_SIDE_GAP + left.getScaledWidth() / 2

  // The branches are the tallest children, so their top is the group's top edge —
  // the same anchor the editor's drag sync writes back to badge.top.
  left.set({ left: opts.centerX - branchOffset, top: opts.top + branchHeight / 2 })
  right.set({ left: opts.centerX + branchOffset, top: opts.top + branchHeight / 2 })
  let y = opts.top + (branchHeight - contentHeight) / 2
  for (const row of rows) {
    row.set({ left: opts.centerX, top: y })
    y += row.getScaledHeight() + gap
  }

  const children = [left, ...rows, right]
  for (const child of children) child.setCoords()
  return children
}

function laurelBranch(d: string, height: number, ink: string): Path {
  const branch = new Path(d, {
    fill: ink,
    stroke: ink,
    strokeWidth: LAUREL_LEAF_STROKE,
    strokeLineJoin: 'round',
    originX: 'center',
    originY: 'center',
  })
  branch.scale(height / branch.height)
  return branch
}

function starRow(count: number, size: number, ink: string): Group {
  const stars = Array.from({ length: count }, (_, i) =>
    new Polygon(starPoints(size / 2), {
      left: i * size * 1.15,
      top: 0,
      originX: 'center',
      originY: 'center',
      fill: ink,
      stroke: ink,
      strokeWidth: size * 0.06,
      strokeLineJoin: 'round',
    }),
  )
  return new Group(stars, { originX: 'center', originY: 'top' })
}
