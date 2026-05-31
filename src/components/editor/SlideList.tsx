import { useState } from 'react'
import type { Slide } from '../../types/project'
import { useProjectStore } from '../../store/useProjectStore'

interface Props {
  slides: Slide[]
  activeSlideId: string | null
  onSelect: (id: string) => void
}

const MAX_SLIDES = 10

interface RowItem {
  kind: 'single' | 'span'
  /** For 'span', exactly two entries (leader, follower). For 'single', one. */
  slides: Slide[]
  /** Group id when kind === 'span'. */
  groupId?: string
}

/**
 * Walk the linear slide list and bucket each span group's leader+follower into
 * a single "span" row. Singles fall through as 'single' rows. Adjacency
 * (leader.index + 1 === follower.index) is guaranteed by the store.
 */
function buildRows(slides: Slide[]): RowItem[] {
  const rows: RowItem[] = []
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    if (s.spanGroupId && s.spanRole === 'leader' && slides[i + 1]?.spanGroupId === s.spanGroupId) {
      rows.push({ kind: 'span', slides: [s, slides[i + 1]], groupId: s.spanGroupId })
      i++
    } else if (s.spanGroupId && s.spanRole === 'follower') {
      // Defensive: stray follower without a preceding leader. Render as single.
      rows.push({ kind: 'single', slides: [s] })
    } else {
      rows.push({ kind: 'single', slides: [s] })
    }
  }
  return rows
}

export function SlideList({ slides, activeSlideId, onSelect }: Props) {
  const addSlide = useProjectStore((s) => s.addSlide)
  const duplicateSlide = useProjectStore((s) => s.duplicateSlide)
  const removeSlide = useProjectStore((s) => s.removeSlide)
  const linkSpanWithNext = useProjectStore((s) => s.linkSpanWithNext)
  const unlinkSpan = useProjectStore((s) => s.unlinkSpan)
  const [linkError, setLinkError] = useState<string | null>(null)
  const canAdd = slides.length < MAX_SLIDES
  const rows = buildRows(slides)

  function tryLink(slideId: string) {
    setLinkError(null)
    const err = linkSpanWithNext(slideId)
    if (err) setLinkError(err)
  }

  function tryUnlink(groupId: string) {
    setLinkError(null)
    void unlinkSpan(groupId)
  }

  /**
   * Whether the gap *below* the given row would allow a new span link. We let
   * the user link the last slide of one row to the first slide of the next row
   * only when both are 'single' (rows[i].kind === 'single' && rows[i+1].kind
   * === 'single') and they share a device model.
   */
  function canLinkAfter(rowIdx: number): boolean {
    const a = rows[rowIdx]
    const b = rows[rowIdx + 1]
    if (!a || !b) return false
    if (a.kind !== 'single' || b.kind !== 'single') return false
    const top = a.slides[0]
    const bot = b.slides[0]
    return top.deviceFrame.model === bot.deviceFrame.model
  }

  return (
    <aside className="overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        슬라이드
      </h3>
      {linkError && (
        <p className="mb-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-700">
          {linkError}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.groupId ?? row.slides[0].id}>
            {row.kind === 'span' ? (
              <SpanRow
                row={row}
                activeSlideId={activeSlideId}
                onSelect={onSelect}
                onUnlink={() => tryUnlink(row.groupId!)}
              />
            ) : (
              <SingleRow
                slide={row.slides[0]}
                active={row.slides[0].id === activeSlideId}
                onSelect={() => onSelect(row.slides[0].id)}
                onDuplicate={() => duplicateSlide(row.slides[0].id)}
                canDuplicate={canAdd}
                onDelete={() => void removeSlide(row.slides[0].id)}
                canDelete={slides.length > 1}
              />
            )}
            {canLinkAfter(i) && (
              <button
                type="button"
                onClick={() => tryLink(row.slides[0].id)}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-dashed border-[var(--color-border)] py-0.5 text-[10px] text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
                title="아래 슬라이드와 한 장으로 묶기"
              >
                🔗 다음 슬라이드와 연결
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addSlide}
        disabled={!canAdd}
        title={canAdd ? '슬라이드 추가' : `최대 ${MAX_SLIDES}장까지 추가할 수 있습니다`}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-dim)]"
      >
        <span className="text-base leading-none">+</span>
        <span>슬라이드 추가</span>
      </button>
    </aside>
  )
}

function SingleRow({
  slide,
  active,
  onSelect,
  onDuplicate,
  canDuplicate,
  onDelete,
  canDelete,
}: {
  slide: Slide
  active: boolean
  onSelect: () => void
  onDuplicate: () => void
  canDuplicate: boolean
  onDelete: () => void
  canDelete: boolean
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={[
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 pr-16 text-left text-sm transition',
          active
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-dim)]',
        ].join(' ')}
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-text-dim)]">
          {slide.index + 1}
        </span>
        <span className="truncate">
          {slide.headline.text || `슬라이드 ${slide.index + 1}`}
        </span>
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        disabled={!canDuplicate}
        title={canDuplicate ? '슬라이드 복제' : `최대 ${MAX_SLIDES}장까지 추가할 수 있습니다`}
        className="absolute right-8 top-1/2 hidden -translate-y-1/2 rounded p-1.5 text-xs leading-none text-[var(--color-text-dim)] transition hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 group-hover:block"
      >
        ⧉
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        title={canDelete ? '슬라이드 삭제' : '마지막 슬라이드는 삭제할 수 없습니다'}
        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1.5 text-xs leading-none text-[var(--color-text-dim)] transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 group-hover:block"
      >
        🗑
      </button>
    </div>
  )
}

function SpanRow({
  row,
  activeSlideId,
  onSelect,
  onUnlink,
}: {
  row: RowItem
  activeSlideId: string | null
  onSelect: (id: string) => void
  onUnlink: () => void
}) {
  const [leader, follower] = row.slides
  const groupActive =
    activeSlideId === leader.id || activeSlideId === follower.id
  return (
    <div
      className={[
        'rounded-lg border bg-[var(--color-surface-2)] p-1.5',
        groupActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
          : 'border-[var(--color-border)]',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-[var(--color-text-dim)]">
        <span>🔗 2-page span</span>
        <button
          type="button"
          onClick={onUnlink}
          className="rounded px-1 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          title="그룹 해제 — 두 장으로 분리"
        >
          해제
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[leader, follower].map((s, i) => {
          const active = s.id === activeSlideId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={[
                'flex flex-col items-start gap-0.5 rounded border px-1.5 py-1 text-left text-xs transition',
                active
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)]',
              ].join(' ')}
              title={i === 0 ? '왼쪽 (Leader)' : '오른쪽 (Follower)'}
            >
              <span className="text-[10px] font-semibold opacity-70">
                {s.index + 1} · {i === 0 ? 'L' : 'R'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
