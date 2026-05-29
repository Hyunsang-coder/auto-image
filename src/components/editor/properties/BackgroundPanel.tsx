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

  function previewStyle(preset: ThemePreset): React.CSSProperties {
    const bg = preset.background
    if (bg.type === 'gradient' && bg.gradient) {
      const stops = bg.gradient.stops
        .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
        .join(', ')
      return { background: `linear-gradient(${bg.gradient.direction}deg, ${stops})` }
    }
    return { background: bg.color ?? '#888' }
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

      {activeTab === 'gradient' && value.gradient && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-2 block text-xs text-[var(--color-text-dim)]">시작 색상</label>
            <ColorPickerPopover
              color={value.gradient.stops[0]?.color ?? '#6366F1'}
              onChange={(c) =>
                onChange({
                  type: 'gradient',
                  gradient: {
                    ...value.gradient!,
                    stops: [
                      { color: c, position: 0 },
                      value.gradient!.stops[1] ?? { color: '#4F46E5', position: 1 },
                    ],
                  },
                })
              }
              label="시작 색상"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs text-[var(--color-text-dim)]">끝 색상</label>
            <ColorPickerPopover
              color={value.gradient.stops[1]?.color ?? '#4F46E5'}
              onChange={(c) =>
                onChange({
                  type: 'gradient',
                  gradient: {
                    ...value.gradient!,
                    stops: [
                      value.gradient!.stops[0] ?? { color: '#6366F1', position: 0 },
                      { color: c, position: 1 },
                    ],
                  },
                })
              }
              label="끝 색상"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-dim)]">
              방향: {value.gradient.direction}°
            </label>
            <input
              type="range"
              min={0}
              max={360}
              value={value.gradient.direction}
              onChange={(e) =>
                onChange({
                  type: 'gradient',
                  gradient: {
                    ...value.gradient!,
                    direction: Number(e.target.value),
                  },
                })
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
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
