import { describe, expect, it } from 'vitest'
import {
  applyLayoutSummaryFixes,
  formatLayoutAutofixReport,
  type LayoutAutofixResult,
} from './layoutAutofix'
import type { LayoutIssueCode, LayoutSummary, LayoutSummaryIssue } from './layoutReport'

function issue(
  code: LayoutIssueCode,
  manifestPath: string,
  metrics?: LayoutSummaryIssue['metrics'],
): LayoutSummaryIssue {
  return {
    slideNo: 1,
    slideId: 'slide-1',
    locale: 'en',
    template: 'text-top',
    device: 'iphone',
    code,
    severity: 'warning',
    message: code,
    objects: ['object-1'],
    manifestPaths: [manifestPath],
    suggestedFix: {
      summary: code,
      edits: [{ manifestPath, fields: [], hint: 'fix it' }],
    },
    ...(metrics ? { metrics } : {}),
  }
}

function fixedManifest(result: LayoutAutofixResult): Record<string, unknown> {
  return result.manifest as Record<string, unknown>
}

describe('layout autofix', () => {
  it('reduces text size and enables fit-to-box for text overlap without mutating input', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [
        {
          layout: 'text-top',
          textBlocks: 1,
          texts: [{ fontSize: 40, boxWidth: 0.8 }],
        },
      ],
    }
    const summary: Pick<LayoutSummary, 'issues'> = {
      issues: [issue('text-overlap', 'manifest.json#/slides/0/texts/0')],
    }

    const result = applyLayoutSummaryFixes(manifest, summary)
    const fixed = fixedManifest(result)
    const slide = (fixed.slides as Array<Record<string, unknown>>)[0]
    const text = (slide.texts as Array<Record<string, unknown>>)[0]

    expect(text).toMatchObject({ fontSize: 36, fitToBox: true, boxWidth: 0.752 })
    expect(manifest.slides[0].texts[0]).toEqual({ fontSize: 40, boxWidth: 0.8 })
    expect(result.changes.map((change) => change.fieldPath)).toEqual([
      'manifest.json#/slides/0/texts/0/fontSize',
      'manifest.json#/slides/0/texts/0/fitToBox',
      'manifest.json#/slides/0/texts/0/boxWidth',
    ])
  })

  it('moves overlapping text to the geometry target without shrinking the font', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [{ layout: 'text-top', textBlocks: 1, texts: [{ fontSize: 40, pos: { x: 0.5, y: 0.2 } }] }],
    }
    const result = applyLayoutSummaryFixes(manifest, {
      issues: [
        issue('text-overlap', 'manifest.json#/slides/0/texts/0', {
          posX: 0.5,
          posY: 0.2,
          targetX: 0.5,
          targetY: 0.1,
        }),
      ],
    })
    const fixed = fixedManifest(result)
    const text = ((fixed.slides as Array<Record<string, unknown>>)[0].texts as Array<Record<string, unknown>>)[0]

    expect(text).toMatchObject({ pos: { x: 0.5, y: 0.1 }, fitToBox: true, fontSize: 40 })
    expect(result.changes.map((change) => change.fieldPath)).toEqual([
      'manifest.json#/slides/0/texts/0/pos',
      'manifest.json#/slides/0/texts/0/fitToBox',
    ])
  })

  it('also shrinks the font when a clamped overlap move cannot fully clear', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [{ layout: 'text-top', textBlocks: 1, texts: [{ fontSize: 40 }] }],
    }
    const result = applyLayoutSummaryFixes(manifest, {
      issues: [
        issue('text-overlap', 'manifest.json#/slides/0/texts/0', {
          targetX: 0.5,
          targetY: 0.12,
          shrink: 1,
        }),
      ],
    })
    const fixed = fixedManifest(result)
    const text = ((fixed.slides as Array<Record<string, unknown>>)[0].texts as Array<Record<string, unknown>>)[0]

    expect(text).toMatchObject({ pos: { x: 0.5, y: 0.12 }, fitToBox: true, fontSize: 36 })
    expect(result.changes.map((change) => change.fieldPath)).toEqual([
      'manifest.json#/slides/0/texts/0/pos',
      'manifest.json#/slides/0/texts/0/fitToBox',
      'manifest.json#/slides/0/texts/0/fontSize',
    ])
  })

  it('moves pos-less safe-margin text to the real-geometry target, not a fabricated default', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [{ layout: 'text-top', textBlocks: 1 }],
    }
    const result = applyLayoutSummaryFixes(manifest, {
      issues: [
        issue('safe-margin-overflow', 'manifest.json#/slides/0/texts/0', {
          posX: 0.16,
          posY: 0.02,
          targetX: 0.2,
          targetY: 0.05,
          sides: ['left', 'top'],
        }),
      ],
    })
    const fixed = fixedManifest(result)
    const text = ((fixed.slides as Array<Record<string, unknown>>)[0].texts as Array<Record<string, unknown>>)[0]

    // The fabricated-default path would have produced { x: 0.56, y: 0.12 }.
    expect(text).toMatchObject({ pos: { x: 0.2, y: 0.05 }, fitToBox: true })
  })

  it('narrows the wrap box for safe-margin text flagged wider than the safe area', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [{ layout: 'text-top', textBlocks: 1, texts: [{ boxWidth: 0.9 }] }],
    }
    const result = applyLayoutSummaryFixes(manifest, {
      issues: [
        issue('safe-margin-overflow', 'manifest.json#/slides/0/texts/0', {
          targetX: 0.5,
          targetY: 0.05,
          narrowBox: 1,
          sides: ['left', 'right'],
        }),
      ],
    })
    const fixed = fixedManifest(result)
    const text = ((fixed.slides as Array<Record<string, unknown>>)[0].texts as Array<Record<string, unknown>>)[0]

    expect(text).toMatchObject({ pos: { x: 0.5, y: 0.05 }, fitToBox: true, boxWidth: 0.846 })
  })

  it('creates a sparse text override when moving text inside the safe margin', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [{ layout: 'text-top', textBlocks: 1 }],
    }
    const result = applyLayoutSummaryFixes(manifest, {
      issues: [
        issue(
          'safe-margin-overflow',
          'manifest.json#/slides/0/texts/0',
          { sides: ['left', 'top'] },
        ),
      ],
    })
    const fixed = fixedManifest(result)
    const slide = (fixed.slides as Array<Record<string, unknown>>)[0]
    const text = (slide.texts as Array<Record<string, unknown>>)[0]

    expect(text).toMatchObject({
      pos: { x: 0.56, y: 0.12 },
      fitToBox: true,
    })
  })

  it('moves span badges away from the seam and popup cards away from sources', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [
        {
          layout: 'text-top',
          textBlocks: 1,
          badges: [{ text: 'New', left: 0.5, top: 0.03 }],
          highlights: [
            {
              sourceRegion: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
              popup: { x: 0.45, y: 0.5, width: 0.8 },
            },
          ],
        },
      ],
    }
    const result = applyLayoutSummaryFixes(manifest, {
      issues: [
        issue('badge-seam-overlap', 'manifest.json#/slides/0/badges/0', { seamX: 440 }),
        issue('highlight-popup-source-overlap', 'manifest.json#/slides/0/highlights/0/popup'),
      ],
    })
    const fixed = fixedManifest(result)
    const slide = (fixed.slides as Array<Record<string, unknown>>)[0]
    const badge = (slide.badges as Array<Record<string, unknown>>)[0]
    const highlight = (slide.highlights as Array<Record<string, unknown>>)[0]
    const popup = highlight.popup as Record<string, unknown>

    expect(badge.left).toBe(0.42)
    expect(popup).toMatchObject({ x: 0.39, y: 0.44, width: 0.72 })
  })

  it('applies duplicate issue/path pairs only once per pass', () => {
    const manifest = {
      version: 1,
      name: 'Demo',
      slides: [{ layout: 'text-top', textBlocks: 1, texts: [{ fontSize: 40 }] }],
    }
    const same = issue('text-overlap', 'manifest.json#/slides/0/texts/0')
    const result = applyLayoutSummaryFixes(manifest, { issues: [same, same] })
    const fixed = fixedManifest(result)
    const slide = (fixed.slides as Array<Record<string, unknown>>)[0]
    const text = (slide.texts as Array<Record<string, unknown>>)[0]

    expect(text.fontSize).toBe(36)
    expect(result.appliedIssueCount).toBe(1)
    expect(result.skippedDuplicateIssues).toBe(1)
  })

  it('formats a dry-run report with before and after values', () => {
    const result = applyLayoutSummaryFixes(
      {
        version: 1,
        name: 'Demo',
        slides: [{ layout: 'text-top', textBlocks: 1, badges: [{ left: 0.5 }] }],
      },
      { issues: [issue('badge-seam-overlap', 'manifest.json#/slides/0/badges/0')] },
    )

    expect(formatLayoutAutofixReport(result, { write: false })).toContain(
      'dry-run only; pass --write to update the manifest file.',
    )
    expect(formatLayoutAutofixReport(result, { write: false })).toContain('0.5 -> 0.42')
  })
})
