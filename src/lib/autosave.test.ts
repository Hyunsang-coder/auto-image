import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

import type { Project } from '../types/project'
import { makeProject, DEFAULT_BACKGROUND } from '../constants/defaults'
import { PROJECT_SCHEMA_VERSION } from './projectMigrate'
import { armAutosave, chooseRecovery } from './autosave'

function proj(name: string, updatedAt: string): Project {
  const p = makeProject({
    name,
    devices: ['iphone'],
    screenshotCount: 1,
    themeBackground: structuredClone(DEFAULT_BACKGROUND),
  })
  return { ...p, updatedAt }
}

function snapshot(project: Project, schemaVersion = PROJECT_SCHEMA_VERSION) {
  return { schemaVersion, savedAt: project.updatedAt, project }
}

describe('chooseRecovery', () => {
  it('offers nothing when there is no mirror', () => {
    expect(chooseRecovery(proj('A', '2026-08-31T10:00:00Z'), null)).toEqual({ kind: 'none' })
  })

  // The loud failure: localStorage lost the project outright (quota, cleared
  // site data, a corrupt entry the store dropped on rehydrate).
  it('offers the mirror when nothing is loaded', () => {
    const mirrored = proj('A', '2026-08-31T10:00:00Z')
    const decision = chooseRecovery(null, snapshot(mirrored))
    expect(decision).toMatchObject({ kind: 'offer', reason: 'no-active' })
  })

  // The quiet failure this whole mechanism exists for: localStorage still holds
  // a project, but an older one, because its writes have been silently dropped.
  it('offers the mirror when it is ahead of what loaded', () => {
    const decision = chooseRecovery(
      proj('A', '2026-08-31T10:00:00Z'),
      snapshot(proj('A', '2026-08-31T18:00:00Z')),
    )
    expect(decision).toMatchObject({ kind: 'offer', reason: 'newer' })
  })

  it('stays quiet when the two copies agree', () => {
    const at = '2026-08-31T10:00:00Z'
    expect(chooseRecovery(proj('A', at), snapshot(proj('A', at)))).toEqual({ kind: 'none' })
  })

  // The normal case on every launch: the mirror is a debounce tick behind the
  // last edit that localStorage did record. Prompting here would train the user
  // to dismiss the prompt.
  it('stays quiet when the mirror is behind', () => {
    const decision = chooseRecovery(
      proj('A', '2026-08-31T18:00:00Z'),
      snapshot(proj('A', '2026-08-31T10:00:00Z')),
    )
    expect(decision).toEqual({ kind: 'none' })
  })

  // Comparison is by time, not identity: a localStorage rollback can leave a
  // *different* project loaded, and the newer work still has to be offered.
  it('offers a newer mirror even when it is a different project', () => {
    const decision = chooseRecovery(
      proj('Old', '2026-08-31T10:00:00Z'),
      snapshot(proj('Newer', '2026-08-31T18:00:00Z')),
    )
    expect(decision).toMatchObject({ kind: 'offer', reason: 'newer' })
    expect(decision.kind === 'offer' && decision.project.name).toBe('Newer')
  })

  it('migrates an older-schema mirror before offering it', () => {
    const mirrored = proj('A', '2026-08-31T18:00:00Z')
    const decision = chooseRecovery(null, snapshot(mirrored, 4))
    expect(decision.kind).toBe('offer')
  })

  // Better to offer nothing than to load something the app cannot render.
  it('refuses a mirror that is not a revivable project', () => {
    const broken = { ...proj('A', '2026-08-31T18:00:00Z'), slides: undefined } as unknown as Project
    expect(chooseRecovery(null, snapshot(broken))).toEqual({ kind: 'none' })
  })
})

describe('the mirror', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(null)
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  // Resolving a recovery offer has to land in the mirror straight away.
  // Otherwise declining leaves the newer copy on disk, and the same offer comes
  // back on every launch until the user happens to make an edit.
  it('writes as soon as it starts, without waiting for an edit', async () => {
    const armed = await armAutosave(null)
    invoke.mockClear()
    const stop = armed.begin(() => proj('Kept', '2026-08-31T10:00:00Z'), () => () => {})

    const write = invoke.mock.calls.find(([cmd]) => cmd === 'autosave_write')
    expect(write).toBeDefined()
    expect(JSON.parse((write![1] as { json: string }).json).project.name).toBe('Kept')
    stop()
  })

  it('clears the mirror rather than writing a null project', async () => {
    const armed = await armAutosave(null)
    invoke.mockClear()
    const stop = armed.begin(() => null, () => () => {})

    expect(invoke.mock.calls.map(([cmd]) => cmd)).toContain('autosave_clear')
    stop()
  })

  it('does nothing at all off the desktop', async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    const armed = await armAutosave(null)
    expect(armed.decision).toEqual({ kind: 'none' })
    armed.begin(() => proj('X', '2026-08-31T10:00:00Z'), () => () => {})()
    expect(invoke).not.toHaveBeenCalled()
  })
})
