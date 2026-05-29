import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Ornament, OrnamentShape } from '../../../types/project'
import { makeOrnament } from '../../../constants/defaults'

interface Props {
  value: Ornament[]
  onChange: (next: Ornament[]) => void
}

const SHAPES: { id: OrnamentShape; label: string; emoji: string }[] = [
  { id: 'star',     label: '별',     emoji: '★' },
  { id: 'sparkles', label: '스파클', emoji: '✦' },
  { id: 'heart',    label: '하트',   emoji: '♥' },
  { id: 'flower',   label: '꽃',     emoji: '✿' },
  { id: 'leaf',     label: '잎',     emoji: '🍃' },
  { id: 'paw',      label: '발자국', emoji: '🐾' },
  { id: 'dot-grid', label: '도트',   emoji: '⋮⋮' },
]

export function OrnamentPanel({ value, onChange }: Props) {
  function addShape(shape: OrnamentShape) {
    onChange([...(value ?? []), makeOrnament(shape)])
  }

  function update(id: string, patch: Partial<Ornament>) {
    onChange(value.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }

  function remove(id: string) {
    onChange(value.filter((o) => o.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          추가
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addShape(s.id)}
              className="flex flex-col items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 text-[10px] text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
              title={s.label}
            >
              <span className="text-base">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {value?.length > 0 && (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            추가된 장식 ({value.length})
          </label>
          {value.map((orn) => (
            <div
              key={orn.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-text)]">{shapeLabel(orn.shape)}</span>
                <button
                  type="button"
                  onClick={() => remove(orn.id)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  삭제
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberSlider
                  label="X"
                  value={orn.x}
                  min={0}
                  max={1}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(orn.id, { x: v })}
                />
                <NumberSlider
                  label="Y"
                  value={orn.y}
                  min={0}
                  max={1}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(orn.id, { y: v })}
                />
                <NumberSlider
                  label="크기"
                  value={orn.size}
                  min={0.02}
                  max={1}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(orn.id, { size: v })}
                />
                <NumberSlider
                  label="회전"
                  value={orn.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  fmt={(v) => `${Math.round(v)}°`}
                  onChange={(v) => update(orn.id, { rotation: v })}
                />
              </div>

              <NumberSlider
                label="투명도"
                value={orn.opacity}
                min={0}
                max={1}
                step={0.05}
                fmt={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => update(orn.id, { opacity: v })}
              />

              <div>
                <label className="mb-1 block text-xs text-[var(--color-text-dim)]">색상</label>
                <ColorPickerPopover
                  color={orn.color}
                  onChange={(c) => update(orn.id, { color: c })}
                  label="장식 색상"
                />
              </div>

              {orn.shape !== 'dot-grid' && (
                <label className="flex items-center justify-between text-xs text-[var(--color-text-dim)]">
                  <span>안쪽 채우기</span>
                  <input
                    type="checkbox"
                    checked={!!orn.filled}
                    onChange={(e) => update(orn.id, { filled: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function shapeLabel(shape: OrnamentShape): string {
  return SHAPES.find((s) => s.id === shape)?.label ?? shape
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
