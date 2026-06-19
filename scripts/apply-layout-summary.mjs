#!/usr/bin/env node
// Apply conservative manifest edits from a headless layout-summary.json.
//
//   npm run layout:fix -- <layout-summary.json> <manifest.json> [--write]
//
// Defaults to dry-run. Pass --write to update the manifest file.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  applyLayoutSummaryFixes,
  formatLayoutAutofixReport,
  isLayoutSummary,
} from '../src/lib/layoutAutofix.ts'

const args = process.argv.slice(2)
const write = args.includes('--write')
const positional = args.filter((arg) => !arg.startsWith('--'))
const [summaryPathArg, manifestPathArg] = positional

if (!summaryPathArg || !manifestPathArg) {
  console.error('Usage: npm run layout:fix -- <layout-summary.json> <manifest.json> [--write]')
  process.exit(2)
}

const summaryPath = resolve(summaryPathArg)
const manifestPath = resolve(manifestPathArg)

let summary
let manifest
try {
  summary = JSON.parse(await readFile(summaryPath, 'utf8'))
} catch (error) {
  console.error(`Failed to read layout summary: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
if (!isLayoutSummary(summary)) {
  console.error('layout summary must be a JSON object with an issues[] array')
  process.exit(1)
}

try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch (error) {
  console.error(`Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const result = applyLayoutSummaryFixes(manifest, summary)
console.log(formatLayoutAutofixReport(result, { write, summaryPath, manifestPath }))

if (write && result.changes.length > 0) {
  await writeFile(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`)
}
