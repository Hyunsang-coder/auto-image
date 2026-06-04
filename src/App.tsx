import { useEffect, useRef, useState } from 'react'
import { StepIndicator } from './components/common/StepIndicator'
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
import { pruneOrphanImages } from './lib/imageStore'
import { allReferencedImageKeys } from './lib/imageRefs'
import { STORAGE_ERROR_EVENT } from './lib/safeStorage'
import { getUntranslatedLocales, getSlidesMissingScreenshot } from './lib/readiness'

function App() {
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

  // Sweep image blobs left orphaned by interrupted sessions, once on startup.
  // Skip when there's no project so we never wipe blobs before hydration.
  useEffect(() => {
    if (prunedRef.current) return
    const current = useProjectStore.getState().project
    if (!current) return
    prunedRef.current = true
    pruneOrphanImages(allReferencedImageKeys())
  }, [project])

  useEffect(() => {
    const onError = () => setStorageError(true)
    window.addEventListener(STORAGE_ERROR_EVENT, onError)
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onError)
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
    const name = saveName.trim() || project?.name || '제목 없음'
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

  function openTemplateModal() {
    setTemplateName(project ? `${project.name} 템플릿` : '')
    setShowTemplateModal(true)
  }

  function handleSaveTemplate() {
    const current = useProjectStore.getState().project
    if (!current) return
    const label = templateName.trim() || `${current.name} 템플릿`
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
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight text-[var(--color-text)]">
            auto-image
          </span>
          <span className="text-xs text-[var(--color-text-dim)]">
            App Store Screenshot Studio
          </span>
        </div>
        <StepIndicator
          current={step}
          hasProject={!!project}
          onJump={(s) => setStep(s)}
          editorIncomplete={editorIncomplete}
          localizeIncomplete={localizeIncomplete}
          editorHint={
            editorIncomplete
              ? `스크린샷 없는 슬라이드 ${slidesMissingScreenshot.length}개`
              : undefined
          }
          localizeHint={
            localizeIncomplete
              ? `번역 미완료 로케일 ${untranslatedLocales.length}개`
              : undefined
          }
        />
        <div className="flex items-center gap-3">
          {project && step !== 1 && (
            <span className="text-xs text-[var(--color-text-dim)]">
              {project.name} · {project.slides.length}장
            </span>
          )}
          {project && step !== 1 && (
            <button
              type="button"
              onClick={openSaveModal}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {justSaved ? '저장됨 ✓' : '저장'}
            </button>
          )}
          {project && step !== 1 && (
            <button
              type="button"
              onClick={openTemplateModal}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {justSavedTemplate ? '템플릿 저장됨 ✓' : '템플릿으로 저장'}
            </button>
          )}
          {project && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              초기화
            </button>
          )}
        </div>
      </header>

      {storageError && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/15 px-6 py-2 text-xs text-amber-700">
          <span>
            저장 공간이 가득 차 최근 변경 사항이 저장되지 않았을 수 있습니다.
            슬라이드 수나 하이라이트를 줄이거나, 내보낸 뒤 프로젝트를 초기화하세요.
          </span>
          <button
            type="button"
            onClick={() => setStorageError(false)}
            className="shrink-0 rounded border border-amber-500/40 px-2 py-0.5 hover:bg-amber-500/20"
          >
            닫기
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
        <Modal title="프로젝트 저장" onClose={() => setShowSaveModal(false)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              {existsInLibrary
                ? '이미 저장된 프로젝트입니다. 기존 항목을 이 이름으로 덮어쓰거나, 원본은 그대로 두고 새 프로젝트로 저장할 수 있습니다.'
                : '현재 작업을 보관합니다.'}
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
              placeholder="프로젝트 이름"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                취소
              </button>
              {existsInLibrary && (
                <button
                  type="button"
                  onClick={() => handleSaveProject(true)}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
                >
                  새 프로젝트로 저장
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSaveProject()}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
              >
                {existsInLibrary ? '덮어쓰기' : '저장'}
              </button>
            </div>
        </Modal>
      )}

      {showTemplateModal && (
        <Modal title="템플릿으로 저장" onClose={() => setShowTemplateModal(false)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              현재 모든 슬라이드의 디자인(레이아웃·배경·텍스트·기기 배치)을 재사용 가능한
              템플릿으로 저장합니다. 스크린샷은 포함되지 않으며, '프로젝트 설정'의 '템플릿으로 시작'에 추가됩니다.
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
              placeholder="템플릿 이름"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
              >
                저장
              </button>
            </div>
        </Modal>
      )}

      {showResetConfirm && (
        <Modal title="프로젝트 초기화" onClose={() => setShowResetConfirm(false)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              현재 프로젝트 데이터가 모두 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                초기화
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}

export default App
