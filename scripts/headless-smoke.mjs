#!/usr/bin/env node
// CI smoke test for the headless render pipeline. Runs headless:export against a
// committed fixture and asserts it still produces PNGs with no layout issues —
// the regression guard for the harness (a UI-string change once silently broke
// the import-summary matcher and timed out every render with no test to catch it).
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'e2e', 'fixtures', 'headless-import')
const EXPECTED_PNGS = 4 // 2 slides × 2 locales (en source + ko)

async function countPngs(dir) {
  let n = 0
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) n += await countPngs(p)
    else if (ent.name.endsWith('.png')) n++
  }
  return n
}

const out = await mkdtemp(join(tmpdir(), 'hl-smoke-'))
try {
  const code = await new Promise((res) => {
    spawn(
      process.execPath,
      [join(root, 'scripts', 'headless-export.mjs'), fixture, out, '--report', '--fail-on-layout-issues'],
      { cwd: root, stdio: 'inherit' },
    ).on('exit', res)
  })
  if (code !== 0) throw new Error(`headless:export exited ${code}`)

  const pngs = await countPngs(out)
  if (pngs !== EXPECTED_PNGS) throw new Error(`expected ${EXPECTED_PNGS} PNGs, got ${pngs}`)

  const summary = JSON.parse(await readFile(join(out, 'layout-summary.json'), 'utf8'))
  if (summary.summary.issueCount !== 0) throw new Error(`layout issues: ${summary.summary.issueCount}`)

  console.log(`:: headless smoke OK — ${pngs} PNGs, 0 layout issues`)
} catch (err) {
  console.error(`:: headless smoke FAILED — ${err.message}`)
  process.exitCode = 1
} finally {
  await rm(out, { recursive: true, force: true })
}
