interface LayoutLoopOptions {
  inputDir: string
  outDir: string
  maxRuns: number
  write: boolean
  fastlane: boolean
  manifestPath?: string
}

export type LayoutLoopArgsResult =
  | { ok: true; options: LayoutLoopOptions }
  | { ok: false; message: string }

const DEFAULT_MAX_RUNS = 3

export function parseLayoutLoopArgs(args: string[]): LayoutLoopArgsResult {
  const positional: string[] = []
  let write = false
  let fastlane = false
  let maxRuns = DEFAULT_MAX_RUNS
  let manifestPath: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--write') {
      write = true
    } else if (arg === '--fastlane') {
      fastlane = true
    } else if (arg === '--max-runs') {
      const value = args[++i]
      if (value === undefined) return { ok: false, message: '--max-runs needs a value' }
      const parsed = parsePositiveInt(value)
      if (parsed === null) return { ok: false, message: '--max-runs must be a positive integer' }
      maxRuns = parsed
    } else if (arg.startsWith('--max-runs=')) {
      const parsed = parsePositiveInt(arg.slice('--max-runs='.length))
      if (parsed === null) return { ok: false, message: '--max-runs must be a positive integer' }
      maxRuns = parsed
    } else if (arg === '--manifest') {
      const value = args[++i]
      if (value === undefined) return { ok: false, message: '--manifest needs a path' }
      manifestPath = value
    } else if (arg.startsWith('--manifest=')) {
      const value = arg.slice('--manifest='.length)
      if (!value) return { ok: false, message: '--manifest needs a path' }
      manifestPath = value
    } else if (arg.startsWith('--')) {
      return { ok: false, message: `unknown option: ${arg}` }
    } else {
      positional.push(arg)
    }
  }

  if (positional.length !== 2) {
    return {
      ok: false,
      message: 'Usage: npm run layout:loop -- <input-dir> <out-dir> [--write] [--max-runs N] [--manifest manifest.json]',
    }
  }

  return {
    ok: true,
    options: {
      inputDir: positional[0],
      outDir: positional[1],
      maxRuns,
      write,
      fastlane,
      ...(manifestPath ? { manifestPath } : {}),
    },
  }
}

export function layoutIssueCount(summary: unknown): number | null {
  if (!isRecord(summary)) return null
  if (isRecord(summary.summary)) {
    const count = summary.summary.issueCount
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) return count
  }
  return Array.isArray(summary.issues) ? summary.issues.length : null
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return n >= 1 ? n : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
