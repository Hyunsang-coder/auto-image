import { useEffect, useRef, useState } from 'react'
import type { DeviceFrame, ScreenshotImage, ScreenshotStyle, TemplateType } from '../../../types/project'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'
import { detectTypeFromAspect, DEFAULT_MODEL, typeOfModel } from '../../../constants/deviceSpecs'
import { useProjectStore } from '../../../store/useProjectStore'
import { gcImages } from '../../../lib/imageRefs'
import { importBulkImages } from '../../../lib/bulkImageImport'
import { SUPPORTED_LOCALES } from '../../../constants/defaults'

interface Props {
  value: ScreenshotImage | null
  onChange: (screenshot: ScreenshotImage | null) => void
  deviceFrame: DeviceFrame
  onDeviceFrameChange: (next: DeviceFrame) => void
  screenshotStyle: ScreenshotStyle
  onScreenshotStyleChange: (next: ScreenshotStyle) => void
  template: TemplateType
}

export function ScreenshotPanel({
  value,
  onChange,
  deviceFrame,
  onDeviceFrameChange,
  screenshotStyle,
  onScreenshotStyleChange,
  template,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [bulkMsg, setBulkMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [bulkIssues, setBulkIssues] = useState<string[]>([])

  const sourceLocale = useProjectStore(s => s.project?.sourceLocale ?? 'en')
  const deviceModels = useProjectStore(s => s.project?.deviceModels)
  const targetLocales = useProjectStore(s => s.project?.targetLocales ?? [])
  const updateSlides = useProjectStore(s => s.updateSlides)
  const updateProject = useProjectStore(s => s.updateProject)

  // Same bulk screenshot import the Localize page runs — exposed here so editor
  // users can add MANY screenshots without hopping to step 3. Routes base vs
  // per-locale override by the project's sourceLocale and lands every slide.
  async function handleBulkImages(files: File[]) {
    const known = new Set<string>(SUPPORTED_LOCALES.map(l => l.code))
    const labelOf = (code: string) => SUPPORTED_LOCALES.find(l => l.code === code)?.label ?? code
    const slides = useProjectStore.getState().project?.slides ?? []
    const { patches, addedLocales, applied, issues } = await importBulkImages(files, {
      slides,
      sourceLocale,
      targetLocales,
      knownLocales: known,
      labelOf,
      deviceModels,
    })
    if (Object.keys(patches).length) updateSlides(patches)
    if (addedLocales.length) updateProject({ targetLocales: [...targetLocales, ...addedLocales] })
    gcImages()
    setBulkIssues(issues)
    if (applied === 0 && issues.length === 0) {
      setBulkMsg({ kind: 'err', text: '가져올 이미지가 없습니다' })
    } else if (issues.length) {
      setBulkMsg({ kind: 'err', text: `${applied}개 적용 · 경고 ${issues.length}건 (아래 목록 확인)` })
    } else {
      setBulkMsg({ kind: 'ok', text: `${applied}개 이미지를 가져왔습니다` })
    }
  }

  useEffect(() => {
    let objectUrl: string | null = null
    if (value) {
      loadImageObjectUrl(value.imageKey).then(url => {
        if (url) {
          objectUrl = url
          setThumbUrl(url)
        }
      })
    }
    return () => {
      setThumbUrl(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [value?.imageKey])

  async function handleFile(file: File) {
    setUploadError(null)
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      setUploadError('이미지를 읽을 수 없습니다. 다른 파일(PNG/JPG)을 올려주세요.')
      return
    }
    const { key, width, height } = result
    onChange({
      id: key,
      imageKey: key,
      originalWidth: width,
      originalHeight: height,
      // Replacing the base keeps any per-locale overrides — they're independent
      // localized screenshots, not derived from this image.
      ...(value?.localeOverrides && { localeOverrides: value.localeOverrides }),
    })
    const detectedType = detectTypeFromAspect(width, height)
    const canvasType = typeOfModel(deviceFrame.model)
    const frameModel = deviceModels?.[detectedType] ?? DEFAULT_MODEL[detectedType]
    if (detectedType === canvasType) {
      if (frameModel !== deviceFrame.model) {
        // Same type, different size: update model and clear any stale cross-type override.
        onDeviceFrameChange({ ...deviceFrame, model: frameModel, frameModel: undefined })
      } else if (deviceFrame.frameModel !== undefined) {
        // Same type, same size: clear a stale cross-type visual override if present.
        onDeviceFrameChange({ ...deviceFrame, frameModel: undefined })
      }
    } else {
      // Cross-type: keep canvas dimensions (model), override only the visual frame.
      onDeviceFrameChange({ ...deviceFrame, frameModel })
    }
  }

  // Hero is a text-only template with no device/screenshot slot — a shot here
  // would render full-bleed behind the text. Block the upload and point the
  // user at a template that actually has a screenshot.
  if (template === 'hero') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          스크린샷
        </p>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700">
          Hero 레이아웃은 텍스트만 표시합니다. 스크린샷을 넣으려면 「레이아웃」 탭에서
          Hero Bleed · Text Top · Text Bottom · Split 중 하나를 먼저 선택하세요.
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-red-600 hover:text-red-700"
          >
            남아있는 스크린샷 삭제
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
        스크린샷
      </p>

      {value ? (
        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt="screenshot preview"
              className="w-full rounded object-contain max-h-40"
            />
          )}
          <p className="text-xs text-[var(--color-text-dim)]">
            {value.originalWidth} × {value.originalHeight}px ·{' '}
            {detectTypeFromAspect(value.originalWidth, value.originalHeight) === 'iphone'
              ? 'iPhone'
              : 'iPad'}{' '}
            스크린샷
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              교체
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-red-600 hover:text-red-700"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-8 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          클릭하여 이미지 업로드
        </button>
      )}

      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      {/* Bulk import — add many screenshots across slides at once. Routes base
          vs per-locale override by the project's sourceLocale (same as Localize). */}
      <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
        <button
          type="button"
          onClick={() => bulkInputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-2 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          여러 장 일괄 업로드
        </button>
        <p className="text-[11px] leading-snug text-[var(--color-text-dim)]">
          파일명 {'{번호}[-설명].{언어}.png'} · 기준 언어({sourceLocale})가 베이스 · 예: 01-home.{sourceLocale}.png, 01-home.{targetLocales[0] ?? 'en'}.png
        </p>
        <input
          ref={bulkInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) handleBulkImages(files)
            e.target.value = ''
          }}
        />
        {bulkMsg && (
          <p className={`text-xs ${bulkMsg.kind === 'ok' ? 'text-[var(--color-accent)]' : 'text-red-600'}`}>
            {bulkMsg.text}
          </p>
        )}
        {bulkIssues.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-red-600">경고 {bulkIssues.length}건 보기</summary>
            <ul className="mt-1 max-h-40 list-disc overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-5 pr-2 text-[11px] leading-snug text-[var(--color-text-dim)]">
              {bulkIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          렌더링 모드
        </p>
        <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
          <span>기기 프레임 표시</span>
          <input
            type="checkbox"
            checked={deviceFrame.show}
            onChange={(e) => onDeviceFrameChange({ ...deviceFrame, show: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
        </label>

        <div>
          <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
            <span>기기 회전</span>
            <span>{Math.round(deviceFrame.rotation ?? 0)}°</span>
          </label>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={deviceFrame.rotation ?? 0}
            onChange={(e) =>
              onDeviceFrameChange({ ...deviceFrame, rotation: Number(e.target.value) })
            }
            className="w-full accent-[var(--color-accent)]"
          />
        </div>

        {!deviceFrame.show && (
          <>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
                <span>모서리 둥글기</span>
                <span>{Math.round(screenshotStyle.cornerRadiusRatio * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={0.2}
                step={0.005}
                value={screenshotStyle.cornerRadiusRatio}
                onChange={(e) =>
                  onScreenshotStyleChange({
                    ...screenshotStyle,
                    cornerRadiusRatio: Number(e.target.value),
                  })
                }
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
            <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
              <span>그림자</span>
              <input
                type="checkbox"
                checked={screenshotStyle.shadow}
                onChange={(e) =>
                  onScreenshotStyleChange({ ...screenshotStyle, shadow: e.target.checked })
                }
                className="accent-[var(--color-accent)]"
              />
            </label>
          </>
        )}
      </div>
    </div>
  )
}
