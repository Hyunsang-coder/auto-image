import { useEffect, useRef, useState } from 'react'
import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Background } from '../../../types/project'
import { THEME_PRESETS, type ThemePreset } from '../../../constants/defaults'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'

interface Props {
  value: Background
  onChange: (bg: Background) => void
  onApplyPreset?: (preset: ThemePreset) => void
}

type Tab = 'solid' | 'gradient' | 'image'

const FIT_OPTIONS: { id: NonNullable<Background['imageObjectFit']>; label: string }[] = [
  { id: 'cover', label: '채우기' },
  { id: 'contain', label: '맞춤' },
  { id: 'fill', label: '늘이기' },
]

export function BackgroundPanel({ value, onChange, onApplyPreset }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(
    value.type === 'gradient' ? 'gradient' : value.type === 'image' ? 'image' : 'solid',
  )
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value.type !== 'image' || !value.imageKey) return
    let objectUrl: string | null = null
    loadImageObjectUrl(value.imageKey).then((url) => {
      if (url) {
        objectUrl = url
        setThumbUrl(url)
      }
    })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [value.type, value.imageKey])

  function gradientCss(g: NonNullable<Background['gradient']>): React.CSSProperties {
    const stops = [...g.stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
      .join(', ')
    return {
      background:
        g.kind === 'radial'
          ? `radial-gradient(circle, ${stops})`
          : `linear-gradient(${g.direction}deg, ${stops})`,
    }
  }

  function previewStyle(preset: ThemePreset): React.CSSProperties {
    const bg = preset.background
    if (bg.type === 'gradient' && bg.gradient) return gradientCss(bg.gradient)
    return { background: bg.color ?? '#888' }
  }

  const g = value.gradient
  function updateGradient(patch: Partial<NonNullable<Background['gradient']>>) {
    if (!g) return
    onChange({ type: 'gradient', gradient: { ...g, ...patch } })
  }
  function updateStop(i: number, patch: Partial<{ color: string; position: number }>) {
    if (!g) return
    updateGradient({ stops: g.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }
  function addStop() {
    if (!g) return
    const sorted = [...g.stops].sort((a, b) => a.position - b.position)
    let newPos = 0.5
    let newColor = sorted[0]?.color ?? '#6366F1'
    let maxGap = -1
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].position - sorted[i].position
      if (gap > maxGap) {
        maxGap = gap
        newPos = (sorted[i].position + sorted[i + 1].position) / 2
        newColor = sorted[i].color
      }
    }
    updateGradient({ stops: [...g.stops, { color: newColor, position: newPos }] })
  }
  function removeStop(i: number) {
    if (!g || g.stops.length <= 2) return
    updateGradient({ stops: g.stops.filter((_, idx) => idx !== i) })
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'solid') {
      const color = value.color ?? value.gradient?.stops[0]?.color ?? '#6366F1'
      onChange({ type: 'solid', color })
    } else if (tab === 'gradient') {
      const color1 = value.color ?? value.gradient?.stops[0]?.color ?? '#6366F1'
      const color2 = value.gradient?.stops[1]?.color ?? '#4F46E5'
      onChange({
        type: 'gradient',
        gradient: {
          direction: value.gradient?.direction ?? 180,
          stops: [
            { color: color1, position: 0 },
            { color: color2, position: 1 },
          ],
        },
      })
    } else {
      onChange({
        type: 'image',
        imageKey: value.imageKey,
        imageObjectFit: value.imageObjectFit ?? 'cover',
        color: value.color,
      })
    }
  }

  async function handleBgFile(file: File) {
    setUploadError(null)
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      setUploadError('이미지를 읽을 수 없습니다. 다른 파일(PNG/JPG)을 올려주세요.')
      return
    }
    onChange({
      type: 'image',
      imageKey: result.key,
      imageObjectFit: value.imageObjectFit ?? 'cover',
      color: value.color,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {onApplyPreset && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            테마 프리셋
          </label>
          <div className="grid grid-cols-2 gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onApplyPreset(p)}
                className="group rounded-lg border border-[var(--color-border)] p-1.5 text-left transition hover:border-[var(--color-accent)]"
              >
                <div
                  className="mb-1 h-10 w-full rounded"
                  style={previewStyle(p)}
                />
                <div className="text-xs font-medium text-[var(--color-text)]">{p.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
        {(['solid', 'gradient', 'image'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => switchTab(tab)}
            className={[
              'flex-1 py-1.5 text-xs font-medium transition',
              activeTab === tab
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {tab === 'solid' ? '단색' : tab === 'gradient' ? '그라데이션' : '이미지'}
          </button>
        ))}
      </div>

      {activeTab === 'solid' && (
        <div>
          <label className="mb-2 block text-xs text-[var(--color-text-dim)]">배경색</label>
          <ColorPickerPopover
            color={value.color ?? '#6366F1'}
            onChange={(c) => onChange({ type: 'solid', color: c })}
            label="배경색 선택"
          />
        </div>
      )}

      {activeTab === 'gradient' && g && (
        <div className="flex flex-col gap-3">
          <div
            className="h-8 w-full rounded border border-[var(--color-border)]"
            style={gradientCss(g)}
          />

          {/* Linear / radial toggle */}
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {(['linear', 'radial'] as const).map((k) => {
              const active = (g.kind ?? 'linear') === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => updateGradient({ kind: k })}
                  className={[
                    'flex-1 py-1.5 text-xs font-medium transition',
                    active
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
                  ].join(' ')}
                >
                  {k === 'linear' ? '선형' : '방사형'}
                </button>
              )
            })}
          </div>

          {/* Color stops */}
          <div className="flex flex-col gap-2">
            <label className="block text-xs text-[var(--color-text-dim)]">색상 스톱</label>
            {g.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <ColorPickerPopover
                  color={s.color}
                  onChange={(c) => updateStop(i, { color: c })}
                  label={`스톱 ${i + 1} 색상`}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(s.position * 100)}
                  onChange={(e) => updateStop(i, { position: Number(e.target.value) / 100 })}
                  className="min-w-0 flex-1 accent-[var(--color-accent)]"
                />
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--color-text-dim)]">
                  {Math.round(s.position * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  disabled={g.stops.length <= 2}
                  className="shrink-0 px-1 text-sm text-[var(--color-text-dim)] transition enabled:hover:text-[var(--color-text)] disabled:opacity-30"
                  aria-label={`스톱 ${i + 1} 삭제`}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStop}
              className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-1.5 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              + 색상 추가
            </button>
          </div>

          {(g.kind ?? 'linear') === 'linear' && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">
                방향: {g.direction}°
              </label>
              <input
                type="range"
                min={0}
                max={360}
                value={g.direction}
                onChange={(e) => updateGradient({ direction: Number(e.target.value) })}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'image' && (
        <div className="flex flex-col gap-3">
          {value.imageKey && thumbUrl && (
            <img
              src={thumbUrl}
              alt="background preview"
              className="max-h-32 w-full rounded border border-[var(--color-border)] object-contain"
            />
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-6 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {value.imageKey ? '이미지 교체' : '클릭하여 배경 이미지 업로드'}
          </button>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

          {value.imageKey && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">맞춤 방식</label>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
                {FIT_OPTIONS.map((opt) => {
                  const active = (value.imageObjectFit ?? 'cover') === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChange({ ...value, type: 'image', imageObjectFit: opt.id })}
                      className={[
                        'flex-1 py-1.5 text-xs font-medium transition',
                        active
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleBgFile(file)
              e.target.value = ''
            }}
          />
        </div>
      )}
    </div>
  )
}
