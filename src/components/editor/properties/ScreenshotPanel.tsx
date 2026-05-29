import { useEffect, useRef, useState } from 'react'
import type { DeviceFrame, ScreenshotImage, ScreenshotStyle } from '../../../types/project'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'
import { detectDeviceFromAspect } from '../../../constants/deviceSpecs'

interface Props {
  value: ScreenshotImage | null
  onChange: (screenshot: ScreenshotImage | null) => void
  deviceFrame: DeviceFrame
  onDeviceFrameChange: (next: DeviceFrame) => void
  screenshotStyle: ScreenshotStyle
  onScreenshotStyleChange: (next: ScreenshotStyle) => void
}

export function ScreenshotPanel({
  value,
  onChange,
  deviceFrame,
  onDeviceFrameChange,
  screenshotStyle,
  onScreenshotStyleChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

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
    const { key, width, height } = await fileToImageKey(file)
    onChange({
      id: key,
      imageKey: key,
      originalWidth: width,
      originalHeight: height,
    })
    // Lock the slide's device to the screenshot's aspect — an iPhone screenshot
    // belongs in an iPhone frame, an iPad shot in an iPad frame. Avoids the
    // cover-mode center-crop that used to silently chop off content.
    const detected = detectDeviceFromAspect(width, height)
    if (detected !== deviceFrame.model) {
      onDeviceFrameChange({ ...deviceFrame, model: detected })
    }
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
              className="text-xs text-[var(--color-text-dim)] hover:text-white"
            >
              교체
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-8 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-white"
        >
          클릭하여 이미지 업로드
        </button>
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
        <label className="flex cursor-pointer items-center justify-between text-xs text-white">
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
            <label className="flex cursor-pointer items-center justify-between text-xs text-white">
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
