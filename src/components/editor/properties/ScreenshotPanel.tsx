import { useRef } from 'react'
import type { ScreenshotImage } from '../../../types/project'
import { fileToImageKey } from '../../../lib/imageStore'

interface Props {
  value: ScreenshotImage | null
  onChange: (screenshot: ScreenshotImage | null) => void
}

export function ScreenshotPanel({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

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
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="text-xs text-white">
            {value.originalWidth} × {value.originalHeight}px
          </p>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-2 text-xs text-red-400 hover:text-red-300"
          >
            삭제
          </button>
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
