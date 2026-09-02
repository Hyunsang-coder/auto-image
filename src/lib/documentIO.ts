// Document-level operations: open, save, save-as, new, and the recents list
// that makes switching between two or three projects a keystroke instead of a
// tour of the app.
//
// `loadProject` knows nothing about paths — this sits on top of it and adds the
// file identity. Every write goes through the Rust `save_document` command,
// which is `write_atomic`, so a save that fails leaves the previous file whole.
//
// Desktop only. In the web build `isTauri()` is false, every function here
// no-ops, and the existing download/upload paths stay exactly as they were.

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import type { Project, Slide } from '../types/project'
import { useProjectStore } from '../store/useProjectStore'
import { PROJECT_SCHEMA_VERSION } from './projectMigrate'
import { exportProjectBundle, readProjectBundle } from './projectBundle'
import { renderSlide, renderSpanGroup } from './renderSlide'
import { writeSnapshot } from './autosave'
import { gcImages } from './imageRefs'
import { blobToBase64, isTauri } from './tauri'
import { t } from '../i18n'
import {
  DOC_EXT,
  pickDroppedBundle,
  addRecent,
  backupStamp,
  docNameFromPath,
  dropRecent,
  ensureDocExt,
  hashProject,
  isDirty,
  joinPath,
  markMissing,
  parseRecents,
  sanitizeFileBase,
  uniqueDocBase,
  type RecentEntry,
} from './documentModel'

/** Rotated saves kept per project (Phase 2's replacement for the library). */
const BACKUP_KEEP = 10
/** Width of the thumbnail cached in recents, so drawing the list opens no zip. */
const PREVIEW_WIDTH = 320
const LIBRARY_MIGRATED_KEY = 'auto-image:library-migrated'

export type DirtyAnswer = 'save' | 'discard' | 'cancel'

/** What a three-button prompt is standing in the way of. */
export type DirtyIntent = 'open' | 'new' | 'close'

export interface BackupEntry {
  name: string
  path: string
  size: number
}

interface DocumentState {
  recents: RecentEntry[]
  /** A file operation is in flight; the surfaces that start one disable. */
  busy: boolean
  /** Blocking question, resolved by the modal that renders it. */
  prompt:
    | { kind: 'dirty'; intent: DirtyIntent; name: string; resolve: (a: DirtyAnswer) => void }
    | { kind: 'overwrite'; path: string; resolve: (ok: boolean) => void }
    | null
  /** A failed save or open. The project is untouched when this is set. */
  error: { title: string; detail: string } | null
  /** Images the saved bundle could not carry (already gone from IndexedDB). */
  missingImages: number
  pickerOpen: boolean
  /** A file is being dragged over the window (Tauri's own drag-drop event). */
  dragOver: boolean
  /** Rotated versions of the open project, when the user has asked to see them. */
  backups: BackupEntry[] | null
  /**
   * Set while a file that was written under an older schema has not yet been
   * saved back. The first save preserves the original as `<name>.studio.zip.bak`.
   */
  pendingBackupPath: string | null
  set: (patch: Partial<DocumentState>) => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  recents: [],
  busy: false,
  prompt: null,
  error: null,
  missingImages: 0,
  pickerOpen: false,
  dragOver: false,
  backups: null,
  pendingBackupPath: null,
  set: (patch) => set(patch),
}))

const doc = () => useDocumentStore.getState()
const store = () => useProjectStore.getState()

/** Whether the open project differs from its file. */
export function documentIsDirty(): boolean {
  const { project, savedHash } = store()
  return isDirty(project, savedHash)
}

// ---------------------------------------------------------------- recents

async function persistRecents(list: RecentEntry[]): Promise<void> {
  doc().set({ recents: list })
  try {
    await invoke('recents_write', { json: JSON.stringify(list) })
  } catch {
    // A recents list that cannot be written is a worse menu, not a lost
    // project. The documents themselves are all still on disk.
  }
}

/**
 * Read the list and check which files are still there. The check is why a
 * project deleted in Finder shows as "not found" instead of failing at open —
 * and it is a `stat` per entry, not an unzip, which is the whole reason the
 * preview is cached in the list.
 */
export async function loadRecents(): Promise<RecentEntry[]> {
  if (!isTauri()) return []
  let list: RecentEntry[]
  try {
    list = parseRecents(await invoke<string | null>('recents_read'))
  } catch {
    list = []
  }
  const present = new Map<string, boolean>()
  for (const entry of list) {
    present.set(entry.path, await invoke<boolean>('document_exists', { path: entry.path }))
  }
  const checked = markMissing(list, (p) => present.get(p) === true)
  doc().set({ recents: checked })
  return checked
}

export async function forgetRecent(path: string): Promise<void> {
  await persistRecents(dropRecent(doc().recents, path))
}

/**
 * One PNG of slide 1, small. Cached in recents so the switcher can draw a
 * closed project without opening its zip. Failure is silent: a missing
 * thumbnail is cosmetic, and a save must never fail over one.
 */
export async function projectPreview(project: Project): Promise<string | undefined> {
  const first: Slide | undefined = project.slides[0]
  if (!first) return undefined
  try {
    if (first.spanGroupId) {
      const members = project.slides.filter((s) => s.spanGroupId === first.spanGroupId)
      const leader = members.find((s) => s.spanRole === 'leader')
      const follower = members.find((s) => s.spanRole === 'follower')
      if (!leader || !follower) return undefined
      const halves = await renderSpanGroup(leader, follower, null, PREVIEW_WIDTH)
      return await blobToBase64(first.spanRole === 'follower' ? halves.follower : halves.leader)
    }
    return await blobToBase64(await renderSlide(first, null, PREVIEW_WIDTH))
  } catch {
    return undefined
  }
}

async function rememberRecent(project: Project, path: string, preview?: string): Promise<void> {
  await persistRecents(
    addRecent(doc().recents, {
      path,
      name: docNameFromPath(path),
      lastOpened: new Date().toISOString(),
      slideCount: project.slides.length,
      preview,
    }),
  )
}

// ---------------------------------------------------------------- saving

/** Pack the project and hand the bytes to Rust. Throws on a failed write. */
async function writeBundle(project: Project, path: string): Promise<number> {
  const { blob, missingImageKeys } = await exportProjectBundle(project)
  const dataBase64 = await blobToBase64(blob)

  // Before the overwrite, not after: the point of the .bak is to hold what the
  // migration read, and by the time the new bytes are down the original is gone.
  if (doc().pendingBackupPath === path) {
    try {
      await invoke('backup_original', { path })
    } catch {
      // Best effort. Refusing to save because the safety copy failed would
      // leave the user with no way to persist their work at all.
    }
    doc().set({ pendingBackupPath: null })
  }

  await invoke('save_document', { path, dataBase64 })

  // Rotation happens after the real file is down, and reuses the same bytes —
  // reading the previous version back off disk would double the IO of every
  // save. So the newest backup is a copy of what is now in the file, and
  // "the version before this one" is the second entry.
  try {
    await invoke('rotate_backup', {
      projectId: project.id,
      stamp: backupStamp(new Date()),
      dataBase64,
      keep: BACKUP_KEEP,
      metaJson: JSON.stringify({ docPath: path, name: docNameFromPath(path) }),
    })
  } catch {
    // A backup that cannot be rotated must not fail the save it is backing up.
  }
  return missingImageKeys.length
}

/** Everything that follows a successful write, shared by save and save-as. */
async function afterWrite(project: Project, path: string, missing: number): Promise<void> {
  store().setDocument(path, hashProject(project))
  // The mirror holds edits *since* the last save, so a save it does not know
  // about would look, on the next launch, like unsaved work that is already on
  // disk. Rewrite it before anything else can happen.
  await writeSnapshot(project, path)
  await rememberRecent(project, path, await projectPreview(project))
  if (missing) doc().set({ missingImages: missing })
}

/**
 * ⌘S. Returns false when nothing was written — either the user cancelled the
 * Save As it fell through to, or the write failed (and the error modal is up).
 */
export async function saveDocument(): Promise<boolean> {
  if (!isTauri()) return false
  const { project, docPath } = store()
  if (!project) return false
  if (!docPath) return saveDocumentAs()
  // A ⌘S on an unchanged document should cost nothing — and must not rotate a
  // backup, or holding the shortcut down would flush the history.
  if (!documentIsDirty()) return true

  doc().set({ busy: true })
  try {
    await afterWrite(project, docPath, await writeBundle(project, docPath))
    return true
  } catch (e) {
    doc().set({
      error: { title: t('저장하지 못했습니다'), detail: e instanceof Error ? e.message : String(e) },
    })
    return false
  } finally {
    doc().set({ busy: false })
  }
}

/** ⇧⌘S. Picks a path, writes there, and renames the project to match it. */
export async function saveDocumentAs(): Promise<boolean> {
  if (!isTauri()) return false
  const project = store().project
  if (!project) return false

  const dir = store().docPath ? undefined : await defaultDir()
  const suggested = `${sanitizeFileBase(project.name, t('제목 없음'))}${DOC_EXT}`
  const chosen = await saveDialog({
    title: t('다른 이름으로 저장'),
    defaultPath: store().docPath ?? (dir ? joinPath(dir, suggested) : suggested),
    filters: [{ name: 'Screenshot Studio', extensions: ['studio.zip'] }],
  })
  if (!chosen) return false

  // macOS treats ".studio.zip" as one unknown extension and does not reliably
  // append it, so the panel can hand back a name whose own overwrite check ran
  // against a different file. Normalise, then ask ourselves if that lands on
  // something that already exists.
  const path = ensureDocExt(chosen)
  if (path !== chosen && (await invoke<boolean>('document_exists', { path }))) {
    if (!(await askOverwrite(path))) return false
  }

  doc().set({ busy: true })
  try {
    // Premise 5: the file name is the document name, so the two must not be
    // allowed to drift. This is the only place a project gets renamed — and
    // the rename is only committed once the bytes are down, so a Save As that
    // fails leaves the open project exactly as it was.
    const renamed: Project = { ...project, name: docNameFromPath(path) }
    const missing = await writeBundle(renamed, path)
    store().updateProject({ name: renamed.name })
    await afterWrite(renamed, path, missing)
    return true
  } catch (e) {
    doc().set({
      error: { title: t('저장하지 못했습니다'), detail: e instanceof Error ? e.message : String(e) },
    })
    return false
  } finally {
    doc().set({ busy: false })
  }
}

async function defaultDir(): Promise<string> {
  return await invoke<string>('default_document_dir')
}

// ---------------------------------------------------------------- opening

/**
 * Open a `.studio.zip` as *the* document. The caller is responsible for having
 * cleared any unsaved work first (`ensureSaved`).
 */
export async function openDocument(path: string): Promise<boolean> {
  if (!isTauri()) return false
  doc().set({ busy: true })
  try {
    const base64 = await invoke<string>('read_document', { path })
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const { project, schemaVersion } = await readProjectBundle(new Blob([bytes]))

    store().loadProject(project)
    const opened = store().project!
    // Opened clean even when the file needed migrating: nothing the user did
    // made it differ, and marking it dirty would train them to press ⌘S — which
    // is exactly when the .bak has to be taken, not before.
    store().setDocument(path, hashProject(opened))
    doc().set({
      pendingBackupPath: schemaVersion < PROJECT_SCHEMA_VERSION ? path : null,
      pickerOpen: false,
      backups: null,
    })
    await writeSnapshot(opened, path)
    // Thumbnail on open too, not only on save: a project opened from a file
    // this app has never written would otherwise sit in the switcher as a blank
    // placeholder until the user happened to press ⌘S.
    await rememberRecent(opened, path, await projectPreview(opened))
    // The project that just closed may have been the last reference to its
    // blobs; its images live in its own file now.
    gcImages()
    return true
  } catch (e) {
    doc().set({
      error: { title: t('프로젝트를 열지 못했습니다'), detail: e instanceof Error ? e.message : String(e) },
    })
    return false
  } finally {
    doc().set({ busy: false })
  }
}

/** ⌘O — the native picker, then the same open path as a Recents click. */
export async function pickAndOpen(): Promise<boolean> {
  if (!isTauri()) return false
  if (!(await ensureSaved('open'))) return false
  const picked = await openDialog({
    title: t('프로젝트 열기'),
    multiple: false,
    directory: false,
    defaultPath: await defaultDir(),
    filters: [{ name: 'Screenshot Studio', extensions: ['studio.zip', 'zip'] }],
  })
  if (typeof picked !== 'string') return false
  return openDocument(picked)
}

/**
 * A file dropped on the window. Tauri's drag-drop event hands over real paths,
 * which is the whole reason this exists: the webview's own file input yields a
 * File with no path, so opening a bundle that way forks a copy instead of
 * opening the file on disk.
 */
export async function openDropped(paths: string[]): Promise<boolean> {
  const bundle = pickDroppedBundle(paths)
  if (!bundle) {
    doc().set({
      error: {
        title: t('프로젝트를 열지 못했습니다'),
        detail: t('창에는 프로젝트 파일(.studio.zip)만 놓을 수 있습니다. AI가 만든 파일 묶음은 「파일 가져오기」로 고르세요.'),
      },
    })
    return false
  }
  if (!(await ensureSaved('open'))) return false
  return openDocument(bundle)
}

/** A Recents click: the same guard, then the same open. */
export async function openRecent(path: string): Promise<boolean> {
  if (!(await ensureSaved('open'))) return false
  return openDocument(path)
}

// ---------------------------------------------------------- becoming a file

/**
 * Give a freshly built project (new, from a template, from an import, or from a
 * bundle the web path produced) its own file in the default folder.
 *
 * There is deliberately no "untitled, unsaved" state on the desktop: the whole
 * point of the document model is that work cannot be lost by forgetting to save
 * it, and a nameless document is the one shape that reintroduces exactly that.
 */
export async function adoptAsDocument(project: Project): Promise<boolean> {
  if (!isTauri()) return false
  doc().set({ busy: true })
  try {
    const dir = await defaultDir()
    const taken = await invoke<string[]>('list_document_names', { dir })
    const base = uniqueDocBase(sanitizeFileBase(project.name, t('제목 없음')), taken)
    const path = joinPath(dir, `${base}${DOC_EXT}`)

    // Keep the two names together from the very first write; a collision
    // suffix that only exists in the path would show one name in the header
    // and another in Finder. Committed after the write, as in saveDocumentAs.
    const named: Project = base === project.name ? project : { ...project, name: base }
    const missing = await writeBundle(named, path)
    if (named !== project) store().updateProject({ name: base })
    await afterWrite(named, path, missing)
    return true
  } catch (e) {
    doc().set({
      error: { title: t('저장하지 못했습니다'), detail: e instanceof Error ? e.message : String(e) },
    })
    return false
  } finally {
    doc().set({ busy: false })
  }
}

// ---------------------------------------------------------------- prompts

function askDirty(intent: DirtyIntent, name: string): Promise<DirtyAnswer> {
  return new Promise((resolve) => {
    doc().set({
      prompt: {
        kind: 'dirty',
        intent,
        name,
        resolve: (answer) => {
          doc().set({ prompt: null })
          resolve(answer)
        },
      },
    })
  })
}

function askOverwrite(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    doc().set({
      prompt: {
        kind: 'overwrite',
        path,
        resolve: (ok) => {
          doc().set({ prompt: null })
          resolve(ok)
        },
      },
    })
  })
}

/**
 * The three-button gate every destructive transition goes through: 저장 /
 * 저장 안 함 / 취소. Returns false only for 취소 — i.e. "do not proceed".
 *
 * Two buttons ("replace / cancel") is what the app used to offer everywhere,
 * and it forces the user to lose either their work or their intent.
 */
export async function ensureSaved(intent: DirtyIntent): Promise<boolean> {
  if (!isTauri()) return true
  const { project } = store()
  if (!project || !documentIsDirty()) return true
  const answer = await askDirty(intent, project.name)
  if (answer === 'cancel') return false
  if (answer === 'discard') return true
  return saveDocument()
}

/**
 * The webview half of the close guard (src-tauri/src/quit.rs). Rust has already
 * held the window open and is waiting.
 *
 * The ack goes first and is deliberately separate from the answer: Rust's
 * 3-second timer is a *liveness* check, not a decision deadline. Acking stops
 * it, which is what lets the user read the prompt at their own pace and lets a
 * slow save finish. Without the ack a save that takes longer than three seconds
 * would be cut off by the exit it is racing.
 */
export async function handleCloseRequest(): Promise<void> {
  await invoke('close_ack').catch(() => {})
  let close: boolean
  try {
    close = await ensureSaved('close')
  } catch {
    // A save that threw its way out here has already told the user. Staying
    // open is the safe answer: nothing is lost by not quitting.
    close = false
  }
  await invoke('confirm_close', { close }).catch(() => {})
}

// ---------------------------------------------------------------- backups

export async function loadBackups(): Promise<void> {
  const project = store().project
  if (!isTauri() || !project) return
  try {
    const listing = await invoke<{ entries: BackupEntry[] }>('list_backups', {
      projectId: project.id,
    })
    doc().set({ backups: listing.entries ?? [] })
  } catch {
    doc().set({ backups: [] })
  }
}

/**
 * Open a rotated version, keeping the document's own path so ⌘S writes the
 * restored content back where it belongs. It comes up dirty on purpose: nothing
 * is overwritten until the user says so, and the version they just replaced is
 * itself the newest backup.
 */
export async function restoreBackup(entry: BackupEntry): Promise<boolean> {
  const target = store().docPath
  if (!isTauri() || !target) return false
  doc().set({ busy: true })
  try {
    const base64 = await invoke<string>('read_document', { path: entry.path })
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const { project } = await readProjectBundle(new Blob([bytes]))
    store().loadProject(project)
    // savedHash stays null → dirty, which is the truth: the file still holds
    // the version the user is replacing.
    store().setDocument(target, null)
    doc().set({ backups: null, pickerOpen: false })
    await writeSnapshot(store().project, target)
    return true
  } catch (e) {
    doc().set({
      error: { title: t('프로젝트를 열지 못했습니다'), detail: e instanceof Error ? e.message : String(e) },
    })
    return false
  } finally {
    doc().set({ busy: false })
  }
}

// ------------------------------------------------------- library retirement

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(LIBRARY_MIGRATED_KEY) === '1'
  } catch {
    return false
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(LIBRARY_MIGRATED_KEY, '1')
  } catch {
    // Worst case the sweep runs again — which is why it skips names that
    // already exist rather than writing a second copy.
  }
}

/**
 * One-time: write every library snapshot out as a real file and put it in
 * Recents, so retiring the in-browser library takes nothing with it.
 *
 * Runs against a *saved snapshot*, which holds only `imageKey` pointers — the
 * blobs are in IndexedDB, and `exportProjectBundle` is what pulls them in. If
 * they were swept before this ran, the bundle reports them and the count comes
 * back here rather than being discovered months later.
 */
export async function migrateLibraryToFiles(
  projects: Project[],
): Promise<{ migrated: number; missingImages: number } | null> {
  if (!isTauri() || alreadyMigrated() || projects.length === 0) return null
  let migrated = 0
  let missingImages = 0
  try {
    const dir = await defaultDir()
    const existing = new Set(await invoke<string[]>('list_document_names', { dir }))
    const written: string[] = []
    for (const project of projects) {
      const plain = sanitizeFileBase(project.name, t('제목 없음'))
      // Idempotence, which matters because a run interrupted halfway is
      // retried on the next launch: a snapshot whose file is already in the
      // folder is skipped rather than written again under " 2". Names that
      // collide *within* one run still get the suffix.
      if (existing.has(`${plain}${DOC_EXT}`)) continue
      const base = uniqueDocBase(plain, written)
      const path = joinPath(dir, `${base}${DOC_EXT}`)
      const { blob, missingImageKeys } = await exportProjectBundle(project)
      await invoke('save_document', { path, dataBase64: await blobToBase64(blob) })
      written.push(`${base}${DOC_EXT}`)
      missingImages += missingImageKeys.length
      migrated++
      await persistRecents(
        addRecent(doc().recents, {
          path,
          name: base,
          lastOpened: project.updatedAt,
          slideCount: project.slides.length,
        }),
      )
    }
  } catch {
    // Leave the flag unset so the rest is picked up next launch; the skip
    // above is what keeps that retry from duplicating what already landed.
    return migrated ? { migrated, missingImages } : null
  }
  markMigrated()
  return { migrated, missingImages }
}
