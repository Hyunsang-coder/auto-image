import type { TemplateType } from '../../../types/project'

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
}

export function TemplateSelector({ value, onChange }: Props) {
  return (
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
  )
}
