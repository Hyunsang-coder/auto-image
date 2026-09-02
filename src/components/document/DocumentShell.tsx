// The desktop document surface: native menu, window title, close guard, and the
// ⌘O switcher that Recents *is*.
//
// Renders nothing in the web build — `isTauri()` gates the whole component, and
// every effect below is inert there.
//
// Premise 2 of docs/document-model.md is two to four projects at a time, so
// there is no browser here: the recents list, with a cached thumbnail per
// project, is the entire switching UI. Drawing it opens no `.studio.zip`.

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { Modal } from '../common/Modal'
import { useProjectStore } from '../../store/useProjectStore'
import { useLibraryStore } from '../../store/useLibraryStore'
import { isTauri } from '../../lib/tauri'
import { formatTime } from '../../lib/formatTime'
import { docNameFromPath, isDirty } from '../../lib/documentModel'
import {
  ensureSaved,
  forgetRecent,
  handleCloseRequest,
  loadBackups,
  loadRecents,
  migrateLibraryToFiles,
  openDropped,
  openRecent,
  pickAndOpen,
  restoreBackup,
  saveDocument,
  saveDocumentAs,
  useDocumentStore,
} from '../../lib/documentIO'
import { useI18nStore, useT } from '../../i18n'

/**
 * The menu is built in Rust but its words live here — `src/i18n/` is a webview
 * module, and a Korean string hardcoded on the Rust side would fork the
 * dictionary in two. Pushed on mount, on every language toggle, and whenever
 * the recents list changes.
 */
function menuLabels(t: (ko: string) => string) {
  return {
    app: 'Screenshot Studio',
    about: t('Screenshot Studio 정보'),
    hide: t('가리기'),
    hideOthers: t('다른 항목 가리기'),
    showAll: t('모두 보기'),
    quit: t('종료'),
    file: t('파일'),
    newProject: t('새 프로젝트'),
    open: t('열기…'),
    openRecent: t('최근 프로젝트'),
    noRecents: t('최근 항목 없음'),
    save: t('저장'),
    saveAs: t('다른 이름으로 저장…'),
    close: t('창 닫기'),
    edit: t('편집'),
    undo: t('실행 취소'),
    redo: t('다시 실행'),
    cut: t('오려두기'),
    copy: t('복사하기'),
    paste: t('붙여넣기'),
    selectAll: t('전체 선택'),
    window: t('윈도우'),
    minimize: t('최소화'),
    zoom: t('확대/축소'),
    fullscreen: t('전체 화면 사용'),
  }
}

/**
 * ⌘N. Step 1 is the home screen, where "새 프로젝트" is one click — so this takes
 * the user there rather than minting a project the launcher would have made.
 */
async function newFromMenu(): Promise<void> {
  if (!(await ensureSaved('new'))) return
  useProjectStore.getState().setStep(1)
  useDocumentStore.getState().set({ pickerOpen: false })
}

export function DocumentShell() {
  const t = useT()
  const uiLocale = useI18nStore((s) => s.locale)
  const project = useProjectStore((s) => s.project)
  const docPath = useProjectStore((s) => s.docPath)
  const savedHash = useProjectStore((s) => s.savedHash)
  const { recents, prompt, error, missingImages, pickerOpen, backups, busy, dragOver } =
    useDocumentStore()
  const set = useDocumentStore((s) => s.set)
  const [migrated, setMigrated] = useState<{ migrated: number; missingImages: number } | null>(null)

  const dirty = isDirty(project, savedHash)

  // Recents first, then the one-time library sweep — the sweep appends to the
  // list it just loaded, and starting from an empty one would drop the entries
  // already on disk.
  useEffect(() => {
    if (!isTauri()) return
    void loadRecents().then(() =>
      migrateLibraryToFiles(useLibraryStore.getState().projects).then((result) => {
        if (result?.migrated) setMigrated(result)
      }),
    )
  }, [])

  // Dropping a file on the window opens it. This has to be Tauri's own event,
  // not an HTML5 drop handler: the window keeps the OS drag-drop handler
  // (`dragDropEnabled` defaults to true), so `drop` never reaches the webview —
  // and the event's real paths are what let the bundle open in place.
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === 'over') {
          useDocumentStore.getState().set({ dragOver: true })
          return
        }
        const state = useDocumentStore.getState()
        state.set({ dragOver: false })
        // A drop is the one way in that an open modal cannot block, and
        // `ensureSaved` keeps a single prompt — a second one would replace the
        // first and leave whoever is awaiting it hanging.
        if (e.payload.type === 'drop' && !state.prompt && !state.busy) {
          void openDropped(e.payload.paths)
        }
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  // Keep the native menu in the user's language, with the current recents.
  useEffect(() => {
    if (!isTauri()) return
    void invoke('set_menu_labels', {
      labels: menuLabels(t),
      recents: recents.map((r) => ({ path: r.path, name: r.name })),
    }).catch((e) => {
      // Survivable — every command is also in the app's own UI — but it must
      // not vanish without a trace. Rust logs the build failure too.
      console.error('menu build failed', e)
    })
  }, [t, uiLocale, recents])

  // Premise 5: the window title is the file name. The dirty marker goes in the
  // title because Tauri does not expose macOS's `isDocumentEdited` dot, and
  // reaching for it would mean an objc dependency for one pixel.
  useEffect(() => {
    if (!isTauri()) return
    const name = docPath ? docNameFromPath(docPath) : project?.name
    const title = name ? `${dirty ? '• ' : ''}${name}` : 'Screenshot Studio'
    void getCurrentWindow().setTitle(title).catch(() => {})
  }, [docPath, project?.name, dirty])

  // Menu clicks. Every id maps to a handler that already existed — the menu is
  // a second door, not a second implementation.
  useEffect(() => {
    if (!isTauri()) return
    const unlisten = listen<{ id: string; path?: string }>('menu:action', (event) => {
      const { id, path } = event.payload
      if (id === 'save') void saveDocument()
      else if (id === 'saveAs') void saveDocumentAs()
      else if (id === 'open') void pickAndOpen()
      else if (id === 'new') void newFromMenu()
      else if (id === 'openRecent' && path) void openRecent(path)
    })
    return () => {
      void unlisten.then((off) => off())
    }
  }, [])

  // The close guard. Rust has already prevented the close and is waiting; the
  // ack tells it the webview is alive, which is what stops the 3-second
  // liveness timeout from exiting out from under a save that is still running.
  useEffect(() => {
    if (!isTauri()) return
    const unlisten = listen('document:close-requested', () => {
      void handleCloseRequest()
    })
    return () => {
      void unlisten.then((off) => off())
    }
  }, [])

  if (!isTauri()) return null

  const previous = backups?.slice(1) ?? []

  return (
    <>
      {/* Below the modal layer on purpose: a drop while a blocking prompt is up
          still has to show the prompt. */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-bg)]/70">
          <p className="rounded-xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-surface)] px-6 py-4 text-[length:var(--text-title)] font-medium text-[var(--color-text)]">
            {t('프로젝트 파일을 놓으면 엽니다')}
          </p>
        </div>
      )}

      {pickerOpen && (
        <Modal title={t('프로젝트 열기')} size="lg" onClose={() => set({ pickerOpen: false, backups: null })}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {t('최근 프로젝트를 고르거나 파일에서 엽니다. 저장하지 않은 편집이 있으면 먼저 물어봅니다.')}
          </p>

          {recents.length === 0 && (
            <p className="mt-4 text-sm text-[var(--color-text-dim)]">{t('최근 항목 없음')}</p>
          )}

          <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {recents.map((entry) => {
              const isOpen = entry.path === docPath
              return (
                <li
                  key={entry.path}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
                >
                  {entry.preview ? (
                    <img
                      src={`data:image/png;base64,${entry.preview}`}
                      alt=""
                      className="h-12 w-8 shrink-0 rounded border border-[var(--color-border)] object-cover"
                    />
                  ) : (
                    <span className="h-12 w-8 shrink-0 rounded border border-dashed border-[var(--color-border)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {entry.name}
                      {isOpen && (
                        <span className="ml-2 text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
                          {t('열려 있음')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
                      {entry.missing
                        ? t('찾을 수 없음')
                        : `${t('{n}장', { n: entry.slideCount })}${entry.lastOpened ? ` · ${formatTime(entry.lastOpened)}` : ''}`}
                    </p>
                  </div>
                  {entry.missing ? (
                    <button
                      type="button"
                      onClick={() => void forgetRecent(entry.path)}
                      className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                    >
                      {t('목록에서 제거')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || isOpen}
                      onClick={() => void openRecent(entry.path)}
                      className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('열기')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {/* The rotated saves that replaced the library. Entry 0 is a copy of
              what is in the file right now, so what is offered starts at 1. */}
          {backups !== null && (
            <div className="mt-5 border-t border-[var(--color-border)] pt-4">
              <p className="text-sm font-medium text-[var(--color-text)]">{t('이전 버전')}</p>
              {previous.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                  {t('아직 이전 버전이 없습니다. 저장할 때마다 최근 10개가 보관됩니다.')}
                </p>
              ) : (
                <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {previous.map((entry) => (
                    <li key={entry.path} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-[var(--color-text-dim)]">
                        {formatTime(backupTime(entry.name))}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void restoreBackup(entry)}
                        className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] disabled:opacity-50"
                      >
                        {t('되돌리기')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void pickAndOpen()}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)] disabled:opacity-50"
              >
                {t('파일에서 열기…')}
              </button>
              {project && backups === null && (
                <button
                  type="button"
                  onClick={() => void loadBackups()}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
                >
                  {t('이전 버전…')}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => set({ pickerOpen: false, backups: null })}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {/*
        Three buttons, not two. "교체 / 취소" makes the user choose between
        losing their work and losing their intent; this is the standard the rest
        of the app should follow.
      */}
      {prompt?.kind === 'dirty' && (
        <Modal title={t('저장하지 않은 변경 사항')} onClose={() => prompt.resolve('cancel')}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {prompt.intent === 'close'
              ? t('「{name}」의 변경 사항을 저장할까요? 저장하지 않으면 사라집니다.', { name: prompt.name })
              : t('「{name}」에 저장하지 않은 변경 사항이 있습니다. 계속하기 전에 저장할까요?', { name: prompt.name })}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => prompt.resolve('cancel')}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('취소')}
            </button>
            <button
              type="button"
              onClick={() => prompt.resolve('discard')}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-danger)] hover:border-[var(--color-danger)]"
            >
              {t('저장 안 함')}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => prompt.resolve('save')}
              className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
            >
              {t('저장')}
            </button>
          </div>
        </Modal>
      )}

      {/* The save panel checked the name it showed; the extension we add back
          afterwards can land on a different file, so that one is ours to ask. */}
      {prompt?.kind === 'overwrite' && (
        <Modal title={t('덮어쓸까요?')} onClose={() => prompt.resolve(false)}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {t('「{name}」이(가) 이미 있습니다. 덮어쓰면 기존 내용은 사라집니다.', {
              name: docNameFromPath(prompt.path),
            })}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => prompt.resolve(false)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('취소')}
            </button>
            <button
              type="button"
              onClick={() => prompt.resolve(true)}
              className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger-on)] hover:brightness-110"
            >
              {t('덮어쓰기')}
            </button>
          </div>
        </Modal>
      )}

      {error && (
        <Modal title={error.title} onClose={() => set({ error: null })}>
          <p className="mt-2 text-sm text-[var(--color-danger)]">
            {t('프로젝트는 그대로 열려 있고, 디스크의 파일도 그대로입니다.')}
          </p>
          <p className="mt-2 break-words text-xs text-[var(--color-text-dim)]">{error.detail}</p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => set({ error: null })}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {missingImages > 0 && (
        <Modal title={t('저장 완료')} onClose={() => set({ missingImages: 0 })}>
          <p className="mt-2 text-sm text-[var(--color-warning)]">
            {t('저장했지만 이미지 {n}개를 파일에 담지 못했습니다 — 이 브라우저 저장소에서 이미 사라진 이미지입니다. 다른 기기에서 열면 그 자리가 비어 보입니다.', {
              n: missingImages,
            })}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => set({ missingImages: 0 })}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {migrated && (
        <Modal title={t('라이브러리를 파일로 옮겼습니다')} onClose={() => setMigrated(null)}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {t('이 브라우저에 보관돼 있던 프로젝트 {n}개를 「Screenshot Studio」 폴더에 파일로 저장하고 최근 목록에 넣었습니다.', {
              n: migrated.migrated,
            })}
          </p>
          {migrated.missingImages > 0 && (
            <p className="mt-2 text-sm text-[var(--color-warning)]">
              {t('이미지 {n}개는 이미 사라져 파일에 담기지 못했습니다.', { n: migrated.missingImages })}
            </p>
          )}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setMigrated(null)}
              className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
            >
              {t('확인')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

/** `2026-09-01T12-30-00Z.studio.zip` → an ISO string `formatTime` can read. */
function backupTime(name: string): string {
  const stem = name.replace(/\.studio\.zip$/i, '')
  const [date, time] = stem.split('T')
  if (!time) return stem
  const [h, m, s] = time.replace(/Z$/, '').split('-')
  return `${date}T${h}:${m}:${s}Z`
}
