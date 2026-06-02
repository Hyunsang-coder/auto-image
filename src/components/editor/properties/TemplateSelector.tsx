import { useState } from 'react'
import type { SlideTemplate, TemplateType } from '../../../types/project'
import { useCustomStore } from '../../../store/useCustomStore'

const TEMPLATES: { id: TemplateType; label: string; desc: string }[] = [
  { id: 'hero',         label: 'Hero',        desc: '텍스트만, 중앙' },
  { id: 'hero-bleed',   label: 'Hero Bleed',  desc: '텍스트 좌측 + 이미지 우측 블리드' },
  { id: 'text-top',     label: 'Text Top',    desc: '텍스트 상단, 기기 하단' },
  { id: 'text-bottom',  label: 'Text Bottom', desc: '기기 상단, 텍스트 하단' },
  { id: 'split',        label: 'Split',       desc: '텍스트 좌측, 기기 우측' },
]

interface Props {
  value: TemplateType
  onChange: (t: TemplateType) => void
  onApplyTemplate: (tpl: SlideTemplate) => void
  onSaveTemplate: (name: string) => void
  /** Bulk apply is off in locale mode (base-only operation). */
  bulkEnabled?: boolean
  /** Live multi-selection size (includes the active slide). */
  selectedCount?: number
  /** Total base slides — the "전체" target count. */
  slideCount?: number
  onApplyTemplateToSlides?: (tpl: SlideTemplate, scope: 'all' | 'selected') => void
}

type ApplyScope = 'this' | 'all' | 'selected'

export function TemplateSelector({
  value,
  onChange,
  onApplyTemplate,
  onSaveTemplate,
  bulkEnabled = false,
  selectedCount = 0,
  slideCount = 0,
  onApplyTemplateToSlides,
}: Props) {
  const templates = useCustomStore((s) => s.templates)
  const removeTemplate = useCustomStore((s) => s.removeTemplate)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  // Bulk apply scope; mirrors BackgroundPanel. Default 'this' = unchanged.
  const [scope, setScope] = useState<ApplyScope>('this')
  const [pendingTpl, setPendingTpl] = useState<SlideTemplate | null>(null)

  const showBulk = bulkEnabled && !!onApplyTemplateToSlides && slideCount > 1
  const bulkScope: 'all' | 'selected' | null =
    scope === 'all' ? 'all' : scope === 'selected' && selectedCount >= 2 ? 'selected' : null
  const bulkCount = bulkScope === 'all' ? slideCount : selectedCount

  function handleApplyClick(tpl: SlideTemplate) {
    if (bulkScope && onApplyTemplateToSlides) {
      setPendingTpl(tpl)
      return
    }
    onApplyTemplate(tpl)
  }

  function confirmBulk() {
    if (pendingTpl && bulkScope && onApplyTemplateToSlides) {
      onApplyTemplateToSlides(pendingTpl, bulkScope)
    }
    setPendingTpl(null)
  }

  function commit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onSaveTemplate(trimmed)
    setName('')
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {TEMPLATES.map((t) => {
          const active = t.id === value
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={[
                'rounded-lg border px-3 py-2 text-left text-sm transition',
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]',
              ].join(' ')}
            >
              <div className="font-medium">{t.label}</div>
              <div className="text-xs opacity-70">{t.desc}</div>
            </button>
          )
        })}
      </div>

      <div className="border-t border-[var(--color-border)] pt-3">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          내 템플릿
        </label>

        {showBulk && templates.length > 0 && (
          <div className="mb-2 flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {([
              ['this', '이 슬라이드'],
              ['all', '전체'],
              ...(selectedCount >= 2 ? [['selected', `선택 ${selectedCount}개`] as const] : []),
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={[
                  'flex-1 py-1.5 text-xs font-medium transition',
                  scope === id
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {showBulk && pendingTpl && bulkScope && (
          <div className="mb-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface-2)] p-2 text-xs">
            <p className="mb-2 text-[var(--color-text)]">
              {bulkCount}개 슬라이드에 적용할까요?{' '}
              <span className="text-[var(--color-text-dim)]">되돌리기 불가</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmBulk}
                className="flex-1 rounded-md bg-[var(--color-accent)] py-1 font-semibold text-white hover:brightness-110"
              >
                적용
              </button>
              <button
                type="button"
                onClick={() => setPendingTpl(null)}
                className="flex-1 rounded-md border border-[var(--color-border)] py-1 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {templates.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-[var(--color-text)]">
                  {t.label}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyClick(t)}
                    className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    적용
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTemplate(t.id)}
                    title="템플릿 삭제"
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-red-400 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {saving ? (
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setSaving(false)
              }}
              maxLength={40}
              placeholder="템플릿 이름"
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={commit}
              className="shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              저장
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="w-full rounded-md border border-dashed border-[var(--color-border)] py-1.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
          >
            + 현재 슬라이드를 템플릿으로 저장
          </button>
        )}
      </div>
    </div>
  )
}
