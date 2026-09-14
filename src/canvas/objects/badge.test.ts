import { describe, expect, it } from 'vitest'
import { FabricText, Group, Path, Polygon, Rect } from 'fabric'
import { renderBadge, starPoints, LAUREL_SMALL_RATIO } from './badge'
import { makeBadge } from '../../constants/defaults'
import type { Badge } from '../../types/project'

const anchor = { centerX: 500, top: 200 }

function laurel(text: string, stars?: number): Badge {
  const badge = makeBadge(text)
  return { ...badge, style: { ...badge.style, variant: 'laurel', ...(stars !== undefined ? { stars } : {}) } }
}

const childrenOf = (badge: Badge) => (renderBadge(badge, anchor) as Group).getObjects()

describe('renderBadge', () => {
  it('draws a pill as a background rect under its text', () => {
    const kids = childrenOf(makeBadge('New'))
    expect(kids[0]).toBeInstanceOf(Rect)
    expect(kids[1]).toBeInstanceOf(FabricText)
  })

  it('draws a laurel as branches on both sides of the text, with no background', () => {
    const kids = childrenOf(laurel('4.9'))
    expect(kids.some((k) => k instanceof Rect)).toBe(false)
    const branches = kids.filter((k) => k instanceof Path)
    expect(branches).toHaveLength(2)
    expect(branches[0].left).toBeLessThan(branches[1].left)
  })

  it('keeps a laurel at its anchor, which the editor drag sync reads back', () => {
    const group = renderBadge(laurel('4.9\n리뷰 5만 개', 5), anchor)
    expect(group.left).toBeCloseTo(anchor.centerX, 3)
    expect(group.top).toBeCloseTo(anchor.top, 3)
  })

  it('adds a star row only when asked, capped at five', () => {
    expect(childrenOf(laurel('4.9')).some((k) => k instanceof Group)).toBe(false)
    const row = childrenOf(laurel('4.9', 9)).find((k) => k instanceof Group) as Group
    expect(row.getObjects().filter((o) => o instanceof Polygon)).toHaveLength(5)
  })

  it('sets the text after a newline as a smaller second line', () => {
    const texts = childrenOf(laurel('4.9\n리뷰 5만 개')).filter((k): k is FabricText => k instanceof FabricText)
    expect(texts.map((x) => x.text)).toEqual(['4.9', '리뷰 5만 개'])
    expect(texts[1].fontSize).toBeCloseTo(texts[0].fontSize * LAUREL_SMALL_RATIO)
  })
})

describe('starPoints', () => {
  it('alternates outer and inner vertices, starting at the top point', () => {
    const pts = starPoints(10)
    expect(pts).toHaveLength(10)
    expect(pts[0].x).toBeCloseTo(0)
    expect(pts[0].y).toBeCloseTo(-10)
    expect(Math.hypot(pts[1].x, pts[1].y)).toBeCloseTo(4.5)
  })
})
