#!/usr/bin/env node
// Inspect a .studio.zip bundle without launching the editor. Produces a compact
// JSON summary for agents: slide ids, editable paths, image references, and
// structural issues that should be fixed with project:patch before rendering.
//
//   npm run project:inspect -- <project.studio.zip> [out.json] [--extract-images <dir>]

import JSZip from 'jszip'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { inspectBundle } from './lib/inspect.mjs'

const MANIFEST = 'project.json'

const args = process.argv.slice(2)
const extractIndex = args.indexOf('--extract-images')
const extractDir = extractIndex >= 0 ? args[extractIndex + 1] : undefined
const positional = args.filter((arg, index) => {
  if (arg === '--extract-images') return false
  if (extractIndex >= 0 && index === extractIndex + 1) return false
  return !arg.startsWith('--')
})
const [inArg, outArg] = positional

if (!inArg) {
  console.error('Usage: npm run project:inspect -- <project.studio.zip> [out.json] [--extract-images <dir>]')
  process.exit(2)
}
if (extractIndex >= 0 && !extractDir) {
  console.error('--extract-images requires a directory')
  process.exit(2)
}


const zip = await JSZip.loadAsync(await readFile(resolve(inArg)))
const manifestFile = zip.file(MANIFEST)
if (!manifestFile) {
  console.error(`not a project bundle: ${MANIFEST} missing in ${inArg}`)
  process.exit(1)
}
const bundle = JSON.parse(await manifestFile.async('string'))
if (!bundle.project) {
  console.error('malformed bundle: no project')
  process.exit(1)
}

const result = inspectBundle(bundle)

if (extractDir) {
  await mkdir(resolve(extractDir), { recursive: true })
  for (const ref of result.imageRefs) {
    if (!ref.bundlePath) continue
    const entry = zip.file(ref.bundlePath)
    if (!entry) continue
    await writeFile(join(resolve(extractDir), ref.filename), Buffer.from(await entry.async('uint8array')))
  }
}

const json = JSON.stringify(result, null, 2)
if (outArg) {
  await writeFile(resolve(outArg), json)
  console.log(`:: inspected ${basename(inArg)} → ${outArg}${extractDir ? `, extracted images → ${extractDir}` : ''}`)
} else {
  console.log(json)
}
