import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useProjectStore } from '../../store/useProjectStore'
import { renderSlide, renderSpanGroup } from '../../lib/renderSlide'
import { EDITOR_CANVAS_WIDTH } from '../../constants/deviceSpecs'
import { ascExportCode } from '../../constants/defaults'
import type { DeviceType, Project, Slide } from '../../types/project'

function deviceOf(slide: Slide): DeviceType {
  return slide.deviceFrame.model === 'ipad-pro-13' ? 'ipad' : 'iphone'
}

type Status = 'idle' | 'running' | 'done' | 'error'

// 'default' = human-organized {locale}/{device}/NN.png.
// 'fastlane' = `deliver` layout: screenshots/{ascLocale}/{device}_NN.png, flat
// under each locale (deliver doesn't recurse and infers the device from image
// resolution), so `fastlane deliver` can upload the folder as-is.
type ExportLayout = 'default' | 'fastlane'

const FASTLANE_README = `fastlane deliver — screenshot upload

1. Drop this "screenshots" folder into your fastlane project (default path:
   fastlane/screenshots/), or point deliver at it: screenshots_path("./screenshots").
2. Authenticate with an App Store Connect API key (.p8):
   https://docs.fastlane.tools/app-store-connect-api/
3. Upload screenshots only:
   fastlane deliver --skip_binary_upload --skip_metadata --overwrite_screenshots

Folder names are App Store Connect locale codes; the device is auto-detected
from each image's resolution. Your .p8 key never leaves your machine.
`

function getUntranslatedLocales(project: Project): string[] {
  // Followers in a span group inherit text from the leader — their own text
  // fields aren't rendered, so skip them when computing "missing translations".
  const owners = project.slides.filter((s) => s.spanRole !== 'follower')
  return project.targetLocales.filter(locale =>
    owners.some(slide =>
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
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const prevUrlRef = useRef<string | null>(null)

  if (!project) return null

  const allLocales = [project.sourceLocale, ...project.targetLocales]
  // Each slide exports to exactly one device — the one its screenshot belongs
  // to (auto-detected on upload). project.devices is no longer multiplied in.
  const total = project.slides.length * allLocales.length
  const untranslated = getUntranslatedLocales(project)
  const devicesInUse = Array.from(new Set(project.slides.map(deviceOf)))

  const effectiveLocale = previewLocale || project.sourceLocale
  const previewSlide = project.slides[previewSlideIdx]
  const effectiveDevice: DeviceType = previewSlide ? deviceOf(previewSlide) : 'iphone'

  async function handleExport(layout: ExportLayout = 'default') {
    if (!project) return
    cancelledRef.current = false
    setStatus('running')
    setError(null)
    setDone(0)

    const filePath = (loc: string, dev: string, n: string) =>
      layout === 'fastlane' ? `screenshots/${loc}/${dev}_${n}.png` : `${loc}/${dev}/${n}.png`

    try {
      const zip = new JSZip()
      let count = 0

      for (const locale of allLocales) {
        let i = 0
        while (i < project.slides.length) {
          if (cancelledRef.current) {
            setStatus('idle')
            return
          }
          const slide = project.slides[i]
          const device = deviceOf(slide)
          const renderLocale = locale === project.sourceLocale ? null : locale
          const localeDir = ascExportCode(locale)

          // Span leader → render the 2× canvas once, slice into both PNGs.
          // Skip the follower in the next iteration since it's already done.
          if (slide.spanGroupId && slide.spanRole === 'leader') {
            const follower = project.slides[i + 1]
            if (follower && follower.spanGroupId === slide.spanGroupId) {
              const { leader: leftBlob, follower: rightBlob } = await renderSpanGroup(
                slide,
                device,
                renderLocale,
              )
              const lName = String(slide.index + 1).padStart(2, '0')
              const rName = String(follower.index + 1).padStart(2, '0')
              zip.file(filePath(localeDir, device, lName), leftBlob)
              zip.file(filePath(localeDir, device, rName), rightBlob)
              count += 2
              setDone(count)
              i += 2
              continue
            }
          }
          // Defensive: stray follower with no preceding leader. Skip — its
          // content was consumed by the leader pass or is genuinely orphaned.
          if (slide.spanRole === 'follower') {
            i++
            continue
          }

          const blob = await renderSlide(slide, device, renderLocale)
          const name = String(slide.index + 1).padStart(2, '0')
          zip.file(filePath(localeDir, device, name), blob)
          count++
          setDone(count)
          i++
        }
      }

      if (layout === 'fastlane') zip.file('screenshots/README.txt', FASTLANE_README)

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const suffix = layout === 'fastlane' ? '-fastlane-screenshots' : '-screenshots'
      saveAs(zipBlob, `${project.name}${suffix}.zip`)
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
      let blob: Blob
      if (slide.spanGroupId) {
        // Show the half corresponding to whichever side the user picked. The
        // leader owns the canvas; for a follower-pick we still render from the
        // leader and return the right half.
        const isLeader = slide.spanRole === 'leader'
        const leader = isLeader
          ? slide
          : project.slides.find(
              (s) => s.spanGroupId === slide.spanGroupId && s.spanRole === 'leader',
            )
        if (!leader) throw new Error('span leader not found')
        const halves = await renderSpanGroup(leader, effectiveDevice, renderLocale, EDITOR_CANVAS_WIDTH)
        blob = isLeader ? halves.leader : halves.follower
      } else {
        blob = await renderSlide(slide, effectiveDevice, renderLocale, EDITOR_CANVAS_WIDTH)
      }
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
        <h2 className="text-lg font-semibold text-[var(--color-text)]">내보내기</h2>
        <button
          onClick={() => setStep(3)}
          className="rounded px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← 로컬라이즈
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {untranslated.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-700">
            번역 미완료 로케일 {untranslated.length}개: {untranslated.join(', ')} —
            소스 텍스트로 내보내집니다.
          </div>
        )}

        {/* Preview section */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">미리보기</h3>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">슬라이드</label>
              <select
                value={previewSlideIdx}
                onChange={(e) => setPreviewSlideIdx(Number(e.target.value))}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)]"
              >
                {project.slides.map((s, i) => (
                  <option key={s.id} value={i}>
                    {i + 1}번 ({deviceOf(s) === 'iphone' ? 'iPhone' : 'iPad'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">로케일</label>
              <select
                value={effectiveLocale}
                onChange={(e) => setPreviewLocale(e.target.value)}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)]"
              >
                {allLocales.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handlePreviewRender}
            disabled={previewLoading}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
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
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">렌더링 범위</h3>
          <div className="space-y-1.5 text-sm text-[var(--color-text-dim)]">
            <div className="flex justify-between">
              <span>슬라이드</span>
              <span className="text-[var(--color-text)]">{project.slides.length}장</span>
            </div>
            <div className="flex justify-between">
              <span>디바이스</span>
              <span className="text-[var(--color-text)]">
                {devicesInUse.length > 0
                  ? devicesInUse.map((d) => (d === 'iphone' ? 'iPhone' : 'iPad')).join(', ')
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>로케일</span>
              <span className="text-[var(--color-text)]">{allLocales.join(', ')}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5">
              <span>총 PNG</span>
              <span className="font-semibold text-[var(--color-text)]">{total}개</span>
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full bg-[var(--color-accent)] transition-all duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => handleExport('fastlane')}
            disabled={status === 'running'}
            title="screenshots/<locale>/<device>_NN.png — fastlane deliver로 바로 업로드"
            className="rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            fastlane용 ZIP
          </button>
          <button
            onClick={() => handleExport('default')}
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
              className="rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
