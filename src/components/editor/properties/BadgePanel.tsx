import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Badge } from '../../../types/project'
import { makeBadge } from '../../../constants/defaults'

interface Props {
  value: Badge | null
  onChange: (badge: Badge | null) => void
}

export function BadgePanel({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">배지</span>
        <button
          type="button"
          onClick={() => onChange(value ? null : makeBadge())}
          className={[
            'rounded px-3 py-1 text-xs transition',
            value
              ? 'border border-red-500/40 text-red-600 hover:bg-red-500/10'
              : 'border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {value ? '제거' : '추가'}
        </button>
      </div>

      {value && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-dim)]">텍스트</label>
            <input
              type="text"
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs text-[var(--color-text-dim)]">배경색</label>
              <ColorPickerPopover
                color={value.style.backgroundColor}
                onChange={(c) => onChange({ ...value, style: { ...value.style, backgroundColor: c } })}
                label="배경색"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs text-[var(--color-text-dim)]">텍스트색</label>
              <ColorPickerPopover
                color={value.style.textColor}
                onChange={(c) => onChange({ ...value, style: { ...value.style, textColor: c } })}
                label="텍스트색"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
              <span>세로 위치</span>
              <span>{Math.round(value.top * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={95}
              value={Math.round(value.top * 100)}
              onChange={(e) => onChange({ ...value, top: Number(e.target.value) / 100 })}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        </div>
      )}
    </div>
  )
}
