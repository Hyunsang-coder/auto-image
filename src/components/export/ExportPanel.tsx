import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useProjectStore } from '../../store/useProjectStore'
import { renderSlide } from '../../lib/renderSlide'
import { EDITOR_CANVAS_WIDTH } from '../../constants/deviceSpecs'
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

  const [previewSlideIdx, setPreviewSlideIdx] = useState(0)
  const [previewLocale, setPreviewLocale] = useState<string>('')
  const [previewDevice, setPreviewDevice] = useState<DeviceType>('iphone')
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const prevUrlRef = useRef<string | null>(null)

  if (!project) return null

  const allLocales = [project.sourceLocale, ...project.targetLocales]
  const total = project.slides.length * project.devices.length * allLocales.length
  const untranslated = getUntranslatedLocales(project)

  // initialise preview defaults lazily once we have project data
  const effectiveLocale = previewLocale || project.sourceLocale
  const effectiveDevice: DeviceType =
    project.devices.includes(previewDevice) ? previewDevice : (project.devices[0] as DeviceType)

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

  async function handlePreviewRender() {
    if (!project) return
    const slide = project.slides[previewSlideIdx]
    if (!slide) return

    setPreviewLoading(true)
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = null
    }
    setPreviewSrc(null)

    try {
      const renderLocale = effectiveLocale === project.sourceLocale ? null : effectiveLocale
      const blob = await renderSlide(slide, effectiveDevice, renderLocale, EDITOR_CANVAS_WIDTH)
      const url = URL.createObjectURL(blob)
      prevUrlRef.current = url
      setPreviewSrc(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewLoading(false)
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

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {untranslated.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300">
            번역 미완료 로케일 {untranslated.length}개: {untranslated.join(', ')} —
            소스 텍스트로 내보내집니다.
          </div>
        )}

        {/* Preview section */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">미리보기</h3>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">슬라이드</label>
              <select
                value={previewSlideIdx}
                onChange={(e) => setPreviewSlideIdx(Number(e.target.value))}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-white"
              >
                {project.slides.map((s, i) => (
                  <option key={s.id} value={i}>{i + 1}번</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">로케일</label>
              <select
                value={effectiveLocale}
                onChange={(e) => setPreviewLocale(e.target.value)}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-white"
              >
                {allLocales.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">디바이스</label>
              <select
                value={effectiveDevice}
                onChange={(e) => setPreviewDevice(e.target.value as DeviceType)}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-white"
              >
                {(project.devices as DeviceType[]).map((d) => (
                  <option key={d} value={d}>{d === 'iphone' ? 'iPhone' : 'iPad'}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handlePreviewRender}
            disabled={previewLoading}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-dim)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewLoading ? '렌더링 중…' : '미리보기 렌더'}
          </button>
          {previewLoading && (
            <div className="mt-3 flex justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            </div>
          )}
          {previewSrc && !previewLoading && (
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-border)]">
              <img
                src={previewSrc}
                alt="미리보기"
                className="w-full object-contain"
                style={{ maxHeight: '320px' }}
              />
            </div>
          )}
        </div>

        {/* Export summary */}
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
  )
}
