#!/usr/bin/env node
// Run headless export + layout autofix until layout issues clear or the run
// budget is exhausted.
//
//   npm run layout:loop -- <input-dir> <out-dir> [--write] [--max-runs N]
//
// Without --write this performs one headless render and prints the autofix
// dry-run report. With --write it edits the manifest between verified renders.
import { spawn } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyLayoutSummaryFixes,
  formatLayoutAutofixReport,
  isLayoutSummary,
} from '../src/lib/layoutAutofix.ts'
import {
  layoutIssueCount,
  parseLayoutLoopArgs,
} from '../src/lib/layoutLoop.ts'

const parsed = parseLayoutLoopArgs(process.argv.slice(2))
if (!parsed.ok) {
  console.error(parsed.message)
  process.exit(2)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HEADLESS_SCRIPT = join(ROOT, 'scripts/headless-export.mjs')
const { maxRuns, write, fastlane } = parsed.options
const inputDir = resolve(parsed.options.inputDir)
const outDir = resolve(parsed.options.outDir)
const manifestPath = parsed.options.manifestPath
  ? resolve(parsed.options.manifestPath)
  : await discoverManifestPath(inputDir)
const summaryPath = join(outDir, 'layout-summary.json')

console.log(
  `:: layout loop: ${inputDir} → ${outDir}; manifest=${manifestPath}; ` +
  `max-runs=${maxRuns}; ${write ? 'write' : 'dry-run'}`,
)

for (let run = 1; run <= maxRuns; run++) {
  console.log(`:: layout loop run ${run}/${maxRuns}: rendering`)
  const code = await runHeadlessExport(inputDir, outDir, fastlane)
  if (code !== 0) {
    console.error(`:: headless export failed on run ${run}; stopping layout loop`)
    process.exit(code || 1)
  }

  const summary = await readJson(summaryPath, 'layout summary')
  const issueCount = layoutIssueCount(summary)
  if (issueCount === null) {
    console.error(`:: ${summaryPath} is not a layout summary`)
    process.exit(1)
  }
  console.log(`:: layout loop run ${run}/${maxRuns}: ${issueCount} layout issues`)
  if (issueCount === 0) {
    console.log(`:: layout loop converged after ${run} render${run === 1 ? '' : 's'}`)
    process.exit(0)
  }

  if (!isLayoutSummary(summary)) {
    console.error(':: layout summary must be a JSON object with an issues[] array')
    process.exit(1)
  }

  const manifest = await readJson(manifestPath, 'manifest')
  const result = applyLayoutSummaryFixes(manifest, summary)
  const canWriteThisRun = write && run < maxRuns
  console.log(formatLayoutAutofixReport(result, {
    write: canWriteThisRun,
    summaryPath,
    manifestPath,
  }))

  if (!write) {
    console.error(':: dry-run stopped after one render; pass --write to apply fixes and re-render')
    process.exit(1)
  }
  if (run === maxRuns) {
    console.error(`:: layout loop reached max-runs=${maxRuns}; remaining issues were not written unverified`)
    process.exit(1)
  }
  if (result.changes.length === 0) {
    console.error(':: no autofix changes could be applied; stopping layout loop')
    process.exit(1)
  }

  await writeFile(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`)
  console.log(`:: wrote ${result.changes.length} manifest changes; re-rendering`)
}

async function runHeadlessExport(inDir, targetDir, includeFastlane) {
  const args = [
    '--disable-warning=ExperimentalWarning',
    HEADLESS_SCRIPT,
    inDir,
    targetDir,
    '--report',
  ]
  if (includeFastlane) args.push('--fastlane')
  return await new Promise((resolveCode) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', (error) => {
      console.error(`:: failed to start headless export: ${error.message}`)
      resolveCode(1)
    })
    child.on('close', (code) => resolveCode(code ?? 1))
  })
}

async function discoverManifestPath(inDir) {
  const files = await readdir(inDir)
  const candidates = []
  for (const file of files) {
    if (extname(file).toLowerCase() !== '.json') continue
    const path = join(inDir, file)
    try {
      const value = JSON.parse(await readFile(path, 'utf8'))
      if (isManifestShaped(value)) candidates.push(path)
    } catch {
      // Broken JSON will be reported by the import pipeline if selected.
    }
  }
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) {
    console.error(`:: no manifest-shaped JSON found in ${inDir}; pass --manifest <path>`)
  } else {
    console.error(`:: multiple manifest-shaped JSON files found in ${inDir}; pass --manifest <path>`)
    for (const candidate of candidates) console.error(`:: - ${candidate}`)
  }
  process.exit(1)
}

function isManifestShaped(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'version' in value &&
    Array.isArray(value.slides)
  )
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    console.error(`:: failed to read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
