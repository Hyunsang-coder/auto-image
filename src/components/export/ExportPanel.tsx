import { useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useProjectStore } from '../../store/useProjectStore'
import { renderSlide } from '../../lib/renderSlide'
import type { DeviceType } from '../../types/project'

type Status = 'idle' | 'running' | 'done' | 'error'

export function ExportPanel() {
  const project = useProjectStore((s) => s.project)
  const setStep = useProjectStore((s) => s.setStep)

  const [status, setStatus] = useState<Status>('idle')
  const [done, setDone] = useState(0)
  const [error, setError] = useState<string | null>(null)

  if (!project) return null

  const allLocales = [project.sourceLocale, ...project.targetLocales]
  const total = project.slides.length * project.devices.length * allLocales.length

  async function handleExport() {
    if (!project) return
    setStatus('running')
    setError(null)
    setDone(0)

    try {
      const zip = new JSZip()
      let count = 0

      for (const locale of allLocales) {
        for (const device of project.devices as DeviceType[]) {
          for (const slide of project.slides) {
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

          <button
            onClick={handleExport}
            disabled={status === 'running'}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'running'
              ? `렌더링 중… (${done}/${total})`
              : status === 'done'
              ? 'ZIP 다시 다운로드'
              : `ZIP 내보내기 · ${total}개 PNG`}
          </button>
        </div>
      </div>
    </div>
  )
}
