import type { Step } from '../../types/project'
import { useT } from '../../i18n'

interface Props {
  current: Step
  hasProject: boolean
  onJump: (step: Step) => void
  /** Amber dot on the 에디터 step — some slides have no screenshot. */
  editorIncomplete?: boolean
  /** Amber dot on the 로컬라이즈 step — untranslated target locales remain. */
  localizeIncomplete?: boolean
  /** Tooltip detail for each dot (e.g. counts); the dot itself carries none. */
  editorHint?: string
  localizeHint?: string
}

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: '프로젝트' },
  { id: 2, label: '에디터' },
  { id: 3, label: '로컬라이즈' },
  { id: 4, label: 'Export' },
]

export function StepIndicator({
  current,
  hasProject,
  onJump,
  editorIncomplete,
  localizeIncomplete,
  editorHint,
  localizeHint,
}: Props) {
  const t = useT()
  return (
    <nav className="flex items-center gap-2">
      {STEPS.map((s, idx) => {
        const reachable = s.id === 1 || hasProject
        const active = s.id === current
        const incomplete =
          (s.id === 2 && editorIncomplete) || (s.id === 3 && localizeIncomplete)
        const hint = s.id === 2 ? editorHint : s.id === 3 ? localizeHint : undefined
        return (
          <div key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reachable && onJump(s.id)}
              disabled={!reachable}
              title={hint}
              aria-current={active ? 'step' : undefined}
              className={[
                'flex h-[var(--control-h-lg)] items-center gap-2 rounded-full px-3 text-[length:var(--text-ui)] transition',
                active
                  ? 'bg-[var(--color-accent-strong)] text-[var(--color-accent-on)]'
                  : reachable
                    ? 'bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface-3)]'
                    : 'cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-dim)] opacity-50',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-[length:var(--text-ui-xs)] font-semibold',
                  // Solid inverse, not a tint: a 25% wash over the accent fill
                  // measured 3.34:1 in dark mode. Inverting clears 5.03:1 light
                  // and 5.57:1 dark.
                  active
                    ? 'bg-[var(--color-accent-on)] text-[var(--color-accent-strong)]'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-dim)]',
                ].join(' ')}
              >
                {s.id}
              </span>
              {t(s.label)}
              {/* Dual-coded: the dot repeats what `title` states in words, so the
                  warning never rests on colour alone. */}
              {incomplete && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
                />
              )}
            </button>
            {idx < STEPS.length - 1 && (
              <span aria-hidden className="text-[var(--color-text-dim)]">
                ›
              </span>
            )}
          </div>
        )
      })}
    </nav>
  )
}
