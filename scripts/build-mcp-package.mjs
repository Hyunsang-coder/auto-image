#!/usr/bin/env node
// Freeze the two repo-bound inputs the published MCP package needs into files it
// can ship: the design reference (built from the app's TS constants) and the
// import spec (a doc in this repo). Runs from packages/mcp's `prepack`, so
// `npm publish` can never ship a stale snapshot.
//
//   npm run mcp:package     # run under tsx — it imports the TS constants graph

import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDesignReference } from './lib/designReference.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'packages', 'mcp', 'data')

await mkdir(DATA, { recursive: true })
await writeFile(join(DATA, 'design-reference.json'), JSON.stringify(buildDesignReference(), null, 2) + '\n')
await copyFile(join(ROOT, 'docs', 'project-import.md'), join(DATA, 'project-import.md'))

console.log(`mcp package data written to ${DATA}`)
