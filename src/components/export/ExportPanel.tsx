import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useProjectStore } from '../../store/useProjectStore'
import { renderSlide } from '../../lib/renderSlide'
import type { DeviceType, Project } from '../../types/project'

type Status = 'idle' | 'running' | 'done' | 'error'

function getUntranslatedLocales(project: Project): string[] {
  return project.targetLocales.filter(locale =>
    project.slides.some(slide =>
      (slide.headline.text && !slide.headline.translations[locale]) ||
      (slide.subheadline.text && !slide.subheadline.translations[locale])
    )
  )
}

export function ExportPanel() {
  const project = useProjectStore((s) => s.project)
  const setStep = useProjectStore((s) => s.setStep)

  const [status, setStatus] = useState<Status>('idle')
  const [done, setDone] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  if (!project) return null

  const allLocales = [project.sourceLocale, ...project.targetLocales]
  const total = project.slides.length * project.devices.length * allLocales.length
  const untranslated = getUntranslatedLocales(project)

  async function handleExport() {
    if (!project) return
    cancelledRef.current = false
    setStatus('running')
    setError(null)
    setDone(0)

    try {
      const zip = new JSZip()
      let count = 0

      for (const locale of allLocales) {
        for (const device of project.devices as DeviceType[]) {
          for (const slide of project.slides) {
            if (cancelledRef.current) {
              setStatus('idle')
              return
            }
            const renderLocale = locale === project.sourceLocale ? null : locale
            const blob = await renderSlide(slide, device, renderLocale)
            const name = String(slide.index + 1).padStart(2, '0')
            zip.file(`${locale}/${device}/${name}.png`, blob)
            count++
            setDone(count)
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      saveAs(zipBlob, `${project.name}-screenshots.zip`)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  function handleCancel() {
    cancelledRef.current = true
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
        <h2 className="text-lg font-semibold text-white">내보내기</h2>
        <button
          onClick={() => setStep(3)}
          className="rounded px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-white"
        >
          ← 로컬라이즈
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-6 px-6">
          {untranslated.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300">
              번역 미완료 로케일 {untranslated.length}개: {untranslated.join(', ')} —
              소스 텍스트로 내보내집니다.
            </div>
          )}

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">렌더링 범위</h3>
            <div className="space-y-1.5 text-sm text-[var(--color-text-dim)]">
              <div className="flex justify-between">
                <span>슬라이드</span>
                <span className="text-white">{project.slides.length}장</span>
              </div>
              <div className="flex justify-between">
                <span>디바이스</span>
                <span className="text-white">
                  {project.devices.map((d) => (d === 'iphone' ? 'iPhone' : 'iPad')).join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>로케일</span>
                <span className="text-white">{allLocales.join(', ')}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5">
                <span>총 PNG</span>
                <span className="font-semibold text-white">{total}개</span>
              </div>
            </div>
          </div>

          {(status === 'running' || status === 'done') && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-[var(--color-text-dim)]">
                <span>
                  {status === 'done' ? '렌더링 완료' : `${done} / ${total} 렌더링 중…`}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={status === 'running'}
              className="flex-1 rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'running'
                ? `렌더링 중… (${done}/${total})`
                : status === 'done'
                ? 'ZIP 다시 다운로드'
                : `ZIP 내보내기 · ${total}개 PNG`}
            </button>
            {status === 'running' && (
              <button
                onClick={handleCancel}
                className="rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-dim)] hover:text-white"
              >
                취소
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
