import { describe, expect, it } from 'vitest'
import { layoutIssueCount, parseLayoutLoopArgs } from './layoutLoop'

describe('layout loop helpers', () => {
  it('parses the default dry-run arguments', () => {
    expect(parseLayoutLoopArgs(['in', 'out'])).toEqual({
      ok: true,
      options: {
        inputDir: 'in',
        outDir: 'out',
        maxRuns: 3,
        write: false,
        fastlane: false,
      },
    })
  })

  it('parses write mode with max runs and explicit manifest', () => {
    expect(parseLayoutLoopArgs([
      'in',
      'out',
      '--write',
      '--max-runs=5',
      '--manifest',
      'in/custom.json',
      '--fastlane',
    ])).toEqual({
      ok: true,
      options: {
        inputDir: 'in',
        outDir: 'out',
        maxRuns: 5,
        write: true,
        fastlane: true,
        manifestPath: 'in/custom.json',
      },
    })
  })

  it('rejects invalid loop arguments', () => {
    expect(parseLayoutLoopArgs(['in', 'out', '--max-runs', '0'])).toEqual({
      ok: false,
      message: '--max-runs must be a positive integer',
    })
    expect(parseLayoutLoopArgs(['in', 'out', '--unknown'])).toEqual({
      ok: false,
      message: 'unknown option: --unknown',
    })
  })

  it('reads issue counts from report-style or flat summaries', () => {
    expect(layoutIssueCount({ summary: { issueCount: 4 }, issues: [] })).toBe(4)
    expect(layoutIssueCount({ issues: [{}, {}] })).toBe(2)
    expect(layoutIssueCount({ summary: { issueCount: -1 }, issues: [] })).toBe(0)
    expect(layoutIssueCount({})).toBeNull()
    expect(layoutIssueCount(null)).toBeNull()
  })
})
