import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))

// The bundle is exercised end-to-end in projectBundle.test.ts; here the point
// is the file layer around it, so the zip is stubbed to something cheap.
const exportProjectBundle = vi.fn()
vi.mock('./projectBundle', () => ({
  exportProjectBundle: (...a: unknown[]) => exportProjectBundle(...a),
  readProjectBundle: vi.fn(),
}))
// Rendering a preview needs a canvas jsdom does not have; documentIO already
// treats a failed preview as cosmetic, and this keeps that path out of the way.
vi.mock('./renderSlide', () => ({
  renderSlide: vi.fn().mockRejectedValue(new Error('no canvas in jsdom')),
  renderSpanGroup: vi.fn().mockRejectedValue(new Error('no canvas in jsdom')),
}))
vi.mock('./imageRefs', () => ({ gcImages: vi.fn(), projectImageKeys: () => [] }))

import type { Project } from '../types/project'
import { makeProject, DEFAULT_BACKGROUND } from '../constants/defaults'
import { useProjectStore } from '../store/useProjectStore'
import { hashProject } from './documentModel'
import {
  documentIsDirty,
  ensureSaved,
  handleCloseRequest,
  saveDocument,
  useDocumentStore,
} from './documentIO'

const PATH = '/Users/x/Documents/Screenshot Studio/Memento.studio.zip'

function project(): Project {
  return makeProject({
    name: 'Memento',
    devices: ['iphone'],
    screenshotCount: 1,
    themeBackground: structuredClone(DEFAULT_BACKGROUND),
  })
}

/** Put a saved, clean document in the store. */
function openClean(): Project {
  const p = project()
  useProjectStore.getState().loadProject(p)
  const loaded = useProjectStore.getState().project!
  useProjectStore.getState().setDocument(PATH, hashProject(loaded))
  return loaded
}

function edit(): void {
  useProjectStore.getState().updateProject({ name: 'Memento edited' })
}

function calls(command: string): unknown[][] {
  return invoke.mock.calls.filter(([c]) => c === command)
}

/** The shapes the real Rust commands answer with, so the code under test does
 *  not trip over an `undefined` that only a mock would produce. */
const DEFAULT_REPLIES: Record<string, unknown> = {
  autosave_image_names: [],
  list_document_names: [],
  document_exists: false,
  recents_read: null,
  default_document_dir: '/Users/x/Documents/Screenshot Studio',
}

function resetInvoke(): void {
  invoke.mockReset()
  invoke.mockImplementation((command: string) => Promise.resolve(DEFAULT_REPLIES[command]))
}

describe('the document file layer', () => {
  beforeEach(() => {
    resetInvoke()
    exportProjectBundle.mockReset()
    exportProjectBundle.mockResolvedValue({ blob: new Blob(['zip']), missingImageKeys: [] })
    useDocumentStore.getState().set({
      recents: [],
      busy: false,
      prompt: null,
      error: null,
      missingImages: 0,
      pickerOpen: false,
      backups: null,
      pendingBackupPath: null,
    })
    useProjectStore.getState().resetProject()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('writes the bundle to the document path and clears dirty', async () => {
    openClean()
    edit()
    expect(documentIsDirty()).toBe(true)

    expect(await saveDocument()).toBe(true)
    expect(calls('save_document')[0][1]).toMatchObject({ path: PATH })
    expect(documentIsDirty()).toBe(false)
  })

  // Holding ⌘S down should not flush the backup history, and re-writing an
  // identical file is pure IO for nothing.
  it('does nothing when the document already matches its file', async () => {
    openClean()
    expect(await saveDocument()).toBe(true)
    expect(calls('save_document')).toHaveLength(0)
  })

  it('reports a failed write and leaves the document dirty', async () => {
    openClean()
    edit()
    invoke.mockImplementation((command: string) =>
      command === 'save_document'
        ? Promise.reject(new Error('Permission denied (os error 13)'))
        : Promise.resolve(DEFAULT_REPLIES[command]),
    )

    expect(await saveDocument()).toBe(false)
    // Still dirty: claiming otherwise is how the next quit throws the work away.
    expect(documentIsDirty()).toBe(true)
    expect(useDocumentStore.getState().error?.detail).toMatch(/Permission denied/)
  })

  // A migration bug must not be able to take the original with it.
  it('preserves the original before the first save of a migrated file', async () => {
    openClean()
    useDocumentStore.getState().set({ pendingBackupPath: PATH })
    edit()
    await saveDocument()

    const order = invoke.mock.calls.map(([c]) => c)
    expect(order.indexOf('backup_original')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('backup_original')).toBeLessThan(order.indexOf('save_document'))
    // Once only — a second save is already migrated content.
    expect(useDocumentStore.getState().pendingBackupPath).toBeNull()

    invoke.mockClear()
    edit()
    await saveDocument()
    expect(calls('backup_original')).toHaveLength(0)
  })

  it('rotates a backup on every real save', async () => {
    openClean()
    edit()
    await saveDocument()
    expect(calls('rotate_backup')[0][1]).toMatchObject({ keep: 10 })
  })

  // The save is what matters; a backup or a thumbnail that fails is not worth
  // telling the user their work did not persist.
  it('still reports success when the rotation fails', async () => {
    openClean()
    edit()
    invoke.mockImplementation((command: string) =>
      command === 'rotate_backup'
        ? Promise.reject(new Error('disk full'))
        : Promise.resolve(DEFAULT_REPLIES[command]),
    )
    expect(await saveDocument()).toBe(true)
    expect(useDocumentStore.getState().error).toBeNull()
  })

  it('surfaces images the bundle could not carry', async () => {
    openClean()
    edit()
    exportProjectBundle.mockResolvedValue({
      blob: new Blob(['zip']),
      missingImageKeys: ['img:a', 'img:b'],
    })
    await saveDocument()
    expect(useDocumentStore.getState().missingImages).toBe(2)
  })
})

describe('the three-button gate', () => {
  beforeEach(() => {
    resetInvoke()
    exportProjectBundle.mockReset()
    exportProjectBundle.mockResolvedValue({ blob: new Blob(['zip']), missingImageKeys: [] })
    useDocumentStore.getState().set({ prompt: null, error: null, pendingBackupPath: null })
    useProjectStore.getState().resetProject()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  /** Answer the prompt the moment it goes up, the way the modal does. */
  function answerWith(answer: 'save' | 'discard' | 'cancel'): Promise<void> {
    return new Promise((resolve) => {
      const stop = useDocumentStore.subscribe((state) => {
        if (state.prompt?.kind !== 'dirty') return
        stop()
        state.prompt.resolve(answer)
        resolve()
      })
    })
  }

  it('does not ask at all when there is nothing unsaved', async () => {
    openClean()
    expect(await ensureSaved('open')).toBe(true)
    expect(useDocumentStore.getState().prompt).toBeNull()
  })

  it('saves and proceeds', async () => {
    openClean()
    edit()
    const answered = answerWith('save')
    const proceed = await ensureSaved('open')
    await answered
    expect(proceed).toBe(true)
    expect(calls('save_document')).toHaveLength(1)
    expect(documentIsDirty()).toBe(false)
  })

  it('proceeds without saving when told to discard', async () => {
    openClean()
    edit()
    const answered = answerWith('discard')
    const proceed = await ensureSaved('open')
    await answered
    expect(proceed).toBe(true)
    expect(calls('save_document')).toHaveLength(0)
    expect(documentIsDirty()).toBe(true)
  })

  // The button two-button dialogs never had: keep both the work and the intent.
  it('stops the transition on cancel', async () => {
    openClean()
    edit()
    const answered = answerWith('cancel')
    const proceed = await ensureSaved('open')
    await answered
    expect(proceed).toBe(false)
    expect(calls('save_document')).toHaveLength(0)
  })

  // Choosing 저장 and having the save fail must not then quit: that is the one
  // ordering that loses the work outright.
  it('does not proceed when the save the user asked for fails', async () => {
    openClean()
    edit()
    invoke.mockImplementation((command: string) =>
      command === 'save_document'
        ? Promise.reject(new Error('Permission denied'))
        : Promise.resolve(DEFAULT_REPLIES[command]),
    )
    const answered = answerWith('save')
    const proceed = await ensureSaved('close')
    await answered
    expect(proceed).toBe(false)
  })
})

// The webview half of the close guard in src-tauri/src/quit.rs.
describe('the close guard', () => {
  beforeEach(() => {
    resetInvoke()
    exportProjectBundle.mockReset()
    exportProjectBundle.mockResolvedValue({ blob: new Blob(['zip']), missingImageKeys: [] })
    useDocumentStore.getState().set({ prompt: null, error: null, pendingBackupPath: null })
    useProjectStore.getState().resetProject()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  // The ack has to be sent before anything that can take time, or Rust's
  // liveness timer exits out from under a user still reading the prompt.
  it('acks first, then answers', async () => {
    openClean()
    edit()
    const answered = new Promise<void>((resolve) => {
      const stop = useDocumentStore.subscribe((state) => {
        if (state.prompt?.kind !== 'dirty') return
        stop()
        // By now the ack must already be out, even though nobody has answered.
        expect(calls('close_ack')).toHaveLength(1)
        expect(calls('confirm_close')).toHaveLength(0)
        state.prompt.resolve('discard')
        resolve()
      })
    })
    await handleCloseRequest()
    await answered
    expect(calls('confirm_close')[0][1]).toEqual({ close: true })
  })

  it('lets a clean document close without asking anything', async () => {
    openClean()
    await handleCloseRequest()
    expect(useDocumentStore.getState().prompt).toBeNull()
    expect(calls('confirm_close')[0][1]).toEqual({ close: true })
  })

  it('answers "stay open" when the user cancels', async () => {
    openClean()
    edit()
    const answered = new Promise<void>((resolve) => {
      const stop = useDocumentStore.subscribe((state) => {
        if (state.prompt?.kind !== 'dirty') return
        stop()
        state.prompt.resolve('cancel')
        resolve()
      })
    })
    await handleCloseRequest()
    await answered
    expect(calls('confirm_close')[0][1]).toEqual({ close: false })
  })
})
