import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Shape, ShapeKind } from '../../../types/project'
import { MAX_SHAPES, makeShape } from '../../../constants/defaults'
import { useT } from '../../../i18n'

interface Props {
  value: Shape[]
  onChange: (next: Shape[]) => void
}

const KINDS: { id: ShapeKind; glyph: string; label: string }[] = [
  { id: 'rect',    glyph: '▭', label: '사각형' },
  { id: 'ellipse', glyph: '◯', label: '원' },
  { id: 'line',    glyph: '─', label: '선' },
  { id: 'arrow',   glyph: '→', label: '화살표' },
]

const DEFAULT_STROKE_WIDTH = 0.006

export function ShapePanel({ value, onChange }: Props) {
  const t = useT()
  const shapes = value ?? []

  function add(kind: ShapeKind) {
    onChange([...shapes, makeShape(kind)])
  }

  function update(id: string, patch: Partial<Shape>) {
    onChange(shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function remove(id: string) {
    onChange(shapes.filter((s) => s.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {t('추가')}
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              disabled={shapes.length >= MAX_SHAPES}
              onClick={() => add(k.id)}
              className="flex flex-col items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 text-[10px] text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              title={t(k.label)}
            >
              <span className="text-base leading-none">{k.glyph}</span>
              {t(k.label)}
            </button>
          ))}
        </div>
      </div>

      {shapes.length > 0 && (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            {t('추가된 도형 ({n})', { n: shapes.length })}
          </label>
          {shapes.map((shape) => (
            <div
              key={shape.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-text)]">{t(kindLabel(shape.kind))}</span>
                <button
                  type="button"
                  onClick={() => remove(shape.id)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  {t('삭제')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('채우기 색')}</label>
                  <div className="flex items-center gap-2">
                    {shape.fill !== 'none' && (
                      <ColorPickerPopover
                        color={shape.fill}
                        onChange={(c) => update(shape.id, { fill: c })}
                        label={t('채우기 색')}
                      />
                    )}
                    <label className="flex items-center gap-1 text-xs text-[var(--color-text-dim)]">
                      <input
                        type="checkbox"
                        checked={shape.fill === 'none'}
                        onChange={(e) =>
                          update(shape.id, e.target.checked
                            ? { fill: 'none', stroke: shape.stroke ?? { color: '#FFFFFF', width: DEFAULT_STROKE_WIDTH } }
                            : { fill: '#FFFFFF' })
                        }
                        className="accent-[var(--color-accent)]"
                      />
                      {t('없음')}
                    </label>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('레이어')}</label>
                  <select
                    value={shape.layer ?? 'back'}
                    onChange={(e) => update(shape.id, { layer: e.target.value as Shape['layer'] })}
                    className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
                  >
                    <option value="back">{t('디바이스 뒤')}</option>
                    <option value="front">{t('디바이스 앞')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberSlider
                  label="X"
                  value={shape.x}
                  min={0}
                  max={1}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(shape.id, { x: v })}
                />
                <NumberSlider
                  label="Y"
                  value={shape.y}
                  min={0}
                  max={1}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(shape.id, { y: v })}
                />
                <NumberSlider
                  label={t('너비')}
                  value={shape.width}
                  min={0.01}
                  max={1.5}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(shape.id, { width: v })}
                />
                <NumberSlider
                  label={t('높이')}
                  value={shape.height}
                  min={0.002}
                  max={1.5}
                  step={0.002}
                  fmt={(v) => `${Math.round(v * 1000) / 10}%`}
                  onChange={(v) => update(shape.id, { height: v })}
                />
                <NumberSlider
                  label={t('회전')}
                  value={shape.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  fmt={(v) => `${Math.round(v)}°`}
                  onChange={(v) => update(shape.id, { rotation: v })}
                />
                <NumberSlider
                  label={t('투명도')}
                  value={shape.opacity}
                  min={0}
                  max={1}
                  step={0.05}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(shape.id, { opacity: v })}
                />
              </div>

              {shape.kind === 'rect' && (
                <NumberSlider
                  label={t('모서리 둥글기')}
                  value={shape.cornerRadiusRatio ?? 0}
                  min={0}
                  max={0.5}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(shape.id, { cornerRadiusRatio: v })}
                />
              )}

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[var(--color-text-dim)]">
                  <input
                    type="checkbox"
                    checked={!!shape.stroke}
                    onChange={(e) =>
                      update(shape.id, {
                        stroke: e.target.checked ? { color: '#FFFFFF', width: DEFAULT_STROKE_WIDTH } : undefined,
                        ...(e.target.checked || shape.fill !== 'none' ? {} : { fill: '#FFFFFF' }),
                      })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  {t('테두리')}
                </label>
                {shape.stroke && (
                  <>
                    <ColorPickerPopover
                      color={shape.stroke.color}
                      onChange={(c) => update(shape.id, { stroke: { ...shape.stroke!, color: c } })}
                      label={t('테두리')}
                    />
                    <div className="flex-1">
                      <NumberSlider
                        label={t('두께')}
                        value={shape.stroke.width}
                        min={0.001}
                        max={0.05}
                        step={0.001}
                        fmt={(v) => `${Math.round(v * 1000) / 10}%`}
                        onChange={(v) => update(shape.id, { stroke: { ...shape.stroke!, width: v } })}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function kindLabel(kind: ShapeKind): string {
  return KINDS.find((k) => k.id === kind)?.label ?? kind
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
