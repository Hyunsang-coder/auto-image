// Crash-recovery mirror of the live project, kept as a real file on disk.
//
// The project store already persists to localStorage, but that store shares a
// ~5 MB origin cap with the library and the custom presets, and `safeStorage`
// can only swallow a write that does not fit. So the one copy of work in
// progress lives in the storage most likely to fail quietly. This mirrors it
// through the Rust side instead — atomically, outside the cap — and compares
// the two on launch so a run of silently-dropped localStorage writes surfaces
// as an offer to recover rather than as days of lost work.
//
// Desktop only. Every function is a no-op that reports "nothing to recover" in
// the web build.

import { invoke } from '@tauri-apps/api/core'
import type { Project } from '../types/project'
import { blobToBase64, isTauri } from './tauri'
import { PROJECT_SCHEMA_VERSION, isRevivableProject, migrateProject } from './projectMigrate'
import { projectImageKeys } from './imageRefs'
import { extFor } from './projectBundle'
import { loadImageBlob, putImage } from './imageStore'

/** How long the project must sit unchanged before the mirror is rewritten. */
const DEBOUNCE_MS = 1500

interface AutosaveSnapshot {
  /** Project-schema version the snapshot was written under. */
  schemaVersion: number
  savedAt: string
  project: Project
}

export type RecoveryDecision =
  | { kind: 'none' }
  /** `no-active` means localStorage lost the project outright; `newer` means it
   *  still holds one, but an older one than the mirror — i.e. its writes have
   *  been failing. */
  | { kind: 'offer'; project: Project; reason: 'no-active' | 'newer'; savedAt: string }

/**
 * Which of the two copies is ahead. Pure so the decision itself is testable
 * without a filesystem: the comparison is by `updatedAt` rather than by id,
 * because the failure being caught is precisely localStorage holding something
 * stale — including a stale *different* project after a rollback.
 */
export function chooseRecovery(
  active: Project | null,
  snapshot: AutosaveSnapshot | null,
): RecoveryDecision {
  // The mirror is a file, not a store rehydrate: it can be hand-edited, come
  // from another version, or predate the atomic write. Check the shape before
  // isRevivableProject, which assumes a well-formed Project.
  if (!isProjectShaped(snapshot?.project) || !isRevivableProject(snapshot.project)) {
    return { kind: 'none' }
  }
  const project = migrateProject(snapshot.project, snapshot.schemaVersion ?? PROJECT_SCHEMA_VERSION)
  if (!project) return { kind: 'none' }
  if (!active) return { kind: 'offer', project, reason: 'no-active', savedAt: snapshot.savedAt }
  if (project.updatedAt > active.updatedAt) {
    return { kind: 'offer', project, reason: 'newer', savedAt: snapshot.savedAt }
  }
  return { kind: 'none' }
}

function isProjectShaped(p: unknown): p is Project {
  if (typeof p !== 'object' || p === null) return false
  const candidate = p as Partial<Project>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.slides)
  )
}

async function readSnapshot(): Promise<AutosaveSnapshot | null> {
  const json = await invoke<string | null>('autosave_read')
  if (!json) return null
  try {
    return JSON.parse(json) as AutosaveSnapshot
  } catch {
    // A truncated mirror predates the atomic write; there is nothing to salvage
    // and reporting it as an error would only block startup.
    return null
  }
}

const MIME_FOR_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** `img:<uuid>` ↔ `<uuid>.<ext>`. The uuid is what makes the name a safe path
 *  segment; the extension is how the blob's type survives the round trip. */
function nameFor(key: string, type: string): string {
  return `${key.replace('img:', '')}.${extFor(type)}`
}

function keyFor(name: string): string {
  return `img:${name.replace(/\.[^.]+$/, '')}`
}

/**
 * Bring the mirror's image set in line with the project's, by difference.
 * Screenshots are the bulk of a project and change only when someone uploads
 * one, while the JSON changes on every keystroke — so this compares first and
 * usually writes nothing, which is what makes it affordable on every tick.
 */
async function syncImages(project: Project): Promise<void> {
  const wanted = new Set(projectImageKeys(project))
  const onDisk = await invoke<string[]>('autosave_image_names')
  const haveKeys = new Set(onDisk.map(keyFor))

  const stale = onDisk.filter((name) => !wanted.has(keyFor(name)))
  if (stale.length) await invoke('autosave_delete_images', { names: stale })

  for (const key of wanted) {
    if (haveKeys.has(key)) continue
    const blob = await loadImageBlob(key)
    if (!blob) continue // already gone from IndexedDB; the JSON keeps the pointer
    await invoke('autosave_put_image', {
      name: nameFor(key, blob.type),
      dataBase64: await blobToBase64(blob),
    })
  }
}

export async function writeSnapshot(project: Project | null): Promise<void> {
  if (!project) {
    await invoke('autosave_clear')
    return
  }
  const snapshot: AutosaveSnapshot = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    project,
  }
  // JSON first: it is the cheap part and the part that is almost always what
  // changed, so a slow image sync never delays recording the actual edit.
  await invoke('autosave_write', { json: JSON.stringify(snapshot) })
  await syncImages(project)
}

/**
 * Put back any blob the recovered project points at that IndexedDB no longer
 * has. Without this the mirror recovers a project full of empty frames — the
 * captions and layout survive, but the screenshots, which are the work, do not.
 * Returns how many could not be restored.
 */
export async function restoreImages(project: Project): Promise<number> {
  if (!isTauri()) return 0
  const names = await invoke<string[]>('autosave_image_names')
  const nameByKey = new Map(names.map((name) => [keyFor(name), name]))
  let missing = 0
  for (const key of new Set(projectImageKeys(project))) {
    if (await loadImageBlob(key)) continue
    const name = nameByKey.get(key)
    const base64 = name ? await invoke<string | null>('autosave_read_image', { name }) : null
    if (!base64) {
      missing++
      continue
    }
    const ext = name!.split('.').pop() ?? 'png'
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    await putImage(key, new Blob([bytes], { type: MIME_FOR_EXT[ext] ?? 'image/png' }))
  }
  return missing
}

export interface ArmedAutosave {
  decision: RecoveryDecision
  /**
   * Start mirroring, returning the unsubscribe. Deliberately separate from
   * `armAutosave`: mirroring writes the *current* project, so starting it
   * before the recovery offer is resolved would overwrite the very file being
   * offered.
   */
  begin: (getProject: () => Project | null, subscribe: (fn: () => void) => () => void) => () => void
}

/** Read the mirror and decide, without touching it. Inert off the desktop. */
export async function armAutosave(active: Project | null): Promise<ArmedAutosave> {
  let decision: RecoveryDecision = { kind: 'none' }
  if (isTauri()) {
    try {
      decision = chooseRecovery(active, await readSnapshot())
    } catch {
      // An unreadable mirror must not stop the app from opening; the user still
      // has whatever localStorage holds.
      decision = { kind: 'none' }
    }
  }

  return {
    decision,
    begin(getProject, subscribe) {
      if (!isTauri()) return () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      const flush = () => {
        timer = undefined
        void writeSnapshot(getProject()).catch(() => {
          // Fire-and-forget: the mirror is a backstop, and failing it must not
          // interrupt editing. A failure that matters shows up on next launch
          // as a mirror that is behind, which is the safe direction.
        })
      }
      // Write once up front rather than waiting for the next edit. This is what
      // resolves a recovery offer: whichever copy the user kept becomes the
      // mirror, so declining does not re-offer the same file on every launch.
      flush()
      const unsubscribe = subscribe(() => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(flush, DEBOUNCE_MS)
      })
      return () => {
        unsubscribe()
        if (timer) {
          clearTimeout(timer)
          flush() // don't drop the last edit on unmount
        }
      }
    },
  }
}
