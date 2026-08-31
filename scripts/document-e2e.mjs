#!/usr/bin/env node
// Desktop end-to-end check for the document model, driven through the agent
// bridge — the app has to actually be running.
//
// Deliberately not tauri-driver: `src-tauri/src/bridge.rs` already exposes a
// scriptable channel into the live window, and the MCP `live_*` tools sit on
// the same methods. Adding a second automation stack to test the first one
// would double the surface with nothing to show for it. (Phase 0's recovery
// bug was found the same way.)
//
//   npm run tauri:dev          # in one terminal
//   node scripts/document-e2e.mjs
//
// Everything it creates is named with the prefix below and deleted at the end,
// and it refuses to run against a project that is not its own — this drives the
// real app, which may be the one the user is working in.
//
// Bring the window to the front before running. macOS throttles an occluded
// WKWebView, and the first `invoke` after that shows up as "IPC custom protocol
// failed … TypeError: Load failed" — a rejected save that the app correctly
// reports as a failure, but that has nothing to do with what is being tested.

import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { callBridge } from '../packages/mcp/lib/bridgeClient.mjs'

const PREFIX = 'e2e-doc'
const CONFIG = join(homedir(), 'Library', 'Application Support', 'com.hyunsang.screenshotstudio')
const SCRATCH = join(tmpdir(), 'screenshot-studio-doc-e2e')

let failures = 0
const created = new Set()
const projectIds = new Set()

function check(label, condition, detail) {
  if (condition) {
    console.log(`ok — ${label}`)
  } else {
    failures++
    console.error(`FAIL — ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

/** A bridge call that must succeed. */
async function call(method, params = {}) {
  const envelope = await callBridge(method, params)
  if (!envelope.ok) throw new Error(`${method}: ${envelope.error}`)
  return envelope.result
}

/** A bridge call that must be refused, returning the refusal message. */
async function refuse(method, params = {}) {
  const envelope = await callBridge(method, params)
  if (envelope.ok) throw new Error(`${method} was expected to be refused but succeeded`)
  return envelope.error ?? ''
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function newDocument(suffix) {
  const result = await call('newProject', { name: `${PREFIX}-${suffix}`, slideCount: 2, replace: true })
  created.add(result.document.path)
  if (result.project?.id) projectIds.add(result.project.id)
  return result.document
}

async function setHeadline(text) {
  // `locale` is not optional: setText routes by it (source locale → base text,
  // anything else → a translation), and omitting it lands in `issues`.
  const { project } = await call('status')
  const result = await call('patch', {
    ops: [{ op: 'setText', slide: 1, field: 'headline', locale: project.sourceLocale, value: text }],
  })
  if (result.issues?.length) throw new Error(`patch reported issues: ${result.issues.join('; ')}`)
}

async function headlineOf() {
  const { project } = await call('inspect')
  return project.slides[0].texts[0].text
}

async function main() {
  const status = await call('status')
  if (status.project && !status.project.name.startsWith(PREFIX)) {
    console.error(
      `Refusing to run: "${status.project.name}" is open and this test replaces the open project.\n` +
        'Close it (or save it) and open a scratch project first.',
    )
    process.exit(2)
  }
  check('the bridge speaks the document protocol', status.document !== undefined, JSON.stringify(status))

  // 1 — a new project is a file straight away. No "untitled, unsaved" state.
  const first = await newDocument('a')
  check('a new project has a path', !!first.path, JSON.stringify(first))
  if (!first.path) throw new Error('cannot continue without a document')
  check('and it is on disk', await exists(first.path))
  check('and it opens clean', first.dirty === false)
  // Premise 5: the file name *is* the document name. Not asserted as a literal
  // because a name already taken in the folder gets Finder's " 2" suffix — what
  // matters is that the two never drift apart.
  check(
    'and its name is the file name',
    first.name === first.path.split('/').pop().replace('.studio.zip', ''),
    `${first.name} vs ${first.path}`,
  )

  // 2 — an agent patch dirties the document exactly like a user edit.
  await setHeadline('e2e headline one')
  check('a patch makes it dirty', (await call('docStatus')).dirty === true)

  // 3 — ⌘S writes it and clears dirty.
  const saved = await call('save')
  check('saving clears dirty', saved.dirty === false)

  // 4 — switching away with unsaved work is refused rather than silently losing it.
  await setHeadline('e2e headline two')
  const refusal = await refuse('open', { path: first.path })
  check('opening over unsaved work is refused', /unsaved/i.test(refusal), refusal)

  // 5 — a second document, and switching between the two.
  await call('save')
  const second = await newDocument('b')
  check('the second project got its own file', second.path !== first.path, second.path)
  check('and the two files coexist', (await exists(first.path)) && (await exists(second.path)))

  const back = await call('open', { path: first.path })
  check('switching back reports the first path', back.path === first.path, back.path)
  check('and it is clean on arrival', back.dirty === false)
  check(
    'and the edits that were saved are in it',
    (await headlineOf()) === 'e2e headline two',
    await headlineOf(),
  )

  // 6 — the mirror records which document its edits belong to. Without this,
  // "unsaved edits" and "localStorage lost a project" are indistinguishable on
  // the next launch.
  const mirror = JSON.parse(await readFile(join(CONFIG, 'autosave.json'), 'utf8'))
  check('the mirror names the open document', mirror.docPath === first.path, mirror.docPath)

  // 7 — recents is written as a file, so it survives a relaunch.
  const recents = JSON.parse(await readFile(join(CONFIG, 'recents.json'), 'utf8'))
  const paths = recents.map((r) => r.path)
  check('both documents are in recents', paths.includes(first.path) && paths.includes(second.path))
  check('the most recent is first', paths[0] === first.path, paths[0])
  check(
    'and each carries a cached thumbnail, so drawing the list opens no zip',
    recents.filter((r) => created.has(r.path)).every((r) => typeof r.preview === 'string'),
  )

  // 8 — every save rotates a backup.
  const backupDir = join(CONFIG, 'backups')
  const rotated = await Promise.all(
    [...projectIds].map(async (id) => (await exists(join(backupDir, id))) ? id : null),
  )
  check('saves are rotated into backups', rotated.some(Boolean))

  await migratedFileKeepsItsOriginal(first.path)
  await aFailedSaveLeavesTheFileAlone()
}

/**
 * A file written under an older schema is opened clean, and the *first* save
 * preserves the original as `.bak` — the only thing standing between a
 * migration bug and the user's data.
 */
async function migratedFileKeepsItsOriginal(sourcePath) {
  await mkdir(SCRATCH, { recursive: true })
  const target = join(SCRATCH, `${PREFIX}-legacy.studio.zip`)

  // Strip the schema stamp: that is exactly what a bundle written before it
  // existed looks like, and the reader treats it as schema 4.
  const zip = await JSZip.loadAsync(await readFile(sourcePath))
  const manifest = JSON.parse(await zip.file('project.json').async('string'))
  delete manifest.schemaVersion
  zip.file('project.json', JSON.stringify(manifest, null, 2))
  const original = await zip.generateAsync({ type: 'nodebuffer' })
  await writeFile(target, original)

  const opened = await call('open', { path: target, discardUnsaved: true })
  // Clean, not dirty: the user changed nothing, and opening dirty would train
  // them to press ⌘S — which is when the .bak is due, not before.
  check('a migrated file opens clean', opened.dirty === false)
  check('and no .bak exists yet', !(await exists(`${target}.bak`)))

  await setHeadline('legacy edited')
  await call('save')
  check('the first save preserves the original as .bak', await exists(`${target}.bak`))
  check(
    'and the .bak holds the pre-migration bytes',
    Buffer.compare(await readFile(`${target}.bak`), original) === 0,
  )

  await setHeadline('legacy edited twice')
  await call('save')
  const bak = await readFile(`${target}.bak`)
  check('a later save does not overwrite it with migrated content', Buffer.compare(bak, original) === 0)
}

/** A save that cannot complete has to say so and leave the file whole. */
async function aFailedSaveLeavesTheFileAlone() {
  const dir = join(SCRATCH, 'readonly')
  await mkdir(dir, { recursive: true })
  const target = join(dir, `${PREFIX}-locked.studio.zip`)
  const source = join(SCRATCH, `${PREFIX}-legacy.studio.zip`)
  await writeFile(target, await readFile(source))
  const before = await readFile(target)

  await call('open', { path: target, discardUnsaved: true })
  await setHeadline('this must not reach the disk')
  await chmod(dir, 0o500) // the sibling temp file can no longer be created
  const error = await refuse('save')
  await chmod(dir, 0o700)

  check('a save into a read-only folder is refused', /denied|error/i.test(error), error)
  check('and the file on disk is untouched', Buffer.compare(await readFile(target), before) === 0)
  check('and the document is still dirty', (await call('docStatus')).dirty === true)
}

main()
  .catch((e) => {
    failures++
    console.error(`FAIL — ${e.message}`)
  })
  .finally(async () => {
    // Leave nothing behind in the user's Documents folder.
    for (const path of created) {
      if (!path) continue
      await rm(path, { force: true })
      await rm(`${path}.bak`, { force: true })
    }
    for (const id of projectIds) {
      await rm(join(CONFIG, 'backups', id), { recursive: true, force: true })
    }
    await rm(SCRATCH, { recursive: true, force: true })
    // Sweep anything a previous interrupted run left in the documents folder,
    // so a rerun does not start colliding with its own leftovers.
    const docs = join(homedir(), 'Documents', 'Screenshot Studio')
    for (const name of await readdir(docs).catch(() => [])) {
      if (name.startsWith(PREFIX)) await rm(join(docs, name), { force: true })
    }
    console.log(failures ? `:: document e2e FAILED (${failures})` : ':: document e2e OK')
    process.exit(failures ? 1 : 0)
  })
