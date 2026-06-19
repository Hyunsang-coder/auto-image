import { describe, expect, it } from 'vitest'
import {
  createLayoutSummary,
  summarizeLayoutReport,
  validateLayoutEntry,
  type LayoutBox,
  type LayoutLayer,
  type LayoutRect,
  type LayoutReportEntry,
  type LayoutReportEntryBase,
} from './layoutReport'

function r(x: number, y: number, width: number, height: number): LayoutRect {
  return {
    x,
    y,
    width,
    height,
    right: x + width,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  }
}

function box(
  id: string,
  layer: LayoutLayer,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<LayoutBox> = {},
): LayoutBox {
  const rect = r(x, y, width, height)
  return {
    id,
    layer,
    manifestPath: `manifest.json#/slides/0/${id.replaceAll(':', '/')}`,
    canvasBox: rect,
    outputBox: rect,
    visibleBox: rect,
    ...extra,
  }
}

function entry(boxes: Partial<LayoutReportEntryBase['boxes']>, extra: Partial<LayoutReportEntryBase> = {}): LayoutReportEntryBase {
  return {
    slideNo: 1,
    slideId: 'slide-1',
    locale: 'en',
    template: 'text-top',
    device: 'iphone',
    canvas: { width: 1000, height: 2000 },
    output: { width: 1000, height: 2000 },
    page: { x: 0, y: 0, width: 1000, height: 2000 },
    safeMargin: { x: 50, y: 100 },
    safeArea: r(50, 100, 900, 1800),
    boxes: {
      text: [],
      device: [],
      screenshot: [],
      highlightSource: [],
      highlightPopup: [],
      badge: [],
      ...boxes,
    },
    ...extra,
  }
}

describe('layout validator', () => {
  it('reports text overlap and safe-margin overflow', () => {
    const issues = validateLayoutEntry(entry({
      text: [box('text:leader:0', 'text', 40, 150, 220, 90)],
      badge: [box('badge:b1', 'badge', 100, 165, 130, 50, { badgeId: 'b1' })],
    }))

    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['text-overlap', 'safe-margin-overflow']),
    )
    expect(issues.every((i) => i.manifestPaths.length > 0)).toBe(true)
    expect(issues.every((i) => i.suggestedFix.edits.length > 0)).toBe(true)
  })

  it('does not flag text over a full-bleed screenshot as a screenshot overlap', () => {
    const issues = validateLayoutEntry(entry({
      text: [box('text:leader:0', 'text', 200, 300, 300, 120)],
      screenshot: [box('screenshot', 'screenshot', 0, 0, 1000, 2000)],
    }))

    expect(issues.some((i) => i.code === 'text-overlap')).toBe(false)
  })

  it('reports a badge crossing the span seam once on the leader entry', () => {
    const base = entry(
      { badge: [box('badge:b1', 'badge', 970, 120, 90, 40, { badgeId: 'b1' })] },
      { canvas: { width: 2000, height: 2000 }, span: { groupId: 'span-1', role: 'leader', seamX: 1000 } },
    )

    expect(validateLayoutEntry(base).map((i) => i.code)).toContain('badge-seam-overlap')
    expect(validateLayoutEntry({ ...base, span: { groupId: 'span-1', role: 'follower', seamX: 1000 } }).map((i) => i.code))
      .not.toContain('badge-seam-overlap')
  })

  it('reports highlight popup source overlap and screen overflow', () => {
    const issues = validateLayoutEntry(entry({
      highlightSource: [
        box('highlight-source:h1', 'highlight-source', 300, 300, 100, 100, { highlightId: 'h1' }),
        box('highlight-source:h2', 'highlight-source', 100, 100, 80, 80, { highlightId: 'h2' }),
      ],
      highlightPopup: [
        box('highlight-popup:h1', 'highlight-popup', 320, 320, 220, 160, { highlightId: 'h1' }),
        box('highlight-popup:h2', 'highlight-popup', 850, 1850, 220, 180, { highlightId: 'h2' }),
      ],
    }))

    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['highlight-popup-source-overlap', 'highlight-popup-overflow']),
    )
  })

  it('summarizes issue counts by code', () => {
    const base = entry({
      text: [box('text:leader:0', 'text', 40, 150, 220, 90)],
      badge: [box('badge:b1', 'badge', 100, 165, 130, 50, { badgeId: 'b1' })],
    })
    const render: LayoutReportEntry = { ...base, issues: validateLayoutEntry(base) }

    expect(summarizeLayoutReport([render])).toMatchObject({
      renderCount: 1,
      affectedRenderCount: 1,
      byCode: {
        'text-overlap': 1,
        'safe-margin-overflow': 1,
      },
    })
  })

  it('creates an agent-facing flat issue summary', () => {
    const base = entry({
      highlightPopup: [
        box('highlight-popup:h1', 'highlight-popup', 850, 1850, 220, 180, {
          highlightId: 'h1',
          manifestPath: 'manifest.json#/slides/0/highlights/0/popup',
        }),
      ],
    })
    const render: LayoutReportEntry = { ...base, issues: validateLayoutEntry(base) }

    const summary = createLayoutSummary({
      version: 1,
      generatedAt: '2026-06-19T00:00:00.000Z',
      project: { id: 'project-1', name: 'Demo', sourceLocale: 'en', targetLocales: ['ja'] },
      summary: summarizeLayoutReport([render]),
      renders: [render],
    })

    const overflow = summary.issues.find((issue) => issue.code === 'highlight-popup-overflow')
    expect(overflow).toMatchObject({
      slideNo: 1,
      locale: 'en',
      code: 'highlight-popup-overflow',
      manifestPaths: ['manifest.json#/slides/0/highlights/0/popup'],
      suggestedFix: {
        edits: [{
          manifestPath: 'manifest.json#/slides/0/highlights/0/popup',
          fields: ['x', 'y', 'width'],
        }],
      },
    })
  })
})
