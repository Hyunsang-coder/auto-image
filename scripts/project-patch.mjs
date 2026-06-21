#!/usr/bin/env node
// Surgical patch of a .studio.zip project bundle: apply a JSON op list to the
// bundled project.json (one text, one screenshot, or one whitelisted layout
// knob) and re-zip, preserving every untouched field bit-for-bit. The lossless
// bundle is the substrate, so a one-field edit keeps localeOverrides,
// highlights, and ids intact — unlike a manifest re-import (lossy, regenerates
// ids). Run via tsx (it imports the pure TS patch lib + its validators).
//
//   npm run project:patch -- <in.studio.zip> <patch.json> <out.studio.zip>
//   npm run project:patch -- <in.studio.zip> <patch.json> --in-place
//
// patch.json is an array of ops (see docs/agent-cli.md). A setScreenshot op
// names an image `file` (relative to patch.json); the CLI decodes its dims,
// adds the blob to the bundle, and prunes any image no longer referenced.
import JSZip from 'jszip'
import { imageSize } from 'image-size'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { applyPatch } from '../src/lib/projectPatch.ts'
import { projectImageKeys } from '../src/lib/imageRefs.ts'

const MANIFEST = 'project.json'

const args = process.argv.slice(2)
const inPlace = args.includes('--in-place')
const positional = args.filter((a) => !a.startsWith('--'))
const [inArg, patchArg, outArg] = positional
const outPath = inPlace ? inArg : outArg

if (!inArg || !patchArg || (!inPlace && !outArg)) {
  console.error('Usage: npm run project:patch -- <in.studio.zip> <patch.json> <out.studio.zip>')
  console.error('       npm run project:patch -- <in.studio.zip> <patch.json> --in-place')
  process.exit(2)
}

// extFor only names the in-zip blob; importProjectBundle reads by path, not ext.
const extFor = (name) => {
  const e = extname(name).slice(1).toLowerCase()
  return e === 'jpeg' ? 'jpg' : e || 'bin'
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
bundle.images = bundle.images ?? {}

let ops
try {
  ops = JSON.parse(await readFile(resolve(patchArg), 'utf8'))
} catch (e) {
  console.error(`cannot read patch JSON: ${e.message}`)
  process.exit(1)
}
if (!Array.isArray(ops)) {
  console.error('patch JSON must be an array of ops')
  process.exit(1)
}

// Decode each setScreenshot file → a blob in the zip + the {imageKey,width,
// height} the pure lib needs (it never touches the filesystem).
const patchDir = dirname(resolve(patchArg))
for (const op of ops) {
  if (op?.op !== 'setScreenshot' || !op.file) continue
  let buf
  try {
    buf = await readFile(resolve(patchDir, op.file))
  } catch {
    console.error(`setScreenshot: cannot read image file "${op.file}"`)
    process.exit(1)
  }
  let dim
  try {
    dim = imageSize(buf)
  } catch (e) {
    console.error(`setScreenshot: cannot decode image "${op.file}": ${e.message}`)
    process.exit(1)
  }
  if (!dim.width || !dim.height) {
    console.error(`setScreenshot: could not read dimensions of "${op.file}"`)
    process.exit(1)
  }
  const uuid = randomUUID()
  const path = `images/${uuid}.${extFor(op.file)}`
  zip.file(path, buf)
  const key = `img:${uuid}`
  bundle.images[key] = path
  op.imageKey = key
  op.width = dim.width
  op.height = dim.height
}

const { project, issues } = applyPatch(bundle.project, ops)
bundle.project = project

// Prune image blobs the patched project no longer references (e.g. a replaced
// screenshot's old blob), so the bundle doesn't accumulate dead files. Same
// keep-set as the in-app GC.
const referenced = new Set(projectImageKeys(project))
let pruned = 0
for (const [key, path] of Object.entries(bundle.images)) {
  if (referenced.has(key)) continue
  zip.remove(path)
  delete bundle.images[key]
  pruned++
}

zip.file(MANIFEST, JSON.stringify(bundle, null, 2))
await writeFile(resolve(outPath), await zip.generateAsync({ type: 'nodebuffer' }))

for (const issue of issues) console.log(':: ' + issue)
console.log(`:: patched ${ops.length} op(s)${pruned ? `, pruned ${pruned} orphan image(s)` : ''} → ${outPath}`)
process.exit(0)
