import { useEffect, useRef, useState } from 'react'
import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Background, BackgroundBlob, BlobBlendMode } from '../../../types/project'
import { THEME_PRESETS, DEFAULT_BACKGROUND, MAX_BACKGROUND_BLOBS, BLOB_BLEND_MODES, type ThemePreset } from '../../../constants/defaults'
import { fileToImageKey, loadImageObjectUrl } from '../../../lib/imageStore'
import { useCustomStore } from '../../../store/useCustomStore'
import { useT } from '../../../i18n'

interface Props {
  value: Background
  onChange: (bg: Background) => void
  onApplyPreset?: (preset: ThemePreset) => void
  /** Save the current slide's background + text colors as a named preset. */
  onSavePreset?: (name: string) => void
  /** Bulk apply is off in locale mode (base-only operation). */
  bulkEnabled?: boolean
  /** Live multi-selection size (includes the active slide). */
  selectedCount?: number
  /** Total base slides — the "전체" target count. */
  slideCount?: number
  onApplyPresetToSlides?: (preset: ThemePreset, scope: 'all' | 'selected') => void
}

type Tab = 'solid' | 'gradient' | 'image'
type ApplyScope = 'this' | 'all' | 'selected'

const FIT_OPTIONS: { id: NonNullable<Background['imageObjectFit']>; label: string }[] = [
  { id: 'cover', label: '채우기' },
  { id: 'contain', label: '맞춤' },
  { id: 'fill', label: '늘이기' },
]

// Pastel cycle for newly added blobs — visible on the muted preset bases.
const BLOB_COLORS = ['#C9B8EC', '#F2C4C0', '#BCD4EE', '#C6E0C9', '#F5D9A8', '#AFD3D8']
const BLOB_SEATS: Array<[number, number]> = [
  [0.2, 0.2],
  [0.8, 0.35],
  [0.3, 0.85],
  [0.75, 0.8],
  [0.5, 0.5],
  [0.15, 0.6],
]

function hexAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color
  return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
}

function blobLayersCss(blobs: BackgroundBlob[]): string[] {
  return blobs.map(
    (b) =>
      `radial-gradient(circle at ${Math.round(b.x * 100)}% ${Math.round(b.y * 100)}%, ${hexAlpha(
        b.color,
        b.opacity ?? 0.55,
      )} 0%, ${hexAlpha(b.color, 0)} ${Math.round(b.radius * 100)}%)`,
  )
}

export function BackgroundPanel({
  value,
  onChange,
  onApplyPreset,
  onSavePreset,
  bulkEnabled = false,
  selectedCount = 0,
  slideCount = 0,
  onApplyPresetToSlides,
}: Props) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<Tab>(
    value.type === 'gradient' ? 'gradient' : value.type === 'image' ? 'image' : 'solid',
  )
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const customPresets = useCustomStore((s) => s.presets)
  const removePreset = useCustomStore((s) => s.removePreset)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  // Bulk apply scope. Default 'this' keeps the existing single-slide behavior.
  // 'selected' is only offered with 2+ slides selected; if the selection shrinks
  // back below 2 we silently fall back to 'this' at click time.
  const [scope, setScope] = useState<ApplyScope>('this')
  // A preset queued for a ≥2-slide bulk apply, awaiting inline confirmation.
  const [pendingPreset, setPendingPreset] = useState<ThemePreset | null>(null)

  const showBulk = bulkEnabled && !!onApplyPresetToSlides && slideCount > 1
  const bulkScope: 'all' | 'selected' | null =
    scope === 'all' ? 'all' : scope === 'selected' && selectedCount >= 2 ? 'selected' : null
  const bulkCount = bulkScope === 'all' ? slideCount : selectedCount

  // Route a preset click: bulk scopes with ≥2 targets get a confirm step;
  // everything else applies to the active slide immediately (unchanged path).
  function handlePresetClick(preset: ThemePreset) {
    if (bulkScope && onApplyPresetToSlides) {
      setPendingPreset(preset)
      return
    }
    onApplyPreset?.(preset)
  }

  function confirmBulk() {
    if (pendingPreset && bulkScope && onApplyPresetToSlides) {
      onApplyPresetToSlides(pendingPreset, bulkScope)
    }
    setPendingPreset(null)
  }

  function commitPreset() {
    const name = presetName.trim()
    if (!name || !onSavePreset) return
    onSavePreset(name)
    setPresetName('')
    setSavingPreset(false)
  }

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
    // Canvas maps direction 0 → top-to-bottom; CSS 0deg is bottom-to-top.
    // Convert so the preview matches the rendered gradient.
    const cssAngle = (540 - g.direction) % 360
    return {
      background:
        g.kind === 'radial'
          ? `radial-gradient(circle, ${stops})`
          : `linear-gradient(${cssAngle}deg, ${stops})`,
    }
  }

  function previewStyle(preset: ThemePreset): React.CSSProperties {
    const bg = preset.background
    const base =
      bg.type === 'gradient' && bg.gradient
        ? (gradientCss(bg.gradient).background as string)
        : bg.color ?? '#888'
    const blobs = blobLayersCss(bg.blobs ?? [])
    return { background: blobs.length ? [...blobs, base].join(', ') : base }
  }

  // Blobs/noise ride on top of any base — keep them when the base is rebuilt
  // (tab switches and solid/gradient edits construct a fresh Background).
  const overlays: Pick<Background, 'blobs' | 'noise'> = {
    ...(value.blobs?.length ? { blobs: value.blobs } : {}),
    ...(value.noise ? { noise: value.noise } : {}),
  }

  function setNoise(noise: number) {
    const next = { ...value }
    if (noise > 0) next.noise = noise
    else delete next.noise
    onChange(next)
  }

  function setBlobs(blobs: BackgroundBlob[]) {
    const next = { ...value }
    if (blobs.length) next.blobs = blobs
    else delete next.blobs
    onChange(next)
  }

  function updateBlob(i: number, patch: Partial<BackgroundBlob>) {
    setBlobs((value.blobs ?? []).map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  function addBlob() {
    const blobs = value.blobs ?? []
    if (blobs.length >= MAX_BACKGROUND_BLOBS) return
    const [x, y] = BLOB_SEATS[blobs.length % BLOB_SEATS.length]
    setBlobs([...blobs, { color: BLOB_COLORS[blobs.length % BLOB_COLORS.length], x, y, radius: 0.5 }])
  }

  const g = value.gradient
  function updateGradient(patch: Partial<NonNullable<Background['gradient']>>) {
    if (!g) return
    onChange({ type: 'gradient', gradient: { ...g, ...patch }, ...overlays })
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
      onChange({ type: 'solid', color, ...overlays })
    } else if (tab === 'gradient') {
      // Fall back to the recommended preset's gradient so re-entering the tab
      // (which dropped the gradient when leaving for solid/image) restores the
      // same default the project starts with, not an arbitrary color.
      const preset = DEFAULT_BACKGROUND.gradient!
      const color1 = value.color ?? value.gradient?.stops[0]?.color ?? preset.stops[0].color
      const color2 = value.gradient?.stops[1]?.color ?? preset.stops[1].color
      onChange({
        type: 'gradient',
        gradient: {
          direction: value.gradient?.direction ?? preset.direction,
          stops: [
            { color: color1, position: 0 },
            { color: color2, position: 1 },
          ],
        },
        ...overlays,
      })
    } else {
      onChange({
        type: 'image',
        imageKey: value.imageKey,
        imageObjectFit: value.imageObjectFit ?? 'cover',
        color: value.color,
        ...overlays,
      })
    }
  }

  async function handleBgFile(file: File) {
    setUploadError(null)
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      setUploadError(t('이미지를 읽을 수 없습니다. 다른 파일(PNG/JPG)을 올려주세요.'))
      return
    }
    onChange({
      type: 'image',
      imageKey: result.key,
      imageObjectFit: value.imageObjectFit ?? 'cover',
      color: value.color,
      ...overlays,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {onApplyPreset && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            {t('테마 프리셋')}
          </label>

          {showBulk && (
            <div className="mb-2 flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              {([
                ['this', t('이 슬라이드')],
                ['all', t('전체')],
                ...(selectedCount >= 2 ? [['selected', t('선택 {n}개', { n: selectedCount })] as const] : []),
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setScope(id)}
                  className={[
                    'flex-1 py-1.5 text-xs font-medium transition',
                    scope === id
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {showBulk && pendingPreset && bulkScope && (
            <div className="mb-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface-2)] p-2 text-xs">
              <p className="mb-2 text-[var(--color-text)]">
                {t('{n}개 슬라이드에 적용할까요?', { n: bulkCount })}{' '}
                <span className="text-[var(--color-text-dim)]">{t('되돌리기 불가')}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmBulk}
                  className="flex-1 rounded-md bg-[var(--color-accent)] py-1 font-semibold text-white hover:brightness-110"
                >
                  {t('적용')}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPreset(null)}
                  className="flex-1 rounded-md border border-[var(--color-border)] py-1 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                >
                  {t('취소')}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetClick(p)}
                className="group rounded-lg border border-[var(--color-border)] p-1.5 text-left transition hover:border-[var(--color-accent)]"
              >
                <div
                  className="mb-1 h-10 w-full rounded"
                  style={previewStyle(p)}
                />
                <div className="text-xs font-medium text-[var(--color-text)]">{p.label}</div>
              </button>
            ))}
            {customPresets.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-lg border border-[var(--color-border)] p-1.5 transition hover:border-[var(--color-accent)]"
              >
                <button
                  type="button"
                  onClick={() => handlePresetClick(p)}
                  className="block w-full text-left"
                >
                  <div className="mb-1 h-10 w-full rounded" style={previewStyle(p)} />
                  <div className="truncate text-xs font-medium text-[var(--color-text)]">
                    {p.label}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => removePreset(p.id)}
                  title={t('프리셋 삭제')}
                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/50 text-xs text-white group-hover:flex hover:bg-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {onSavePreset &&
            (savingPreset ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitPreset()
                    if (e.key === 'Escape') setSavingPreset(false)
                  }}
                  maxLength={40}
                  placeholder={t('프리셋 이름')}
                  className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
                <button
                  type="button"
                  onClick={commitPreset}
                  className="shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  {t('저장')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSavingPreset(true)}
                className="mt-2 w-full rounded-md border border-dashed border-[var(--color-border)] py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
              >
                {t('+ 현재 배경을 프리셋으로 저장')}
              </button>
            ))}
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
            {tab === 'solid' ? t('단색') : tab === 'gradient' ? t('그라데이션') : t('이미지')}
          </button>
        ))}
      </div>

      {activeTab === 'solid' && (
        <div>
          <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('배경색')}</label>
          <ColorPickerPopover
            color={value.color ?? '#6366F1'}
            onChange={(c) => onChange({ type: 'solid', color: c, ...overlays })}
            label={t('배경색 선택')}
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
                  {k === 'linear' ? t('선형') : t('방사형')}
                </button>
              )
            })}
          </div>

          {/* Color stops */}
          <div className="flex flex-col gap-2">
            <label className="block text-xs text-[var(--color-text-dim)]">{t('색상 스톱')}</label>
            {g.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <ColorPickerPopover
                  color={s.color}
                  onChange={(c) => updateStop(i, { color: c })}
                  label={t('스톱 {n} 색상', { n: i + 1 })}
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
                  aria-label={t('스톱 {n} 삭제', { n: i + 1 })}
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
              {t('+ 색상 추가')}
            </button>
          </div>

          {(g.kind ?? 'linear') === 'linear' && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">
                {t('방향')}: {g.direction}°
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
            {value.imageKey ? t('이미지 교체') : t('클릭하여 배경 이미지 업로드')}
          </button>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

          {value.imageKey && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('맞춤 방식')}</label>
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
                      {t(opt.label)}
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

      {/* Texture overlays — blobs + noise ride on top of any base */}
      <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {t('질감')}
        </label>

        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-dim)]">
            {t('노이즈')}: {Math.round((value.noise ?? 0) * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((value.noise ?? 0) * 100)}
            onChange={(e) => setNoise(Number(e.target.value) / 100)}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="block text-xs text-[var(--color-text-dim)]">{t('컬러 블롭')}</label>
          {(value.blobs ?? []).map((b, i) => (
            <div
              key={i}
              className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] p-2"
            >
              <div className="flex items-center gap-2">
                <ColorPickerPopover
                  color={b.color}
                  onChange={(c) => updateBlob(i, { color: c })}
                  label={t('블롭 {n} 색상', { n: i + 1 })}
                />
                <div className="min-w-0 flex-1" />
                <button
                  type="button"
                  onClick={() => setBlobs((value.blobs ?? []).filter((_, idx) => idx !== i))}
                  className="shrink-0 px-1 text-sm text-[var(--color-text-dim)] transition hover:text-[var(--color-text)]"
                  aria-label={t('블롭 {n} 삭제', { n: i + 1 })}
                >
                  ×
                </button>
              </div>
              {(
                [
                  [t('크기'), b.radius, 5, 150, (v: number) => updateBlob(i, { radius: v })],
                  [t('가로 위치 (X)'), b.x, -50, 150, (v: number) => updateBlob(i, { x: v })],
                  [t('세로 위치 (Y)'), b.y, -50, 150, (v: number) => updateBlob(i, { y: v })],
                  [t('불투명도'), b.opacity ?? 0.55, 5, 100, (v: number) => updateBlob(i, { opacity: v })],
                ] as const
              ).map(([label, frac, min, max, set]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs text-[var(--color-text-dim)]">{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={Math.round(frac * 100)}
                    onChange={(e) => set(Number(e.target.value) / 100)}
                    className="min-w-0 flex-1 accent-[var(--color-accent)]"
                  />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--color-text-dim)]">
                    {Math.round(frac * 100)}%
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-[var(--color-text-dim)]">{t('블렌드')}</span>
                <select
                  value={b.blendMode ?? 'normal'}
                  onChange={(e) => {
                    const next = { ...b }
                    if (e.target.value === 'normal') delete next.blendMode
                    else next.blendMode = e.target.value as BlobBlendMode
                    setBlobs((value.blobs ?? []).map((bb, idx) => (idx === i ? next : bb)))
                  }}
                  className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                >
                  <option value="normal">{t('표준')}</option>
                  {BLOB_BLEND_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {(value.blobs?.length ?? 0) < MAX_BACKGROUND_BLOBS && (
            <button
              type="button"
              onClick={addBlob}
              className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-1.5 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {t('+ 블롭 추가')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
