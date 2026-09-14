import type { EmojiOrnamentShape, Ornament, OrnamentShape, VectorOrnamentShape } from '../../../types/project'
import { makeOrnament, ORNAMENT_SHAPES } from '../../../constants/defaults'
import { ORNAMENT_EMOJI, ORNAMENT_LABELS, ORNAMENT_VECTORS } from '../../../canvas/objects/ornament'
import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import { useT } from '../../../i18n'

interface Props {
  value: Ornament[]
  onChange: (next: Ornament[]) => void
  /** A new ornament's ink. Not the theme accent: on the default light look that is a pale background tint. */
  inkColor?: string
}

export function OrnamentPanel({ value, onChange, inkColor }: Props) {
  const t = useT()
  function addShape(shape: OrnamentShape) {
    onChange([...(value ?? []), makeOrnament(shape, inkColor ? { color: inkColor } : undefined)])
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
          {t('추가')}
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {ORNAMENT_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => addShape(shape)}
              className="flex flex-col items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 text-[10px] text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
              title={t(ORNAMENT_LABELS[shape])}
            >
              <OrnamentGlyph shape={shape} />
              {t(ORNAMENT_LABELS[shape])}
            </button>
          ))}
        </div>
      </div>

      {value?.length > 0 && (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            {t('추가된 장식 ({n})', { n: value.length })}
          </label>
          {value.map((orn) => (
            <div
              key={orn.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)]">
                  <OrnamentGlyph shape={orn.shape} />
                  {t(ORNAMENT_LABELS[orn.shape] ?? orn.shape)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(orn.id)}
                  className="text-xs text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  {t('삭제')}
                </button>
              </div>

              {orn.shape in ORNAMENT_VECTORS && (
                <div>
                  <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('색상')}</label>
                  <ColorPickerPopover
                    color={orn.color}
                    onChange={(c) => update(orn.id, { color: c })}
                    label={t('색상')}
                  />
                </div>
              )}

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
                  label={t('크기')}
                  value={orn.size}
                  min={0.02}
                  max={1}
                  step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update(orn.id, { size: v })}
                />
                <NumberSlider
                  label={t('회전')}
                  value={orn.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  fmt={(v) => `${Math.round(v)}°`}
                  onChange={(v) => update(orn.id, { rotation: v })}
                />
              </div>

              <NumberSlider
                label={t('투명도')}
                value={orn.opacity}
                min={0}
                max={1}
                step={0.05}
                fmt={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => update(orn.id, { opacity: v })}
              />

            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OrnamentGlyph({ shape }: { shape: OrnamentShape }) {
  const vector = ORNAMENT_VECTORS[shape as VectorOrnamentShape]
  if (!vector) {
    return <span className="text-base leading-none">{ORNAMENT_EMOJI[shape as EmojiOrnamentShape]}</span>
  }
  const [w, h] = vector.box
  // Non-scaling strokes: at icon size the artboard strokes would shrink to hairlines.
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-7 overflow-visible" aria-hidden="true">
      <path
        d={vector.d}
        fill={vector.fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={vector.fill ? 1 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
