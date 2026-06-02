import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Caption, TemplateType, TextStyle } from '../../../types/project'
import { FONT_OPTIONS, MAX_TEXTS, makeTextBlock } from '../../../constants/defaults'

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
            disabled={value.style.fitToBox}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none disabled:opacity-40"
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

      <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
        <span>박스 너비에 맞춤 <span className="text-[var(--color-text-dim)]">(자동 크기)</span></span>
        <input
          type="checkbox"
          checked={!!value.style.fitToBox}
          onChange={(e) => updateStyle({ fitToBox: e.target.checked })}
          className="accent-[var(--color-accent)]"
        />
      </label>

      <div>
        <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
          <span>줄 간격</span>
          <span>{(value.style.lineHeight ?? 1.2).toFixed(2)}</span>
        </label>
        <input
          type="range"
          min={0.8}
          max={2}
          step={0.05}
          value={value.style.lineHeight ?? 1.2}
          onChange={(e) => updateStyle({ lineHeight: Number(e.target.value) })}
          className="w-full accent-[var(--color-accent)]"
        />
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
  texts: Caption[]
  template: TemplateType
  onChange: (texts: Caption[]) => void
}

export function CaptionPanel({ texts, template, onChange }: Props) {
  function addBlock() {
    onChange([...texts, makeTextBlock(texts.length, template, '')])
  }
  function removeBlock(index: number) {
    onChange(texts.filter((_, i) => i !== index))
  }
  function editBlock(index: number, c: Caption) {
    onChange(texts.map((t, i) => (i === index ? c : t)))
  }

  return (
    <div className="flex flex-col gap-3">
      {texts.map((caption, i) => (
        <div key={i} className="relative">
          <CaptionField
            label={i === 0 ? '제목 (헤드라인)' : `텍스트 ${i + 1}`}
            value={caption}
            onChange={(c) => editBlock(i, c)}
          />
          {texts.length > 1 && (
            <button
              type="button"
              onClick={() => removeBlock(i)}
              title="이 텍스트 블록 삭제"
              className="absolute right-2 top-2 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] transition hover:border-red-500 hover:text-red-500"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addBlock}
        disabled={texts.length >= MAX_TEXTS}
        className="rounded-lg border border-dashed border-[var(--color-border)] py-2 text-xs text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-dim)]"
      >
        텍스트 블록 추가 ({texts.length}/{MAX_TEXTS})
      </button>
    </div>
  )
}
