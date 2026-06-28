import { useEffect, useRef, useState } from 'react'
import type { ExternalImage } from '../../../types/project'
import { newId } from '../../../constants/defaults'
import { normalizeAngle } from '../../../canvas/geometry'
import { EMPTY_CROP } from '../../../canvas/templateLayouts'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'
import { useT } from '../../../i18n'

const MAX_EXTERNAL_IMAGES = 3
const CROP_EDGES = [
  ['top', '위'],
  ['bottom', '아래'],
  ['left', '왼쪽'],
  ['right', '오른쪽'],
] as const

interface Props {
  value: ExternalImage[]
  onChange: (next: ExternalImage[]) => void
}

export function ExternalImagePanel({ value, onChange }: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const images = value ?? []
  const canAdd = images.length < MAX_EXTERNAL_IMAGES

  async function handleFile(file: File) {
    setError(null)
    if (!canAdd) return
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      setError(t('이미지를 읽을 수 없습니다. 다른 파일(PNG/JPG)을 올려주세요.'))
      return
    }
    const offset = images.length * 0.04
    onChange([
      ...images,
      {
        id: newId('ext'),
        imageKey: result.key,
        originalWidth: result.width,
        originalHeight: result.height,
        x: Math.min(0.62, 0.5 + offset),
        y: Math.min(0.62, 0.5 + offset),
        width: 0.32,
        rotation: 0,
        opacity: 1,
        cornerRadiusRatio: 0.06,
        shadow: true,
      },
    ])
  }

  function update(id: string, patch: Partial<ExternalImage>) {
    onChange(images.map((img) => (img.id === id ? { ...img, ...patch } : img)))
  }

  function remove(id: string) {
    onChange(images.filter((img) => img.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {t('외부 이미지')}
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canAdd}
          className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-3 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canAdd ? t('이미지 추가') : t('최대 {n}개까지 추가할 수 있습니다', { n: MAX_EXTERNAL_IMAGES })}
        </button>
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
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {images.length > 0 && (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            {t('추가된 이미지 ({n}/{max})', { n: images.length, max: MAX_EXTERNAL_IMAGES })}
          </label>
          {images.map((image, index) => {
            const crop = image.crop ?? EMPTY_CROP
            const cornerRadiusRatio = image.cornerRadiusRatio ?? 0.06
            const shadow = image.shadow ?? true
            return (
            <div
              key={image.id}
              className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
            >
              <div className="flex items-start gap-3">
                <ExternalImageThumb imageKey={image.imageKey} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--color-text)]">
                      {t('이미지 {n}', { n: index + 1 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(image.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      {t('삭제')}
                    </button>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-[var(--color-text-dim)]">
                    {image.originalWidth} x {image.originalHeight}px
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberSlider
                  label="X"
                  value={image.x}
                  min={-0.5}
                  max={1.5}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(image.id, { x: v })}
                />
                <NumberSlider
                  label="Y"
                  value={image.y}
                  min={-0.5}
                  max={1.5}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(image.id, { y: v })}
                />
                <NumberSlider
                  label={t('크기')}
                  value={image.width}
                  min={0.05}
                  max={1.5}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(image.id, { width: v })}
                />
                <NumberSlider
                  label={t('회전')}
                  value={image.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  fmt={(v) => `${Math.round(v)}°`}
                  onChange={(v) => update(image.id, { rotation: normalizeAngle(v) })}
                />
              </div>

              <NumberSlider
                label={t('투명도')}
                value={image.opacity}
                min={0}
                max={1}
                step={0.05}
                fmt={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => update(image.id, { opacity: v })}
              />

              <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                  {t('렌더링 모드')}
                </p>
                <NumberSlider
                  label={t('모서리 둥글기')}
                  value={cornerRadiusRatio}
                  min={0}
                  max={0.2}
                  step={0.005}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(image.id, { cornerRadiusRatio: v })}
                />
                <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
                  <span>{t('그림자')}</span>
                  <input
                    type="checkbox"
                    checked={shadow}
                    onChange={(e) => update(image.id, { shadow: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                </label>
                <div className="space-y-2">
                  <p className="text-xs text-[var(--color-text-dim)]">{t('가장자리 잘라내기')}</p>
                  {CROP_EDGES.map(([edge, label]) => (
                    <NumberSlider
                      key={edge}
                      label={t(label)}
                      value={crop[edge]}
                      min={0}
                      max={0.45}
                      step={0.01}
                      fmt={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => update(image.id, { crop: { ...crop, [edge]: v } })}
                    />
                  ))}
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ExternalImageThumb({ imageKey }: { imageKey: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    loadImageObjectUrl(imageKey).then((next) => {
      if (!next) return
      objectUrl = next
      setUrl(next)
    })
    return () => {
      setUrl(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageKey])

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
    </div>
  )
}

interface NumberSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  fmt: (v: number) => string
  onChange: (v: number) => void
}

function NumberSlider({ label, value, min, max, step, fmt, onChange }: NumberSliderProps) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
        <span>{label}</span>
        <span>{fmt(value)}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  )
}
