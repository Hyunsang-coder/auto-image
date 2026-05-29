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
}

export function TemplateSelector({ value, onChange, onApplyTemplate, onSaveTemplate }: Props) {
  const templates = useCustomStore((s) => s.templates)
  const removeTemplate = useCustomStore((s) => s.removeTemplate)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

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
                    onClick={() => onApplyTemplate(t)}
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
