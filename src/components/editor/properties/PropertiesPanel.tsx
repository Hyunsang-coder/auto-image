import { useState } from 'react'
import type { Slide, TemplateType, Background, Caption } from '../../../types/project'
import { TemplateSelector } from './TemplateSelector'
import { BackgroundPanel } from './BackgroundPanel'
import { CaptionPanel } from './CaptionPanel'

type PanelTab = 'template' | 'background' | 'caption'

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'template', label: '템플릿' },
  { id: 'background', label: '배경' },
  { id: 'caption', label: '캡션' },
]

interface Props {
  slide: Slide
  onTemplateChange: (t: TemplateType) => void
  onBackgroundChange: (bg: Background) => void
  onHeadlineChange: (c: Caption) => void
  onSubheadlineChange: (c: Caption) => void
}

export function PropertiesPanel({
  slide,
  onTemplateChange,
  onBackgroundChange,
  onHeadlineChange,
  onSubheadlineChange,
}: Props) {
  const [tab, setTab] = useState<PanelTab>('template')

  return (
    <aside className="flex flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 py-2.5 text-xs font-medium transition',
              tab === t.id
                ? 'border-b-2 border-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-dim)] hover:text-white',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'template' && (
          <TemplateSelector value={slide.template} onChange={onTemplateChange} />
        )}
        {tab === 'background' && (
          <BackgroundPanel value={slide.background} onChange={onBackgroundChange} />
        )}
        {tab === 'caption' && (
          <CaptionPanel
            headline={slide.headline}
            subheadline={slide.subheadline}
            onHeadlineChange={onHeadlineChange}
            onSubheadlineChange={onSubheadlineChange}
          />
        )}
      </div>
    </aside>
  )
}
