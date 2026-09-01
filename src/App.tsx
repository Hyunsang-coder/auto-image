import { useEffect, useRef, useState } from 'react'
import { StepIndicator } from './components/common/StepIndicator'
import { MenuButton } from './components/common/MenuButton'
import { AgentBridgeCard } from './components/common/AgentBridgeCard'
import { UpdatePill } from './components/common/UpdatePill'
import { useUpdateCheck } from './lib/updateCheck'
import { isTauri } from './lib/tauri'
import { Modal } from './components/common/Modal'
import { ProjectSetup } from './components/setup/ProjectSetup'
import { EditorLayout } from './components/editor/EditorLayout'
import { LocalizeEditor } from './components/localize/LocalizeEditor'
import { ExportPanel } from './components/export/ExportPanel'
import { useProjectStore } from './store/useProjectStore'
import { useLibraryStore } from './store/useLibraryStore'
import { useCustomStore } from './store/useCustomStore'
import { projectTemplateFromProject } from './constants/projectTemplates'
import { newId } from './constants/defaults'
import { APP_NAME, APP_SHORT_NAME } from './constants/branding'
import { saveAs } from 'file-saver'
import { pruneOrphanImages } from './lib/imageStore'
import { allReferencedImageKeys } from './lib/imageRefs'
import { exportProjectBundle } from './lib/projectBundle'
import { exportProject } from './lib/projectExport'
import { STORAGE_ERROR_EVENT, STORAGE_PRESSURE_EVENT, storageUsage } from './lib/safeStorage'
import { startAgentBridge } from './lib/agentBridge'
import { DocumentShell } from './components/document/DocumentShell'
import { docNameFromPath, isDirty } from './lib/documentModel'
import { saveDocument, saveDocumentAs, useDocumentStore } from './lib/documentIO'
import { armAutosave, restoreImages, type RecoveryDecision } from './lib/autosave'
import { formatTime } from './lib/formatTime'
import { getUntranslatedLocales, getSlidesMissingScreenshot } from './lib/readiness'
import { useI18nStore, useT } from './i18n'

interface BundleWindow extends Window {
  __bundleExportEnabled?: boolean
  __downloadProjectBundle?: () => Promise<void>
  __exportManifestEnabled?: boolean
  __exportManifest?: () => string
}

function App() {
  const t = useT()
  const { update, message: updateMessage, auto: autoUpdate, setAuto: setAutoUpdate, check: checkUpdate } = useUpdateCheck()
  const uiLocale = useI18nStore((s) => s.locale)
  const setUiLocale = useI18nStore((s) => s.setLocale)
  const step = useProjectStore((s) => s.step)
  const setStep = useProjectStore((s) => s.setStep)
  const project = useProjectStore((s) => s.project)
  const docPath = useProjectStore((s) => s.docPath)
  const savedHash = useProjectStore((s) => s.savedHash)
  const openPicker = useDocumentStore((s) => s.set)
  const resetProject = useProjectStore((s) => s.resetProject)
  const updateProject = useProjectStore((s) => s.updateProject)
  const saveProject = useLibraryStore((s) => s.saveProject)
  const savedProjects = useLibraryStore((s) => s.projects)
  const addProjectTemplate = useCustomStore((s) => s.addProjectTemplate)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [justSavedTemplate, setJustSavedTemplate] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [recovery, setRecovery] = useState<Extract<RecoveryDecision, { kind: 'offer' }> | null>(null)
  // Nothing that prunes images may run until this is true — see the sweep below.
  const [recoveryResolved, setRecoveryResolved] = useState(false)
  const [recoveryMissing, setRecoveryMissing] = useState(0)
  const [saveWarning, setSaveWarning] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Fraction of the localStorage budget in use, once it is high enough to be
  // worth saying. Seeded from what is already on disk so a session that opens
  // an already-full store hears about it before its first write fails.
  const [storagePressure, setStoragePressure] = useState(() => {
    const ratio = storageUsage()
    return ratio >= 0.8 ? ratio : 0
  })
  const prunedRef = useRef(false)
  // Set by the autosave effect so answering the recovery prompt can start the
  // mirror it deliberately held back.
  const resumeMirrorRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!project && step !== 1) setStep(1)
  }, [project, step, setStep])

  useEffect(() => {
    document.title = project ? `${project.name} — ${APP_NAME}` : APP_NAME
  }, [project])

  // On the desktop the document is a file, so its name is the file's — and the
  // dirty marker is the difference between the project and what that file
  // holds. In the web build there is no file, so nothing changes there.
  const documentName = docPath ? docNameFromPath(docPath) : project?.name
  const dirty = isTauri() && isDirty(project, savedHash)

  // Sweep image blobs left orphaned by interrupted sessions, once on startup.
  // Skip when there's no project so we never wipe blobs before hydration, and
  // wait for the recovery decision: the keep-set is built from the *loaded*
  // project, so sweeping while a newer mirror is still on offer would delete
  // exactly the images that recovery is about to need.
  useEffect(() => {
    if (prunedRef.current || !recoveryResolved) return
    const current = useProjectStore.getState().project
    if (!current) return
    prunedRef.current = true
    pruneOrphanImages(allReferencedImageKeys())
  }, [project, recoveryResolved])

  // Desktop shell only: lets an MCP agent drive this window. No-op on the web.
  useEffect(() => {
    startAgentBridge()
  }, [])

  // Crash recovery, then the mirror that feeds it. Order matters: mirroring
  // writes the current project, so it must not start until any recovery offer
  // has been answered — otherwise the first debounce tick overwrites the file
  // being offered.
  useEffect(() => {
    let stopMirror: (() => void) | undefined
    let cancelled = false
    const { project: activeAtStart, docPath: pathAtStart } = useProjectStore.getState()
    void armAutosave(activeAtStart, pathAtStart).then((armed) => {
      if (cancelled) return
      const startMirror = () => {
        if (cancelled || stopMirror) return
        stopMirror = armed.begin(
          () => {
            const { project: current, docPath: path } = useProjectStore.getState()
            return { project: current, docPath: path }
          },
          (fn) =>
            useProjectStore.subscribe((s, prev) => {
              if (s.project !== prev.project) fn()
            }),
        )
      }
      resumeMirrorRef.current = startMirror
      if (armed.decision.kind === 'offer') setRecovery(armed.decision)
      else {
        setRecoveryResolved(true)
        startMirror()
      }
    })
    return () => {
      cancelled = true
      stopMirror?.()
    }
  }, [])

  useEffect(() => {
    const onError = () => setStorageError(true)
    const onPressure = (e: Event) => {
      const { over, ratio } = (e as CustomEvent<{ over: boolean; ratio: number }>).detail
      setStoragePressure(over ? ratio : 0)
    }
    window.addEventListener(STORAGE_ERROR_EVENT, onError)
    window.addEventListener(STORAGE_PRESSURE_EVENT, onPressure)
    return () => {
      window.removeEventListener(STORAGE_ERROR_EVENT, onError)
      window.removeEventListener(STORAGE_PRESSURE_EVENT, onPressure)
    }
  }, [])

  // Headless bundle hook: the CLI `--bundle` flag drives this to download an
  // editable project .zip without rendering. Inert in the app (flag never set).
  useEffect(() => {
    const w = window as BundleWindow
    if (!w.__bundleExportEnabled) return
    w.__downloadProjectBundle = async () => {
      const p = useProjectStore.getState().project
      if (!p) return
      saveAs((await exportProjectBundle(p)).blob, `${p.name || 'project'}.studio.zip`)
    }
  }, [])

  // Headless reverse-export hook: `--export-manifest` reads the active project
  // back out as a re-importable manifest + caption template (lossy). The harness
  // does the reversal in-app since it bundles the lib. Inert in the app.
  useEffect(() => {
    const w = window as BundleWindow
    if (!w.__exportManifestEnabled) return
    w.__exportManifest = () => {
      const p = useProjectStore.getState().project
      return p
        ? JSON.stringify(exportProject(p))
        : JSON.stringify({ manifest: null, captions: '', screenshotPlan: [], externalImagePlan: [], issues: ['no project loaded'] })
    }
  }, [])

  function handleReset() {
    resetProject()
    setShowResetConfirm(false)
  }

  // Answering either way releases the mirror (and the image sweep) that startup
  // held back. Images come back before the project loads, so the editor never
  // paints a slide whose screenshot is still missing.
  async function acceptRecovery() {
    if (!recovery) return
    const missing = await restoreImages(recovery.project)
    // loadProject clears the file identity (the usual case is a project that
    // came from somewhere else). Recovery is the exception: these edits belong
    // to a document, and the point is to reopen it *dirty* so one ⌘S puts them
    // in the file. The saved hash stays the file's, untouched.
    const { docPath: openPath, savedHash: openHash } = useProjectStore.getState()
    useProjectStore.getState().loadProject(recovery.project)
    if (recovery.reason === 'unsaved') {
      useProjectStore.getState().setDocument(openPath, openHash)
    } else if (recovery.docPath) {
      // A mirror from another document: it belongs to that file, and nothing
      // says the file already holds these edits.
      useProjectStore.getState().setDocument(recovery.docPath, null)
    }
    setRecovery(null)
    setRecoveryResolved(true)
    resumeMirrorRef.current()
    if (missing) setRecoveryMissing(missing)
  }

  function declineRecovery() {
    setRecovery(null)
    setRecoveryResolved(true)
    resumeMirrorRef.current()
  }

  function openSaveModal() {
    setSaveName(project?.name ?? '')
    setShowSaveModal(true)
  }

  // Whether the active project already has a saved snapshot — gates the
  // overwrite-vs-save-as-new choice in the save modal.
  const existsInLibrary = !!project && savedProjects.some((p) => p.id === project.id)

  function handleSaveProject(asNew = false) {
    const name = saveName.trim() || project?.name || t('제목 없음')
    // A fresh id makes the library upsert create a separate entry; the active
    // project becomes that copy, so the original snapshot stays untouched and
    // later saves update the copy.
    updateProject(asNew ? { id: newId('project'), name } : { name })
    const current = useProjectStore.getState().project
    if (current) saveProject(current)
    setShowSaveModal(false)
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 1600)
  }

  async function handleExportBundle() {
    const current = useProjectStore.getState().project
    if (!current) return
    try {
      const { blob, missingImageKeys } = await exportProjectBundle(current)
      saveAs(blob, `${current.name || t('제목 없음')}.studio.zip`)
      // The file is still worth having — it carries every caption, layout and
      // setting. But a save that quietly shipped fewer images than the project
      // references is exactly the failure nobody notices until reopening it.
      if (missingImageKeys.length) setSaveWarning(missingImageKeys.length)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  function openTemplateModal() {
    setTemplateName(project ? t('{name} 템플릿', { name: project.name }) : '')
    setShowTemplateModal(true)
  }

  function handleSaveTemplate() {
    const current = useProjectStore.getState().project
    if (!current) return
    const label = templateName.trim() || t('{name} 템플릿', { name: current.name })
    addProjectTemplate(projectTemplateFromProject(current, label))
    setShowTemplateModal(false)
    setJustSavedTemplate(true)
    window.setTimeout(() => setJustSavedTemplate(false), 1600)
  }

  // Readiness flags for the step-nav dots. Same shared predicates ExportPanel
  // uses, so the dot and the export banner can never disagree.
  const untranslatedLocales = project ? getUntranslatedLocales(project) : []
  const slidesMissingScreenshot = project ? getSlidesMissingScreenshot(project) : []
  const localizeIncomplete = untranslatedLocales.length > 0
  const editorIncomplete = slidesMissingScreenshot.length > 0

  return (
    <div className="flex h-full flex-col">
      {/*
        Three toolbar zones (HIG: leading / center / trailing). Both flanks are
        1fr so the step nav sits at the true centre and stops drifting as the
        trailing group changes width between steps. Trailing keeps to the ~3
        groups the HIG allows — primary action, More menu, appearance-independent
        language control — with everything else folded into the menu.
      */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            title={APP_NAME}
            className="shrink-0 rounded-md bg-[var(--color-text)] px-1.5 py-0.5 text-[length:var(--text-ui-sm)] font-bold tracking-tight text-[var(--color-surface)]"
          >
            {APP_SHORT_NAME}
          </span>
          {/* The window title is the document, not the app name (HIG). On the
              desktop that name is the file's, and the leading dot is the
              standard "edited" marker. */}
          <span className="flex min-w-0 items-center truncate text-[length:var(--text-ui)] font-medium text-[var(--color-text)]">
            {dirty && (
              <span
                aria-hidden
                title={t('저장하지 않은 변경 사항')}
                className="mr-1 text-[var(--color-text-dim)]"
              >
                •
              </span>
            )}
            {/* Renaming: on the desktop the name IS the file, and the app never
                renames a file the user placed — so the name opens Save As
                rather than editing in place. The web build has no file, so
                there the field simply is the project's name. */}
            {!project ? (
              APP_NAME
            ) : isTauri() ? (
              <button
                type="button"
                onClick={() => void saveDocumentAs()}
                title={t('다른 이름으로 저장…')}
                className="truncate rounded px-1 hover:bg-[var(--color-surface-2)]"
              >
                {documentName}
              </button>
            ) : (
              <input
                value={project.name}
                aria-label={t('프로젝트 이름')}
                maxLength={60}
                onChange={(e) => updateProject({ name: e.target.value })}
                /* Empty is fine while you are retyping, but it must not stick:
                   the name is the export's file name and the window title. */
                onBlur={(e) => {
                  if (!e.target.value.trim()) updateProject({ name: t('제목 없음') })
                }}
                className="min-w-0 max-w-[16rem] flex-1 truncate rounded border border-transparent bg-transparent px-1 text-[length:var(--text-ui)] font-medium text-[var(--color-text)] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)]"
              />
            )}
          </span>
          {project && (
            <span className="shrink-0 text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]">
              {t('{n}장', { n: project.slides.length })}
            </span>
          )}
        </div>

        {/* The home screen is not a step in making a project — it is where you
            pick which project. With nothing open there is nothing to step
            through, so the nav appears with the first project. */}
        {!project ? (
          <div />
        ) : (
        <StepIndicator
          current={step}
          onJump={(s) => setStep(s)}
          editorIncomplete={editorIncomplete}
          localizeIncomplete={localizeIncomplete}
          editorHint={
            editorIncomplete
              ? t('스크린샷 없는 슬라이드 {n}개', { n: slidesMissingScreenshot.length })
              : undefined
          }
          localizeHint={
            localizeIncomplete
              ? t('번역 미완료 로케일 {n}개', { n: untranslatedLocales.length })
              : undefined
          }
        />
        )}

        <div className="flex items-center justify-end gap-2">
          {/* The template confirmation can't live on its menu item — the menu is
              closed by the time it fires, so nobody would ever see it. */}
          {justSavedTemplate && (
            <span
              role="status"
              className="text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]"
            >
              {t('템플릿 저장됨 ✓')}
            </span>
          )}
          {/*
            Every edit already persists (the project store is wrapped in
            `persist`), so a Save button would claim work is at risk that is
            not — and anyone who never pressed it would believe they had lost
            their project. State the truth instead; the thing the old button
            actually did (upsert a library snapshot) is a named menu command.
          */}
          {project && step !== 1 && !isTauri() && (
            <span
              role="status"
              title={t('모든 변경 사항은 자동으로 저장됩니다')}
              className="text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]"
            >
              {justSaved ? t('라이브러리에 저장됨 ✓') : t('저장됨')}
            </span>
          )}
          {/* On the desktop the honest status is about the file: an edit is
              only safe once ⌘S has put it there. */}
          {project && isTauri() && (
            <span
              role="status"
              className="text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]"
            >
              {dirty ? t('저장되지 않음') : t('저장됨')}
            </span>
          )}
          {updateMessage && (
            <span role="status" className="text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]">
              {updateMessage}
            </span>
          )}
          <UpdatePill update={update} />
          {/* Desktop only — renders nothing in the web build. */}
          <AgentBridgeCard />
          {(project || isTauri()) && (
            <MenuButton
              label={t('더 보기')}
              items={[
                // Desktop: the document commands. The library is retired here —
                // every project is a file in the Screenshot Studio folder, and
                // Recents is how you get back to one.
                ...(isTauri()
                  ? [
                      {
                        label: t('프로젝트 열기…'),
                        hint: t('⌘O — 최근 항목에서 고르거나 파일에서 엽니다'),
                        onSelect: () => openPicker({ pickerOpen: true }),
                      },
                      ...(project
                        ? [
                            {
                              label: t('저장'),
                              hint: t('⌘S — 열려 있는 파일에 씁니다'),
                              onSelect: () => void saveDocument(),
                            },
                            {
                              label: t('다른 이름으로 저장…'),
                              hint: t('⇧⌘S — 새 위치·새 이름으로 저장하고 그 파일로 이어서 작업합니다'),
                              onSelect: () => void saveDocumentAs(),
                            },
                          ]
                        : []),
                    ]
                  : []),
                ...(step !== 1 && !isTauri()
                  ? [
                      {
                        label: t('라이브러리에 저장'),
                        hint: t('이 브라우저 안에 보관 — 파일은 만들지 않습니다'),
                        onSelect: openSaveModal,
                      },
                      {
                        label: t('프로젝트 파일 저장'),
                        hint: t('.zip 파일로 내보내기 — 「프로젝트 열기」로 그대로 이어서 편집'),
                        onSelect: handleExportBundle,
                      },
                    ]
                  : []),
                ...(step !== 1
                  ? [
                      {
                        label: t('템플릿으로 저장'),
                        hint: t('스크린샷을 뺀 디자인만 — 새 프로젝트의 출발점'),
                        onSelect: openTemplateModal,
                      },
                    ]
                  : []),
                ...(isTauri()
                  ? [
                      { label: t('업데이트 확인'), onSelect: checkUpdate },
                      {
                        label: autoUpdate
                          ? t('시작할 때 확인함 ✓')
                          : t('시작할 때 확인'),
                        onSelect: () => setAutoUpdate(!autoUpdate),
                      },
                    ]
                  : []),
                ...(project
                  ? [
                      {
                        label: t('초기화'),
                        onSelect: () => setShowResetConfirm(true),
                        destructive: true,
                      },
                    ]
                  : []),
              ]}
            />
          )}
          {/* Two segments rather than a toggle labelled with the *other* state:
              the current language stays readable without decoding the control. */}
          <div
            role="group"
            aria-label={t('표시 언어')}
            className="flex h-[var(--control-h)] overflow-hidden rounded-md border border-[var(--color-border-strong)]"
          >
            {(['ko', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setUiLocale(code)}
                aria-pressed={uiLocale === code}
                // Visible label is abbreviated to fit the toolbar; the
                // accessible name stays the language itself.
                aria-label={code === 'ko' ? '한국어' : 'English'}
                title={code === 'ko' ? '한국어로 전환' : 'Switch to English'}
                className={[
                  'px-2 text-[length:var(--text-ui-sm)] font-medium transition',
                  uiLocale === code
                    ? 'bg-[var(--color-accent-strong)] text-[var(--color-accent-on)]'
                    : 'text-[var(--color-text-dim)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]',
                ].join(' ')}
              >
                {code === 'ko' ? '한' : 'EN'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {storageError && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-warning)]/40 bg-[var(--color-warning)]/15 px-6 py-2 text-xs text-[var(--color-warning)]">
          <span>
            {t(
              '저장 공간이 가득 차 최근 변경 사항이 저장되지 않았을 수 있습니다. 슬라이드 수나 하이라이트를 줄이거나, 내보낸 뒤 프로젝트를 초기화하세요.',
            )}
          </span>
          <button
            type="button"
            onClick={() => setStorageError(false)}
            className="shrink-0 rounded border border-[var(--color-warning)]/40 px-2 py-0.5 hover:bg-[var(--color-warning)]/20"
          >
            {t('닫기')}
          </button>
        </div>
      )}

      {/* The error banner above only ever arrives after a write was already
          lost. This one arrives while there is still room to act. */}
      {!storageError && storagePressure > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-warning)]/40 bg-[var(--color-warning)]/15 px-6 py-2 text-xs text-[var(--color-warning)]">
          <span>
            {t(
              '이 브라우저의 저장 공간을 {pct}% 사용 중입니다. 가득 차면 변경 사항이 저장되지 않습니다 — 라이브러리에서 오래된 프로젝트를 지우거나, 「프로젝트 파일 저장」으로 내보낸 뒤 정리하세요.',
              { pct: Math.round(storagePressure * 100) },
            )}
          </span>
          <button
            type="button"
            onClick={() => setStoragePressure(0)}
            className="shrink-0 rounded border border-[var(--color-warning)]/40 px-2 py-0.5 hover:bg-[var(--color-warning)]/20"
          >
            {t('닫기')}
          </button>
        </div>
      )}

      {/* Desktop document surface: native menu, window title, close guard,
          and the ⌘O switcher. Renders nothing in the web build. */}
      <DocumentShell />

      <div className="flex-1 overflow-hidden">
        {step === 1 && <ProjectSetup />}
        {step === 2 && <EditorLayout />}
        {step === 3 && <LocalizeEditor />}
        {step === 4 && <ExportPanel />}
      </div>

      {showSaveModal && (
        <Modal title={t('프로젝트 저장')} onClose={() => setShowSaveModal(false)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              {existsInLibrary
                ? t('이미 저장된 프로젝트입니다. 기존 항목을 이 이름으로 덮어쓰거나, 원본은 그대로 두고 새 프로젝트로 저장할 수 있습니다.')
                : t('현재 작업을 보관합니다.')}
            </p>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveProject()
              }}
              maxLength={60}
              className="mt-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              placeholder={t('프로젝트 이름')}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                {t('취소')}
              </button>
              {existsInLibrary && (
                <button
                  type="button"
                  onClick={() => handleSaveProject(true)}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
                >
                  {t('새 프로젝트로 저장')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSaveProject()}
                className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
              >
                {existsInLibrary ? t('덮어쓰기') : t('저장')}
              </button>
            </div>
        </Modal>
      )}

      {showTemplateModal && (
        <Modal title={t('템플릿으로 저장')} onClose={() => setShowTemplateModal(false)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              {t(
                "현재 모든 슬라이드의 디자인(레이아웃·배경·텍스트·기기 배치)을 재사용 가능한 템플릿으로 저장합니다. 스크린샷은 포함되지 않으며, 시작 화면에 카드로 추가됩니다.",
              )}
            </p>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTemplate()
              }}
              maxLength={60}
              className="mt-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              placeholder={t('템플릿 이름')}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                {t('취소')}
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
              >
                {t('저장')}
              </button>
            </div>
        </Modal>
      )}

      {/*
        Never applied silently: the mirror can be ahead because localStorage
        writes were failing, but it can also be ahead because the app was force
        quit mid-edit — only the person who did the work can tell which copy
        they want. Declining leaves the current project untouched.
      */}
      {recovery && (
        <Modal title={t('복구할 작업이 있습니다')} onClose={declineRecovery}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {recovery.reason === 'no-active'
              ? t('마지막으로 편집하던 프로젝트가 이 브라우저 저장소에 남아 있지 않습니다. 디스크 백업본에서 복구할 수 있습니다.')
              : recovery.reason === 'unsaved'
                ? t('지금 열려 있는 문서에 저장하지 않은 편집이 남아 있습니다. 복구하면 편집 상태로 열리고, ⌘S를 누르면 파일에 반영됩니다.')
                : t('디스크 백업본이 지금 열려 있는 프로젝트보다 최신입니다. 저장 공간이 가득 차 최근 변경 사항이 기록되지 못했을 때 이렇게 됩니다.')}
          </p>
          <p className="mt-3 text-sm text-[var(--color-text)]">
            <span className="font-medium">{recovery.project.name}</span>
            <span className="text-[var(--color-text-dim)]">
              {' '}· {t('{n}장', { n: recovery.project.slides.length })} · {t('마지막 수정')}{' '}
              {formatTime(recovery.project.updatedAt)}
            </span>
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={declineRecovery}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('무시하기')}
            </button>
            <button
              type="button"
              onClick={() => void acceptRecovery()}
              className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
            >
              {t('복구하기')}
            </button>
          </div>
        </Modal>
      )}

      {recoveryMissing > 0 && (
        <Modal title={t('복구 완료')} onClose={() => setRecoveryMissing(0)}>
          <p className="mt-2 text-sm text-[var(--color-warning)]">
            {t('복구했지만 이미지 {n}개는 되살리지 못했습니다. 해당 슬라이드는 스크린샷이 빈 상태입니다.', { n: recoveryMissing })}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setRecoveryMissing(0)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {saveError !== null && (
        <Modal title={t('프로젝트 파일 저장')} onClose={() => setSaveError(null)}>
          <p className="mt-2 text-sm text-[var(--color-danger)]">
            {t('저장하지 못했습니다. 프로젝트는 그대로 열려 있습니다.')}
          </p>
          <p className="mt-2 break-words text-xs text-[var(--color-text-dim)]">{saveError}</p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {saveWarning > 0 && (
        <Modal title={t('프로젝트 파일 저장')} onClose={() => setSaveWarning(0)}>
          <p className="mt-2 text-sm text-[var(--color-warning)]">
            {t('저장했지만 이미지 {n}개를 파일에 담지 못했습니다 — 이 브라우저 저장소에서 이미 사라진 이미지입니다. 다른 기기에서 열면 그 자리가 비어 보입니다.', { n: saveWarning })}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setSaveWarning(0)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {showResetConfirm && (
        <Modal title={t('프로젝트 초기화')} onClose={() => setShowResetConfirm(false)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              {t('현재 프로젝트 데이터가 모두 삭제됩니다. 되돌릴 수 없습니다.')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                {t('취소')}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger-on)] hover:brightness-110"
              >
                {t('초기화')}
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}

export default App
