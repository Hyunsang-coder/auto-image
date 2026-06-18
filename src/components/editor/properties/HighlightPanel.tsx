import type { Highlight } from '../../../types/project'
import { makeHighlight } from '../../../constants/defaults'
import { normalizeAngle } from '../../../canvas/geometry'
import { useT } from '../../../i18n'

interface Props {
  value: Highlight[]
  hasScreenshot: boolean
  onChange: (next: Highlight[]) => void
}

export function HighlightPanel({ value, hasScreenshot, onChange }: Props) {
  const t = useT()
  function add() {
    onChange([...value, makeHighlight()])
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
          disabled={!hasScreenshot}
          title={hasScreenshot ? t('하이라이트 추가') : t('먼저 스크린샷을 업로드하세요')}
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
          {t('"+ 추가"로 하이라이트를 만드세요. 캔버스에서 원본 박스와 확대 카드를 직접 조정하세요.')}
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
              className="text-xs text-red-600 hover:text-red-700"
            >
              {t('삭제')}
            </button>
          </div>

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
              onChange={(v) => updatePopup(h.id, { x: v })}
            />
            <Slider
              label="Y"
              value={h.popup.y ?? 0.32}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updatePopup(h.id, { y: v })}
            />
            <Slider
              label={t('크기')}
              value={h.popup.width}
              min={0.2}
              max={1}
              step={0.01}
              onChange={(v) => updatePopup(h.id, { width: v })}
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
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between text-xs text-[var(--color-text)]">
      <span className="w-16 text-[var(--color-text-dim)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ml-2 flex-1 accent-[var(--color-accent)]"
      />
      <span className="w-10 text-right text-[var(--color-text-dim)]">
        {Math.round(value * 100)}%
      </span>
    </label>
  )
}
