import { useState } from 'react'
import type { Slide } from '../../types/project'
import { useProjectStore } from '../../store/useProjectStore'
import { useSlideThumbnails } from './useSlideThumbnails'

interface Props {
  slides: Slide[]
  activeSlideId: string | null
  onSelect: (id: string) => void
  /** When previewing/editing a non-source locale, render that locale's thumbnail
   * (and title) so the list matches the canvas. '' / undefined = base. */
  previewLocale?: string
}

const MAX_SLIDES = 10

// Aspect ratio of each device's exported PNG — used so the thumbnail box matches
// the rendered image exactly (no letterboxing).
function aspectOf(slide: Slide): string {
  return slide.deviceFrame.model === 'ipad-pro-13' ? '2048 / 2732' : '1284 / 2778'
}

function slideTitle(slide: Slide, locale?: string): string {
  const text = locale
    ? slide.headline.translations?.[locale] ?? slide.headline.text
    : slide.headline.text
  return text || `슬라이드 ${slide.index + 1}`
}

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

export function SlideList({ slides, activeSlideId, onSelect, previewLocale }: Props) {
  const addSlide = useProjectStore((s) => s.addSlide)
  const duplicateSlide = useProjectStore((s) => s.duplicateSlide)
  const removeSlide = useProjectStore((s) => s.removeSlide)
  const linkSpanWithNext = useProjectStore((s) => s.linkSpanWithNext)
  const unlinkSpan = useProjectStore((s) => s.unlinkSpan)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const thumbs = useSlideThumbnails(slides, previewLocale ?? '')
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
    <nav className="relative flex flex-row items-center gap-2 overflow-x-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {linkError && (
        <p className="absolute left-3 top-1 z-10 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-700">
          {linkError}
        </p>
      )}
      {rows.map((row, i) => (
        <div key={row.groupId ?? row.slides[0].id} className="flex shrink-0 items-center gap-2">
          {row.kind === 'span' ? (
            <SpanRow
              row={row}
              thumbs={thumbs}
              activeSlideId={activeSlideId}
              onSelect={onSelect}
              onUnlink={() => tryUnlink(row.groupId!)}
            />
          ) : (
            <SingleRow
              slide={row.slides[0]}
              thumb={thumbs[row.slides[0].id]}
              title={slideTitle(row.slides[0], previewLocale)}
              active={row.slides[0].id === activeSlideId}
              onSelect={() => onSelect(row.slides[0].id)}
              onDuplicate={() => duplicateSlide(row.slides[0].id)}
              canDuplicate={canAdd}
              onDelete={() =>
                setPendingDelete({
                  id: row.slides[0].id,
                  title: slideTitle(row.slides[0], previewLocale),
                })
              }
              canDelete={slides.length > 1}
            />
          )}
          {canLinkAfter(i) && (
            <button
              type="button"
              onClick={() => tryLink(row.slides[0].id)}
              className="group/link -mx-1 flex h-32 w-5 shrink-0 items-center justify-center text-[var(--color-text-dim)] transition hover:text-[var(--color-accent)]"
              title="옆 슬라이드와 한 장으로 묶기"
            >
              <span className="opacity-0 transition group-hover/link:opacity-100">🔗</span>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addSlide}
        disabled={!canAdd}
        title={canAdd ? '슬라이드 추가' : `최대 ${MAX_SLIDES}장까지 추가할 수 있습니다`}
        className="flex h-32 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-dim)]"
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-text)]">슬라이드 삭제</h3>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              <span className="font-medium text-[var(--color-text)]">{pendingDelete.title}</span>{' '}
              슬라이드를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void removeSlide(pendingDelete.id)
                  setPendingDelete(null)
                }}
                className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

function ThumbImage({ slide, thumb, title }: { slide: Slide; thumb?: string; title: string }) {
  return (
    <div
      className="relative h-32 bg-[var(--color-surface-2)]"
      style={{ aspectRatio: aspectOf(slide) }}
    >
      {thumb ? (
        <img src={thumb} alt={title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--color-text-dim)]">
          …
        </div>
      )}
      <span className="absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[10px] font-semibold text-white">
        {slide.index + 1}
      </span>
    </div>
  )
}

function SingleRow({
  slide,
  thumb,
  title,
  active,
  onSelect,
  onDuplicate,
  canDuplicate,
  onDelete,
  canDelete,
}: {
  slide: Slide
  thumb?: string
  title: string
  active: boolean
  onSelect: () => void
  onDuplicate: () => void
  canDuplicate: boolean
  onDelete: () => void
  canDelete: boolean
}) {
  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        title={title}
        aria-label={title}
        className={[
          'block overflow-hidden rounded-lg border text-left transition',
          active
            ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30'
            : 'border-[var(--color-border)] hover:border-[var(--color-text-dim)]',
        ].join(' ')}
      >
        <ThumbImage slide={slide} thumb={thumb} title={title} />
      </button>
      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
        <button
          type="button"
          onClick={onDuplicate}
          disabled={!canDuplicate}
          title={canDuplicate ? '슬라이드 복제' : `최대 ${MAX_SLIDES}장까지 추가할 수 있습니다`}
          className="rounded bg-black/55 p-1 text-xs leading-none text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⧉
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? '슬라이드 삭제' : '마지막 슬라이드는 삭제할 수 없습니다'}
          className="rounded bg-black/55 p-1 text-xs leading-none text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function SpanRow({
  row,
  thumbs,
  activeSlideId,
  onSelect,
  onUnlink,
}: {
  row: RowItem
  thumbs: Record<string, string | undefined>
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
        'group relative flex shrink-0 items-center gap-1 rounded-lg border bg-[var(--color-surface-2)] p-1.5',
        groupActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
          : 'border-[var(--color-border)]',
      ].join(' ')}
      title="🔗 2-page span"
    >
      {[leader, follower].map((s, i) => {
        const active = s.id === activeSlideId
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            title={i === 0 ? '왼쪽 (Leader)' : '오른쪽 (Follower)'}
            className={[
              'block overflow-hidden rounded border transition',
              active
                ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30'
                : 'border-[var(--color-border)] hover:border-[var(--color-text-dim)]',
            ].join(' ')}
          >
            <ThumbImage slide={s} thumb={thumbs[s.id]} title={`${s.index + 1}`} />
          </button>
        )
      })}
      <button
        type="button"
        onClick={onUnlink}
        className="absolute right-1 top-1 hidden rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-none text-white transition hover:bg-black/75 group-hover:block"
        title="그룹 해제 — 두 장으로 분리"
      >
        해제
      </button>
    </div>
  )
}
