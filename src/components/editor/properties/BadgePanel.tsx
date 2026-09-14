import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Badge, BadgeStyle } from '../../../types/project'
import {
  makeBadge,
  accentFromBackground,
  badgePlaceholder,
  readableTextOn,
  DEFAULT_SOURCE_LOCALE,
  LAUREL_MAX_STARS,
} from '../../../constants/defaults'
import { useProjectStore } from '../../../store/useProjectStore'
import { useT } from '../../../i18n'

interface Props {
  value: Badge[]
  onChange: (badges: Badge[]) => void
  /** Ink a badge takes when switched to laurel, which has no background of its own. */
  inkColor?: string
}

type Variant = NonNullable<BadgeStyle['variant']>

export function BadgePanel({ value, onChange, inkColor }: Props) {
  const t = useT()
  const badges = value ?? []
  const themeBackground = useProjectStore((s) => s.project?.themeBackground)
  const sourceLocale = useProjectStore((s) => s.project?.sourceLocale ?? DEFAULT_SOURCE_LOCALE)
  const accent = themeBackground ? accentFromBackground(themeBackground) : undefined
  const variants: { id: Variant; label: string }[] = [
    { id: 'pill', label: t('알약') },
    { id: 'laurel', label: t('월계관') },
  ]

  function add() {
    // Stagger each new badge downward so it doesn't land exactly on the last.
    const top = Math.min(0.9, 0.03 + badges.length * 0.09)
    onChange([...badges, { ...makeBadge(badgePlaceholder(sourceLocale), accent), top }])
  }

  function update(id: string, patch: Partial<Badge>) {
    onChange(badges.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function updateStyle(id: string, patch: Partial<Badge['style']>) {
    onChange(
      badges.map((b) => (b.id === id ? { ...b, style: { ...b.style, ...patch } } : b)),
    )
  }

  function setVariant(badge: Badge, variant: Variant) {
    if ((badge.style.variant ?? 'pill') === variant) return
    if (variant === 'laurel') {
      updateStyle(badge.id, {
        variant,
        stars: badge.style.stars ?? LAUREL_MAX_STARS,
        textColor: inkColor ?? badge.style.textColor,
      })
    } else {
      updateStyle(badge.id, { variant, textColor: readableTextOn(badge.style.backgroundColor) })
    }
  }

  function remove(id: string) {
    onChange(badges.filter((b) => b.id !== id))
  }

  const fieldClass =
    'mr-2 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">
          {t('배지')}{badges.length > 0 ? ` (${badges.length})` : ''}
        </span>
        <button
          type="button"
          onClick={add}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-dim)] transition hover:text-[var(--color-text)]"
        >
          {t('추가')}
        </button>
      </div>

      {badges.map((badge) => {
        const laurel = badge.style.variant === 'laurel'
        return (
          <div
            key={badge.id}
            className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
          >
            <div className="flex items-start justify-between">
              {laurel ? (
                <textarea
                  rows={2}
                  value={badge.text}
                  onChange={(e) => update(badge.id, { text: e.target.value })}
                  className={`${fieldClass} resize-none`}
                />
              ) : (
                <input
                  type="text"
                  value={badge.text}
                  onChange={(e) => update(badge.id, { text: e.target.value })}
                  className={fieldClass}
                />
              )}
              <button
                type="button"
                onClick={() => remove(badge.id)}
                className="shrink-0 py-1.5 text-xs text-[var(--color-danger)] hover:text-[var(--color-danger)]"
              >
                {t('삭제')}
              </button>
            </div>
            {laurel && (
              <p className="text-xs text-[var(--color-text-dim)]">
                {t('둘째 줄은 별 아래 작은 글씨로 들어가요')}
              </p>
            )}

            <div>
              <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('모양')}</label>
              <div className="grid grid-cols-2 gap-1.5">
                {variants.map((v) => {
                  const active = (badge.style.variant ?? 'pill') === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setVariant(badge, v.id)}
                      className={`rounded border py-1 text-xs transition ${
                        active
                          ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)] text-[var(--color-accent-on)]'
                          : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      {v.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {laurel ? (
              <div>
                <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('색상')}</label>
                <ColorPickerPopover
                  color={badge.style.textColor}
                  onChange={(c) => updateStyle(badge.id, { textColor: c })}
                  label={t('색상')}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('배경색')}</label>
                  <ColorPickerPopover
                    color={badge.style.backgroundColor}
                    onChange={(c) => updateStyle(badge.id, { backgroundColor: c })}
                    label={t('배경색')}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('텍스트색')}</label>
                  <ColorPickerPopover
                    color={badge.style.textColor}
                    onChange={(c) => updateStyle(badge.id, { textColor: c })}
                    label={t('텍스트색')}
                  />
                </div>
              </div>
            )}

            {laurel && (
              <Slider
                label={t('별 개수')}
                value={badge.style.stars ?? 0}
                min={0}
                max={LAUREL_MAX_STARS}
                fmt={(v) => String(v)}
                onChange={(v) => updateStyle(badge.id, { stars: v })}
              />
            )}

            <Slider
              label={t('세로 위치')}
              value={Math.round(badge.top * 100)}
              min={0}
              max={95}
              fmt={(v) => `${v}%`}
              onChange={(v) => update(badge.id, { top: v / 100 })}
            />

            {!laurel && (
              <Slider
                label={t('모서리')}
                value={badge.style.borderRadius}
                min={0}
                max={100}
                step={2}
                fmt={(v) => `${v}px`}
                onChange={(v) => updateStyle(badge.id, { borderRadius: v })}
              />
            )}
          </div>
        )
      })}
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
