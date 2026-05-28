import { useState } from 'react'
import { ColorPickerPopover } from '../../common/ColorPickerPopover'
import type { Background } from '../../../types/project'

interface Props {
  value: Background
  onChange: (bg: Background) => void
}

export function BackgroundPanel({ value, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<'solid' | 'gradient'>(
    value.type === 'gradient' ? 'gradient' : 'solid',
  )

  function switchTab(tab: 'solid' | 'gradient') {
    setActiveTab(tab)
    if (tab === 'solid') {
      const color = value.color ?? value.gradient?.stops[0]?.color ?? '#6366F1'
      onChange({ type: 'solid', color })
    } else {
      const color1 = value.color ?? value.gradient?.stops[0]?.color ?? '#6366F1'
      const color2 = value.gradient?.stops[1]?.color ?? '#4F46E5'
      onChange({
        type: 'gradient',
        gradient: {
          direction: value.gradient?.direction ?? 180,
          stops: [
            { color: color1, position: 0 },
            { color: color2, position: 1 },
          ],
        },
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab toggle */}
      <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
        {(['solid', 'gradient'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => switchTab(tab)}
            className={[
              'flex-1 py-1.5 text-xs font-medium transition',
              activeTab === tab
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-white',
            ].join(' ')}
          >
            {tab === 'solid' ? '단색' : '그라데이션'}
          </button>
        ))}
      </div>

      {activeTab === 'solid' && (
        <div>
          <label className="mb-2 block text-xs text-[var(--color-text-dim)]">배경색</label>
          <ColorPickerPopover
            color={value.color ?? '#6366F1'}
            onChange={(c) => onChange({ type: 'solid', color: c })}
            label="배경색 선택"
          />
        </div>
      )}

      {activeTab === 'gradient' && value.gradient && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-2 block text-xs text-[var(--color-text-dim)]">시작 색상</label>
            <ColorPickerPopover
              color={value.gradient.stops[0]?.color ?? '#6366F1'}
              onChange={(c) =>
                onChange({
                  type: 'gradient',
                  gradient: {
                    ...value.gradient!,
                    stops: [
                      { color: c, position: 0 },
                      value.gradient!.stops[1] ?? { color: '#4F46E5', position: 1 },
                    ],
                  },
                })
              }
              label="시작 색상"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs text-[var(--color-text-dim)]">끝 색상</label>
            <ColorPickerPopover
              color={value.gradient.stops[1]?.color ?? '#4F46E5'}
              onChange={(c) =>
                onChange({
                  type: 'gradient',
                  gradient: {
                    ...value.gradient!,
                    stops: [
                      value.gradient!.stops[0] ?? { color: '#6366F1', position: 0 },
                      { color: c, position: 1 },
                    ],
                  },
                })
              }
              label="끝 색상"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-dim)]">
              방향: {value.gradient.direction}°
            </label>
            <input
              type="range"
              min={0}
              max={360}
              value={value.gradient.direction}
              onChange={(e) =>
                onChange({
                  type: 'gradient',
                  gradient: {
                    ...value.gradient!,
                    direction: Number(e.target.value),
                  },
                })
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        </div>
      )}
    </div>
  )
}
