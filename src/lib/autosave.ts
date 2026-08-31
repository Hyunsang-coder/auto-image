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
import { isTauri } from './tauri'
import { PROJECT_SCHEMA_VERSION, isRevivableProject, migrateProject } from './projectMigrate'

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
  await invoke('autosave_write', { json: JSON.stringify(snapshot) })
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
