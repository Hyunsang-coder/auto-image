import { useProjectStore } from '../../store/useProjectStore'

export function EditorLayout() {
  const project = useProjectStore((s) => s.project)
  const activeSlideId = useProjectStore((s) => s.activeSlideId)
  const setActiveSlide = useProjectStore((s) => s.setActiveSlide)

  if (!project) return null
  const slide = project.slides.find((s) => s.id === activeSlideId)

  return (
    <div className="grid h-full grid-cols-[200px_1fr_320px] gap-0 border-t border-[var(--color-border)]">
      <aside className="overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          슬라이드
        </h3>
        <ul className="flex flex-col gap-2">
          {project.slides.map((s, i) => {
            const active = s.id === activeSlideId
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveSlide(s.id)}
                  className={[
                    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-white'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-dim)]',
                  ].join(' ')}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-text-dim)]">
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
      </aside>

      <main className="flex items-center justify-center bg-[var(--color-bg)] p-6">
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center text-[var(--color-text-dim)]">
          <p className="text-sm">
            Phase 2: Fabric.js 캔버스 영역 (이후 구현)
          </p>
          {slide && (
            <p className="mt-2 text-xs">
              현재 슬라이드: <span className="text-white">{slide.headline.text}</span>
            </p>
          )}
        </div>
      </main>

      <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          속성
        </h3>
        <p className="text-sm text-[var(--color-text-dim)]">
          Phase 2~3에서 템플릿/배경/캡션/배지/하이라이트 패널이 들어갑니다.
        </p>
      </aside>
    </div>
  )
}
