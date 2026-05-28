import { useEffect, useState } from 'react'
import { StepIndicator } from './components/common/StepIndicator'
import { ProjectSetup } from './components/setup/ProjectSetup'
import { EditorLayout } from './components/editor/EditorLayout'
import { LocalizeEditor } from './components/localize/LocalizeEditor'
import { ExportPanel } from './components/export/ExportPanel'
import { useProjectStore } from './store/useProjectStore'

function App() {
  const step = useProjectStore((s) => s.step)
  const setStep = useProjectStore((s) => s.setStep)
  const project = useProjectStore((s) => s.project)
  const resetProject = useProjectStore((s) => s.resetProject)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    if (!project && step !== 1) setStep(1)
  }, [project, step, setStep])

  function handleReset() {
    resetProject()
    setShowResetConfirm(false)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight text-white">
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
        />
        <div className="flex items-center gap-3">
          {project && (
            <span className="text-xs text-[var(--color-text-dim)]">
              {project.name} · {project.slides.length}장
            </span>
          )}
          {project && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)] hover:text-white"
            >
              초기화
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {step === 1 && <ProjectSetup />}
        {step === 2 && <EditorLayout />}
        {step === 3 && <LocalizeEditor />}
        {step === 4 && <ExportPanel />}
      </div>

      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">프로젝트 초기화</h3>
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
          </div>
        </div>
      )}
    </div>
  )
}

export default App
