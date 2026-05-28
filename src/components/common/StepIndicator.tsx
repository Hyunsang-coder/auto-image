import type { Step } from '../../types/project'

interface Props {
  current: Step
  hasProject: boolean
  onJump: (step: Step) => void
}

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: '프로젝트' },
  { id: 2, label: '에디터' },
  { id: 3, label: '로컬라이즈' },
  { id: 4, label: 'Export' },
]

export function StepIndicator({ current, hasProject, onJump }: Props) {
  return (
    <nav className="flex items-center gap-2">
      {STEPS.map((s, idx) => {
        const reachable = s.id === 1 || hasProject
        const active = s.id === current
        return (
          <div key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reachable && onJump(s.id)}
              disabled={!reachable}
              className={[
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition',
                active
                  ? 'bg-[var(--color-accent)] text-white'
                  : reachable
                    ? 'bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
                    : 'cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-dim)] opacity-50',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                  active
                    ? 'bg-white/20'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-dim)]',
                ].join(' ')}
              >
                {s.id}
              </span>
              {s.label}
            </button>
            {idx < STEPS.length - 1 && (
              <span className="text-[var(--color-text-dim)]">›</span>
            )}
          </div>
        )
      })}
    </nav>
  )
}
