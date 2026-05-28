import type { Slide } from '../../types/project'
import { useProjectStore } from '../../store/useProjectStore'

interface Props {
  slides: Slide[]
  activeSlideId: string | null
  onSelect: (id: string) => void
}

const MAX_SLIDES = 10

export function SlideList({ slides, activeSlideId, onSelect }: Props) {
  const addSlide = useProjectStore((s) => s.addSlide)
  const canAdd = slides.length < MAX_SLIDES

  return (
    <aside className="overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        슬라이드
      </h3>
      <ul className="flex flex-col gap-2">
        {slides.map((s, i) => {
          const active = s.id === activeSlideId
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={[
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-white'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-dim)]',
                ].join(' ')}
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-text-dim)]">
                  {i + 1}
                </span>
                <span className="truncate">
                  {s.headline.text || `슬라이드 ${i + 1}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={addSlide}
        disabled={!canAdd}
        title={canAdd ? '슬라이드 추가' : `최대 ${MAX_SLIDES}장까지 추가할 수 있습니다`}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-dim)]"
      >
        <span className="text-base leading-none">+</span>
        <span>슬라이드 추가</span>
      </button>
    </aside>
  )
}
