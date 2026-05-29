import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Caption, TextStyle } from '../../../types/project'
import { FONT_OPTIONS } from '../../../constants/defaults'

interface CaptionFieldProps {
  label: string
  value: Caption
  onChange: (c: Caption) => void
}

function CaptionField({ label, value, onChange }: CaptionFieldProps) {
  function updateStyle(patch: Partial<TextStyle>) {
    onChange({ ...value, style: { ...value.style, ...patch } })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </p>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-dim)]">텍스트</label>
        <textarea
          rows={2}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-dim)]">폰트</label>
        <select
          value={value.style.fontFamily}
          onChange={(e) => updateStyle({ fontFamily: e.target.value })}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
          style={{ fontFamily: value.style.fontFamily }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-[var(--color-text-dim)]">크기</label>
          <input
            type="number"
            min={10}
            max={300}
            value={value.style.fontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-[var(--color-text-dim)]">굵기</label>
          <select
            value={value.style.fontWeight}
            onChange={(e) => updateStyle({ fontWeight: Number(e.target.value) })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
          >
            <option value={400}>Regular</option>
            <option value={500}>Medium</option>
            <option value={600}>SemiBold</option>
            <option value={700}>Bold</option>
            <option value={800}>ExtraBold</option>
            <option value={900}>Black</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs text-[var(--color-text-dim)]">텍스트 색상</label>
        <ColorPickerPopover
          color={value.style.color}
          onChange={(c) => updateStyle({ color: c })}
          label="텍스트 색상"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-dim)]">정렬</label>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => updateStyle({ textAlign: align })}
              className={[
                'flex-1 rounded py-1 text-xs transition',
                value.style.textAlign === align
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] border border-[var(--color-border)]',
              ].join(' ')}
            >
              {align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface Props {
  headline: Caption
  subheadline: Caption
  onHeadlineChange: (c: Caption) => void
  onSubheadlineChange: (c: Caption) => void
}

export function CaptionPanel({
  headline,
  subheadline,
  onHeadlineChange,
  onSubheadlineChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <CaptionField label="헤드라인" value={headline} onChange={onHeadlineChange} />
      <CaptionField label="서브헤드라인" value={subheadline} onChange={onSubheadlineChange} />
    </div>
  )
}
