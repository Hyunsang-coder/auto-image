import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Badge } from '../../../types/project'
import { makeBadge, accentFromBackground } from '../../../constants/defaults'
import { useProjectStore } from '../../../store/useProjectStore'

interface Props {
  value: Badge[]
  onChange: (badges: Badge[]) => void
}

export function BadgePanel({ value, onChange }: Props) {
  const badges = value ?? []
  const themeBackground = useProjectStore((s) => s.project?.themeBackground)
  const accent = themeBackground ? accentFromBackground(themeBackground) : undefined

  function add() {
    // Stagger each new badge downward so it doesn't land exactly on the last.
    const top = Math.min(0.9, 0.03 + badges.length * 0.09)
    onChange([...badges, { ...makeBadge(undefined, accent), top }])
  }

  function update(id: string, patch: Partial<Badge>) {
    onChange(badges.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function updateStyle(id: string, patch: Partial<Badge['style']>) {
    onChange(
      badges.map((b) => (b.id === id ? { ...b, style: { ...b.style, ...patch } } : b)),
    )
  }

  function remove(id: string) {
    onChange(badges.filter((b) => b.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">
          배지{badges.length > 0 ? ` (${badges.length})` : ''}
        </span>
        <button
          type="button"
          onClick={add}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-dim)] transition hover:text-[var(--color-text)]"
        >
          추가
        </button>
      </div>

      {badges.map((badge) => (
        <div
          key={badge.id}
          className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
        >
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={badge.text}
              onChange={(e) => update(badge.id, { text: e.target.value })}
              className="mr-2 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={() => remove(badge.id)}
              className="shrink-0 text-xs text-red-600 hover:text-red-700"
            >
              삭제
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs text-[var(--color-text-dim)]">배경색</label>
              <ColorPickerPopover
                color={badge.style.backgroundColor}
                onChange={(c) => updateStyle(badge.id, { backgroundColor: c })}
                label="배경색"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs text-[var(--color-text-dim)]">텍스트색</label>
              <ColorPickerPopover
                color={badge.style.textColor}
                onChange={(c) => updateStyle(badge.id, { textColor: c })}
                label="텍스트색"
              />
            </div>
          </div>

          <Slider
            label="세로 위치"
            value={Math.round(badge.top * 100)}
            min={0}
            max={95}
            fmt={(v) => `${v}%`}
            onChange={(v) => update(badge.id, { top: v / 100 })}
          />

          <Slider
            label="모서리"
            value={badge.style.borderRadius}
            min={0}
            max={100}
            step={2}
            fmt={(v) => `${v}px`}
            onChange={(v) => updateStyle(badge.id, { borderRadius: v })}
          />
        </div>
      ))}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  fmt: (v: number) => string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step = 1, fmt, onChange }: SliderProps) {
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
