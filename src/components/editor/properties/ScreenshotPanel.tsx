import { useEffect, useRef, useState } from 'react'
import type { DeviceFrame, ScreenshotImage, ScreenshotStyle, TemplateType } from '../../../types/project'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'
import { detectDeviceFromAspect } from '../../../constants/deviceSpecs'

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
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
    // Lock the slide's device to the screenshot's aspect — an iPhone screenshot
    // belongs in an iPhone frame, an iPad shot in an iPad frame. Avoids the
    // cover-mode center-crop that used to silently chop off content.
    const detected = detectDeviceFromAspect(width, height)
    if (detected !== deviceFrame.model) {
      onDeviceFrameChange({ ...deviceFrame, model: detected })
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
            {detectDeviceFromAspect(value.originalWidth, value.originalHeight) === 'iphone-16-pro'
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
