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
import { STORAGE_ERROR_EVENT } from './lib/safeStorage'
import { startAgentBridge } from './lib/agentBridge'
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
  const prunedRef = useRef(false)

  useEffect(() => {
    if (!project && step !== 1) setStep(1)
  }, [project, step, setStep])

  useEffect(() => {
    document.title = project ? `${project.name} — ${APP_NAME}` : APP_NAME
  }, [project])

  // Sweep image blobs left orphaned by interrupted sessions, once on startup.
  // Skip when there's no project so we never wipe blobs before hydration.
  useEffect(() => {
    if (prunedRef.current) return
    const current = useProjectStore.getState().project
    if (!current) return
    prunedRef.current = true
    pruneOrphanImages(allReferencedImageKeys())
  }, [project])

  // Desktop shell only: lets an MCP agent drive this window. No-op on the web.
  useEffect(() => {
    startAgentBridge()
  }, [])

  useEffect(() => {
    const onError = () => setStorageError(true)
    window.addEventListener(STORAGE_ERROR_EVENT, onError)
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onError)
  }, [])

  // Headless bundle hook: the CLI `--bundle` flag drives this to download an
  // editable project .zip without rendering. Inert in the app (flag never set).
  useEffect(() => {
    const w = window as BundleWindow
    if (!w.__bundleExportEnabled) return
    w.__downloadProjectBundle = async () => {
      const p = useProjectStore.getState().project
      if (!p) return
      saveAs(await exportProjectBundle(p), `${p.name || 'project'}.studio.zip`)
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
    saveAs(await exportProjectBundle(current), `${current.name || t('제목 없음')}.studio.zip`)
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
          {/* The window title is the document, not the app name (HIG). */}
          <span className="truncate text-[length:var(--text-ui)] font-medium text-[var(--color-text)]">
            {project ? project.name : APP_NAME}
          </span>
          {project && (
            <span className="shrink-0 text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]">
              {t('{n}장', { n: project.slides.length })}
            </span>
          )}
        </div>

        <StepIndicator
          current={step}
          hasProject={!!project}
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
          {project && step !== 1 && (
            <span
              role="status"
              title={t('모든 변경 사항은 자동으로 저장됩니다')}
              className="text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)]"
            >
              {justSaved ? t('라이브러리에 저장됨 ✓') : t('저장됨')}
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
                ...(step !== 1
                  ? [
                      {
                        label: t('라이브러리에 저장'),
                        hint: t('이 브라우저 안에 보관 — 파일은 만들지 않습니다'),
                        onSelect: openSaveModal,
                      },
                      {
                        label: t('템플릿으로 저장'),
                        hint: t('스크린샷을 뺀 디자인만 — 새 프로젝트의 출발점'),
                        onSelect: openTemplateModal,
                      },
                      {
                        label: t('프로젝트 파일 저장'),
                        hint: t('.zip 파일로 내보내기 — 「프로젝트 열기」로 그대로 이어서 편집'),
                        onSelect: handleExportBundle,
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
                "현재 모든 슬라이드의 디자인(레이아웃·배경·텍스트·기기 배치)을 재사용 가능한 템플릿으로 저장합니다. 스크린샷은 포함되지 않으며, '프로젝트 설정'의 '템플릿으로 시작'에 추가됩니다.",
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
