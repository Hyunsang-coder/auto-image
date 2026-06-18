import { useState } from 'react'
import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Caption, CaptionBox, TemplateType, TextShadow, TextStyle } from '../../../types/project'
import { CAPTION_FONT_SIZE_MAX, CAPTION_FONT_SIZE_MIN, FONT_OPTIONS, MAX_TEXTS, makeTextBlock } from '../../../constants/defaults'
import { useT } from '../../../i18n'

interface CaptionFieldProps {
  label: string
  value: Caption
  onChange: (c: Caption) => void
}

function SliderRow({ label, value, min, max, step, format, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
        <span>{label}</span>
        <span>{format ? format(value) : value}</span>
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

// Shared editor for a TextShadow — the glyph drop shadow and the box shadow
// carry the same fields, so one control block serves both.
function ShadowControls({ label, value, onChange }: {
  label: string
  value: TextShadow
  onChange: (s: TextShadow) => void
}) {
  const t = useT()
  return (
    <>
      <ColorPickerPopover
        color={value.color}
        onChange={(c) => onChange({ ...value, color: c })}
        label={`${label} ${t('색상')}`}
      />
      <SliderRow
        label={t('불투명도')}
        value={value.opacity}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => onChange({ ...value, opacity: v })}
      />
      <SliderRow
        label={t('가로 위치 (X)')}
        value={value.offsetX}
        min={-20}
        max={20}
        step={1}
        format={(v) => `${v}px`}
        onChange={(v) => onChange({ ...value, offsetX: v })}
      />
      <SliderRow
        label={t('세로 위치 (Y)')}
        value={value.offsetY}
        min={-20}
        max={20}
        step={1}
        format={(v) => `${v}px`}
        onChange={(v) => onChange({ ...value, offsetY: v })}
      />
      <SliderRow
        label={t('흐림')}
        value={value.blur}
        min={0}
        max={40}
        step={1}
        format={(v) => `${v}px`}
        onChange={(v) => onChange({ ...value, blur: v })}
      />
    </>
  )
}

function CaptionField({ label, value, onChange }: CaptionFieldProps) {
  const t = useT()
  const [fontSizeDraft, setFontSizeDraft] = useState(() => ({
    source: value.style.fontSize,
    value: String(value.style.fontSize),
  }))
  const fontSizeValue =
    fontSizeDraft.source === value.style.fontSize
      ? fontSizeDraft.value
      : String(value.style.fontSize)

  function updateStyle(patch: Partial<TextStyle>) {
    onChange({ ...value, style: { ...value.style, ...patch } })
  }
  function updateBox(patch: Partial<CaptionBox>) {
    updateStyle({ box: { ...value.style.box!, ...patch } })
  }
  function updateFontSize(raw: string) {
    setFontSizeDraft({ source: value.style.fontSize, value: raw })
    if (raw.trim() === '') return
    const next = Number(raw)
    if (!Number.isFinite(next) || next < CAPTION_FONT_SIZE_MIN || next > CAPTION_FONT_SIZE_MAX) return
    updateStyle({ fontSize: next })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </p>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('텍스트')}</label>
        <textarea
          rows={2}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('폰트')}</label>
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
          <label className="mb-1 block text-xs text-[var(--color-text-dim)]">
            {value.style.fitToBox ? t('최대 크기') : t('크기')}
          </label>
          <input
            type="number"
            min={CAPTION_FONT_SIZE_MIN}
            max={CAPTION_FONT_SIZE_MAX}
            value={fontSizeValue}
            onChange={(e) => updateFontSize(e.target.value)}
            onBlur={() => setFontSizeDraft({ source: value.style.fontSize, value: String(value.style.fontSize) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('굵기')}</label>
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
        <span>{t('박스 너비에 맞춤')} <span className="text-[var(--color-text-dim)]">{t('(자동 크기)')}</span></span>
        <input
          type="checkbox"
          checked={!!value.style.fitToBox}
          onChange={(e) => updateStyle({ fitToBox: e.target.checked })}
          className="accent-[var(--color-accent)]"
        />
      </label>

      <div>
        <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-dim)]">
          <span>{t('줄 간격')}</span>
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
        <label className="mb-2 block text-xs text-[var(--color-text-dim)]">{t('텍스트 색상')}</label>
        <ColorPickerPopover
          color={value.style.color}
          onChange={(c) => updateStyle({ color: c })}
          label={t('텍스트 색상')}
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
        <span>{t('외곽선')}</span>
        <input
          type="checkbox"
          checked={!!value.style.outline}
          onChange={(e) =>
            updateStyle({ outline: e.target.checked ? { color: '#000000', width: 2 } : undefined })
          }
          className="accent-[var(--color-accent)]"
        />
      </label>
      {value.style.outline && (
        <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-surface-2)] p-2">
          <ColorPickerPopover
            color={value.style.outline.color}
            onChange={(c) => updateStyle({ outline: { ...value.style.outline!, color: c } })}
            label={t('외곽선 색상')}
          />
          <SliderRow
            label={t('굵기')}
            value={value.style.outline.width}
            min={0.5}
            max={10}
            step={0.5}
            format={(v) => `${v}px`}
            onChange={(v) => updateStyle({ outline: { ...value.style.outline!, width: v } })}
          />
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
        <span>{t('그림자')}</span>
        <input
          type="checkbox"
          checked={!!value.style.shadow}
          onChange={(e) =>
            updateStyle({
              shadow: e.target.checked
                ? { color: '#000000', opacity: 0.4, offsetX: 0, offsetY: 4, blur: 8 }
                : undefined,
            })
          }
          className="accent-[var(--color-accent)]"
        />
      </label>
      {value.style.shadow && (
        <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-surface-2)] p-2">
          <ShadowControls
            label={t('그림자')}
            value={value.style.shadow}
            onChange={(s) => updateStyle({ shadow: s })}
          />
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
        <span>{t('박스 배경')}</span>
        <input
          type="checkbox"
          checked={!!value.style.box}
          onChange={(e) =>
            updateStyle({
              box: e.target.checked
                ? { fill: '#000000', opacity: 0.35, paddingX: 16, paddingY: 10, borderRadius: 12 }
                : undefined,
            })
          }
          className="accent-[var(--color-accent)]"
        />
      </label>
      {value.style.box && (
        <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-surface-2)] p-2">
          <ColorPickerPopover
            color={value.style.box.fill}
            onChange={(c) => updateBox({ fill: c })}
            label={t('박스 색상')}
          />
          <SliderRow
            label={t('불투명도')}
            value={value.style.box.opacity}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => updateBox({ opacity: v })}
          />
          <SliderRow
            label={t('가로 패딩')}
            value={value.style.box.paddingX}
            min={0}
            max={60}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => updateBox({ paddingX: v })}
          />
          <SliderRow
            label={t('세로 패딩')}
            value={value.style.box.paddingY}
            min={0}
            max={60}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => updateBox({ paddingY: v })}
          />
          <SliderRow
            label={t('모서리 둥글기')}
            value={value.style.box.borderRadius}
            min={0}
            max={60}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => updateBox({ borderRadius: v })}
          />
          <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
            <span>{t('테두리')}</span>
            <input
              type="checkbox"
              checked={!!value.style.box.border}
              onChange={(e) =>
                updateBox({ border: e.target.checked ? { color: '#FFFFFF', width: 2 } : undefined })
              }
              className="accent-[var(--color-accent)]"
            />
          </label>
          {value.style.box.border && (
            <>
              <ColorPickerPopover
                color={value.style.box.border.color}
                onChange={(c) => updateBox({ border: { ...value.style.box!.border!, color: c } })}
                label={t('테두리 색상')}
              />
              <SliderRow
                label={t('테두리 굵기')}
                value={value.style.box.border.width}
                min={0.5}
                max={10}
                step={0.5}
                format={(v) => `${v}px`}
                onChange={(v) => updateBox({ border: { ...value.style.box!.border!, width: v } })}
              />
            </>
          )}
          <label className="flex cursor-pointer items-center justify-between text-xs text-[var(--color-text)]">
            <span>{t('박스 그림자')}</span>
            <input
              type="checkbox"
              checked={!!value.style.box.shadow}
              onChange={(e) =>
                updateBox({
                  shadow: e.target.checked
                    ? { color: '#000000', opacity: 0.4, offsetX: 0, offsetY: 4, blur: 12 }
                    : undefined,
                })
              }
              className="accent-[var(--color-accent)]"
            />
          </label>
          {value.style.box.shadow && (
            <ShadowControls
              label={t('박스 그림자')}
              value={value.style.box.shadow}
              onChange={(s) => updateBox({ shadow: s })}
            />
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('정렬')}</label>
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
              {align === 'left' ? t('왼쪽') : align === 'center' ? t('가운데') : t('오른쪽')}
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
  bulkEnabled?: boolean
  selectedCount?: number
  slideCount?: number
  onApplyTextStyleToSlides?: (style: Partial<TextStyle>, scope: 'all' | 'selected') => void
}

export function CaptionPanel({ texts, template, onChange, bulkEnabled, selectedCount = 1, slideCount = 1, onApplyTextStyleToSlides }: Props) {
  const t = useT()
  const [bulkStyle, setBulkStyle] = useState<Partial<TextStyle>>({})
  const showBulk = bulkEnabled && onApplyTextStyleToSlides
  function addBlock() {
    onChange([...texts, makeTextBlock(texts.length, template, '')])
  }
  function removeBlock(index: number) {
    onChange(texts.filter((_, i) => i !== index))
  }
  function editBlock(index: number, c: Caption) {
    onChange(texts.map((tb, i) => (i === index ? c : tb)))
  }

  return (
    <div className="flex flex-col gap-3">
      {showBulk && (
        <div className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-[var(--color-accent)]">{t('여러 슬라이드 일괄 스타일')}</p>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('폰트')}</label>
            <select
              value={bulkStyle.fontFamily ?? ''}
              onChange={(e) => setBulkStyle((s) => ({ ...s, fontFamily: e.target.value || undefined }))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
              style={bulkStyle.fontFamily ? { fontFamily: bulkStyle.fontFamily } : undefined}
            >
              <option value="">{t('변경 안 함')}</option>
              {FONT_OPTIONS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('크기')}</label>
              <input
                type="number"
                min={CAPTION_FONT_SIZE_MIN}
                max={CAPTION_FONT_SIZE_MAX}
                placeholder={t('변경 안 함')}
                value={bulkStyle.fontSize ?? ''}
                onChange={(e) => setBulkStyle((s) => ({ ...s, fontSize: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[var(--color-text-dim)]">{t('굵기')}</label>
              <select
                value={bulkStyle.fontWeight ?? ''}
                onChange={(e) => setBulkStyle((s) => ({ ...s, fontWeight: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
              >
                <option value="">{t('변경 안 함')}</option>
                <option value={400}>Regular</option>
                <option value={500}>Medium</option>
                <option value={600}>SemiBold</option>
                <option value={700}>Bold</option>
                <option value={800}>ExtraBold</option>
                <option value={900}>Black</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedCount > 1 && (
              <button
                type="button"
                disabled={Object.keys(bulkStyle).filter((k) => bulkStyle[k as keyof TextStyle] !== undefined).length === 0}
                onClick={() => { onApplyTextStyleToSlides(bulkStyle, 'selected'); setBulkStyle({}) }}
                className="flex-1 rounded-lg bg-[var(--color-accent)] px-2 py-1.5 text-xs text-white disabled:opacity-40 hover:opacity-90"
              >
                {t('선택 {n}개에 적용', { n: selectedCount })}
              </button>
            )}
            <button
              type="button"
              disabled={Object.keys(bulkStyle).filter((k) => bulkStyle[k as keyof TextStyle] !== undefined).length === 0}
              onClick={() => { onApplyTextStyleToSlides(bulkStyle, 'all'); setBulkStyle({}) }}
              className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-dim)] disabled:opacity-40 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('전체 {n}개에 적용', { n: slideCount })}
            </button>
          </div>
        </div>
      )}
      {texts.map((caption, i) => (
        <div key={i} className="relative">
          <CaptionField
            label={i === 0 ? t('제목 (헤드라인)') : t('텍스트 {n}', { n: i + 1 })}
            value={caption}
            onChange={(c) => editBlock(i, c)}
          />
          {texts.length > 1 && (
            <button
              type="button"
              onClick={() => removeBlock(i)}
              title={t('이 텍스트 블록 삭제')}
              className="absolute right-2 top-2 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] transition hover:border-red-500 hover:text-red-500"
            >
              {t('삭제')}
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
        {t('텍스트 블록 추가 ({n}/{max})', { n: texts.length, max: MAX_TEXTS })}
      </button>
    </div>
  )
}
