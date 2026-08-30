import { useMemo } from 'react'
import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Highlight, Slide } from '../../../types/project'
import {
  accentFromBackground,
  DEFAULT_HIGHLIGHT_RIM,
  DEFAULT_HIGHLIGHT_ZOOM,
  HIGHLIGHT_ZOOM_MAX,
  HIGHLIGHT_ZOOM_MIN,
  MAX_HIGHLIGHTS,
  makeHighlight,
} from '../../../constants/defaults'
import { useProjectStore } from '../../../store/useProjectStore'
import { normalizeAngle } from '../../../canvas/geometry'
import { screenBoundsOf } from '../../../canvas/templateLayouts'
import { markerOf, zoomFromPixelWidth } from '../../../canvas/objects/highlight'
import { EDITOR_CANVAS_WIDTH } from '../../../constants/deviceSpecs'
import { useT } from '../../../i18n'

interface Props {
  value: Highlight[]
  slide: Slide
  hasScreenshot: boolean
  onChange: (next: Highlight[]) => void
}

const ZOOM_PRESETS = [1.5, 2, 2.5, 3]
const SHAPES: { id: NonNullable<Highlight['popup']['shape']>; label: string }[] = [
  { id: 'rect', label: '사각' },
  { id: 'circle', label: '원형' },
]


export function HighlightPanel({ value, slide, hasScreenshot, onChange }: Props) {
  const t = useT()
  const atMax = value.length >= MAX_HIGHLIGHTS
  const themeBackground = useProjectStore((s) => s.project?.themeBackground)

  // The same screen box the renderer will sample, so a legacy highlight (sized
  // by popup.width, before zoom existed) can be shown as the magnification it
  // actually renders at instead of a placeholder.
  const screenWidth = useMemo(() => {
    const span = !!slide.spanGroupId
    const cw = span ? EDITOR_CANVAS_WIDTH * 2 : EDITOR_CANVAS_WIDTH
    return screenBoundsOf(slide, cw, undefined, span)?.width ?? null
  }, [slide])

  function zoomOf(h: Highlight): number {
    if (typeof h.popup.zoom === 'number') return h.popup.zoom
    if (!screenWidth) return DEFAULT_HIGHLIGHT_ZOOM
    const span = !!slide.spanGroupId
    const cw = span ? EDITOR_CANVAS_WIDTH * 2 : EDITOR_CANVAS_WIDTH
    return zoomFromPixelWidth(cw * h.popup.width, h.sourceRegion.w, screenWidth)
  }

  function add() {
    // A new marker takes the project's accent, the same way a new badge does.
    onChange([...value, makeHighlight(undefined, themeBackground ? accentFromBackground(themeBackground) : undefined)])
  }
  function update(id: string, patch: Partial<Highlight>) {
    onChange(value.map((h) => (h.id === id ? { ...h, ...patch } : h)))
  }
  function updatePopup(id: string, patch: Partial<Highlight['popup']>) {
    onChange(
      value.map((h) => (h.id === id ? { ...h, popup: { ...h.popup, ...patch } } : h)),
    )
  }
  function remove(id: string) {
    onChange(value.filter((h) => h.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          {t('하이라이트')}
        </p>
        <button
          type="button"
          onClick={add}
          disabled={!hasScreenshot || atMax}
          title={
            !hasScreenshot
              ? t('먼저 스크린샷을 업로드하세요')
              : atMax
                ? t('최대 {n}개까지 추가할 수 있습니다', { n: MAX_HIGHLIGHTS })
                : t('하이라이트 추가')
          }
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('+ 추가')}
        </button>
      </div>

      {!hasScreenshot && (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-dim)]">
          {t('하이라이트는 스크린샷 영역을 확대해 보여주는 기능이에요. 먼저 스크린샷을 업로드해야 추가할 수 있어요.')}
        </p>
      )}

      {value.length === 0 && hasScreenshot && (
        <p className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-text-dim)]">
          {t('"+ 추가"로 하이라이트를 만드세요. 캔버스에서 확대할 영역을 잡고 배율만 정하면 됩니다.')}
        </p>
      )}

      {value.map((h, i) => (
        <div
          key={h.id}
          className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--color-text)]">{t('하이라이트 {n}', { n: i + 1 })}</p>
            <button
              type="button"
              onClick={() => remove(h.id)}
              className="text-xs text-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              {t('삭제')}
            </button>
          </div>

          <Group label={t('배율')}>
            <div className="grid grid-cols-4 gap-1.5">
              {ZOOM_PRESETS.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => updatePopup(h.id, { zoom: z })}
                  aria-pressed={Math.abs(zoomOf(h) - z) < 0.01}
                  className={`rounded border py-1 text-xs transition ${
                    Math.abs(zoomOf(h) - z) < 0.01
                      ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)] text-[var(--color-accent-on)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {z}×
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between text-xs text-[var(--color-text)]">
              <input
                type="range"
                min={HIGHLIGHT_ZOOM_MIN}
                max={HIGHLIGHT_ZOOM_MAX}
                step={0.1}
                value={zoomOf(h)}
                onChange={(e) => updatePopup(h.id, { zoom: Number(e.target.value) })}
                className="flex-1 accent-[var(--color-accent)]"
              />
              <span className="w-10 text-right text-[var(--color-text-dim)]">
                {zoomOf(h).toFixed(1)}×
              </span>
            </label>
            <p className="text-[10px] leading-tight text-[var(--color-text-dim)]">
              {t('카드 크기는 배율에서 나옵니다. 영역을 다시 잡아도 배율은 그대로예요.')}
            </p>
          </Group>

          <Group label={t('모양')}>
            <div className="grid grid-cols-2 gap-1.5">
              {SHAPES.map((sh) => (
                <button
                  key={sh.id}
                  type="button"
                  onClick={() => updatePopup(h.id, { shape: sh.id })}
                  aria-pressed={(h.popup.shape ?? 'rect') === sh.id}
                  className={`rounded border py-1 text-xs transition ${
                    (h.popup.shape ?? 'rect') === sh.id
                      ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)] text-[var(--color-accent-on)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {t(sh.label)}
                </button>
              ))}
            </div>
          </Group>

          <Group label={t('원본 표시')}>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={markerOf(h).show}
                  onChange={(e) =>
                    update(h.id, { marker: { ...markerOf(h), show: e.target.checked } })
                  }
                  className="accent-[var(--color-accent)]"
                />
                {t('원본 테두리')}
              </label>
              {markerOf(h).show && (
                <ColorPickerPopover
                  color={markerOf(h).color}
                  onChange={(c) => update(h.id, { marker: { ...markerOf(h), color: c } })}
                  label={t('원본 테두리 색')}
                />
              )}
            </div>
          </Group>

          <Group label={t('배치')}>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={!!h.popup.auto}
                onChange={(e) => updatePopup(h.id, { auto: e.target.checked })}
                className="accent-[var(--color-accent)]"
              />
              {t('자동 배치')}
            </label>
            <label
              className={`flex items-center gap-1.5 text-xs text-[var(--color-text)] ${markerOf(h).show ? '' : 'opacity-40'}`}
            >
              <input
                type="checkbox"
                checked={!!h.popup.connector && markerOf(h).show}
                disabled={!markerOf(h).show}
                onChange={(e) => updatePopup(h.id, { connector: e.target.checked })}
                className="accent-[var(--color-accent)] disabled:cursor-not-allowed"
              />
              {t('연결선')}
            </label>
            <p className="text-[10px] leading-tight text-[var(--color-text-dim)]">
              {h.popup.auto
                ? t('원본을 가리지 않는 자리에 알아서 놓입니다. 카드를 끌면 그 자리에 고정돼요.')
                : t('카드 위치를 직접 잡은 상태입니다.')}
            </p>
          </Group>

          <Group label={t('테두리')}>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={!!h.popup.rim}
                  onChange={(e) =>
                    updatePopup(h.id, {
                      rim: e.target.checked ? { ...DEFAULT_HIGHLIGHT_RIM } : undefined,
                    })
                  }
                  className="accent-[var(--color-accent)]"
                />
                {t('카드 테두리')}
              </label>
              {h.popup.rim && (
                <ColorPickerPopover
                  color={h.popup.rim.color}
                  onChange={(c) =>
                    updatePopup(h.id, { rim: { ...(h.popup.rim ?? DEFAULT_HIGHLIGHT_RIM), color: c } })
                  }
                  label={t('테두리 색')}
                />
              )}
            </div>
          </Group>

          <details>
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
              {t('세부 조정')}
            </summary>
            <div className="mt-2 space-y-3">
              <Group label={t('원본 영역 (스크린샷 안)')}>
                <Slider
                  label="X"
                  value={h.sourceRegion.x}
                  min={0}
                  max={1 - h.sourceRegion.w}
                  step={0.01}
                  onChange={(v) =>
                    update(h.id, { sourceRegion: { ...h.sourceRegion, x: v } })
                  }
                />
                <Slider
                  label="Y"
                  value={h.sourceRegion.y}
                  min={0}
                  max={1 - h.sourceRegion.h}
                  step={0.01}
                  onChange={(v) =>
                    update(h.id, { sourceRegion: { ...h.sourceRegion, y: v } })
                  }
                />
                <Slider
                  label="W"
                  value={h.sourceRegion.w}
                  min={0.05}
                  max={1 - h.sourceRegion.x}
                  step={0.01}
                  onChange={(v) =>
                    update(h.id, { sourceRegion: { ...h.sourceRegion, w: v } })
                  }
                />
                <Slider
                  label="H"
                  value={h.sourceRegion.h}
                  min={0.05}
                  max={1 - h.sourceRegion.y}
                  step={0.01}
                  onChange={(v) =>
                    update(h.id, { sourceRegion: { ...h.sourceRegion, h: v } })
                  }
                />
              </Group>

              <Group label={t('확대 카드')}>
                <Slider
                  label="X"
                  value={h.popup.x ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={!!h.popup.auto}
                  onChange={(v) => updatePopup(h.id, { x: v, auto: false })}
                />
                <Slider
                  label="Y"
                  value={h.popup.y ?? 0.32}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={!!h.popup.auto}
                  onChange={(v) => updatePopup(h.id, { y: v, auto: false })}
                />
                <label className="flex items-center justify-between text-xs text-[var(--color-text)]">
                  <span className="w-16 text-[var(--color-text-dim)]">{t('회전')}</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={h.popup.rotation ?? 0}
                    onChange={(e) => updatePopup(h.id, { rotation: normalizeAngle(Number(e.target.value)) })}
                    className="ml-2 flex-1 accent-[var(--color-accent)]"
                  />
                  <span className="w-10 text-right text-[var(--color-text-dim)]">
                    {Math.round(h.popup.rotation ?? 0)}°
                  </span>
                </label>
              </Group>
            </div>
          </details>
        </div>
      ))}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <label
      className={`flex items-center justify-between text-xs text-[var(--color-text)] ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="w-16 text-[var(--color-text-dim)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ml-2 flex-1 accent-[var(--color-accent)] disabled:cursor-not-allowed"
      />
      <span className="w-10 text-right text-[var(--color-text-dim)]">
        {Math.round(value * 100)}%
      </span>
    </label>
  )
}
