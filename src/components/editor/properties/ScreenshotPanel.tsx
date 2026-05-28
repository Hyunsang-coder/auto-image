import { useEffect, useRef, useState } from 'react'
import type { ScreenshotImage } from '../../../types/project'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'

interface Props {
  value: ScreenshotImage | null
  onChange: (screenshot: ScreenshotImage | null) => void
}

export function ScreenshotPanel({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setThumbUrl(null)
      return
    }
    let objectUrl: string | null = null
    loadImageObjectUrl(value.imageKey).then(url => {
      if (url) {
        objectUrl = url
        setThumbUrl(url)
      }
    })
    return () => {
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
            {value.originalWidth} × {value.originalHeight}px
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
    </div>
  )
}
