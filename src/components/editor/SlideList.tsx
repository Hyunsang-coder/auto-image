import { useState } from 'react'
import { Modal } from '../common/Modal'
import type React from 'react'
import type { Slide } from '../../types/project'
import { useProjectStore } from '../../store/useProjectStore'
import { titleText } from '../../constants/defaults'
import { DEVICE_SPECS } from '../../constants/deviceSpecs'
import { useSlideThumbnails } from './useSlideThumbnails'

/** Modifier keys read off the click event to drive selection semantics. */
interface ClickMods {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

interface Props {
  slides: Slide[]
  activeSlideId: string | null
  /** Ephemeral multi-selection (lives in EditorLayout, not the store). */
  selectedIds: Set<string>
  /** Thumbnail click — caller branches on the modifier keys (plain/cmd/shift). */
  onSelect: (id: string, mods: ClickMods) => void
  /** Bulk-remove the given slide ids (clears selection on the caller side). */
  onRemoveSlides: (ids: string[]) => void
  /** When previewing/editing a non-source locale, render that locale's thumbnail
   * (and title) so the list matches the canvas. '' / undefined = base. */
  previewLocale?: string
  /** Thumbnail pixel height — the tray's resize handle drives this. Width follows
   * the device aspect ratio, so height alone sizes every thumb (and the add/link
   * buttons that share its height). */
  thumbHeight?: number
}

const DEFAULT_THUMB_HEIGHT = 168

const MAX_SLIDES = 10

// Aspect ratio of each device's exported PNG — used so the thumbnail box matches
// the rendered image exactly (no letterboxing).
function aspectOf(slide: Slide): string {
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  return `${spec.exportWidth} / ${spec.exportHeight}`
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

export function SlideList({
  slides,
  activeSlideId,
  selectedIds,
  onSelect,
  onRemoveSlides,
  previewLocale,
  thumbHeight = DEFAULT_THUMB_HEIGHT,
}: Props) {
  const addSlide = useProjectStore((s) => s.addSlide)
  const duplicateSlide = useProjectStore((s) => s.duplicateSlide)
  const reorderSlides = useProjectStore((s) => s.reorderSlides)
  const linkSpanWithNext = useProjectStore((s) => s.linkSpanWithNext)
  const unlinkSpan = useProjectStore((s) => s.unlinkSpan)
  const [linkError, setLinkError] = useState<string | null>(null)
  // Pending delete holds the resolved list of slide ids + a human label so the
  // modal can say "delete N slides" without re-deriving anything.
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; title: string } | null>(null)
  // Native HTML5 drag-reorder state. dragId = the slide being dragged; dropTarget
  // = {id, side} of the thumb we'd insert next to. Both null when idle.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const thumbs = useSlideThumbnails(slides, previewLocale ?? '')
  const canAdd = slides.length < MAX_SLIDES
  const rows = buildRows(slides)

  // Drop the dragged slide adjacent to `targetId`, then commit the new linear
  // order to the store (which strips span markers if a leader/follower split).
  function performReorder(targetId: string, side: 'before' | 'after') {
    if (!dragId || dragId === targetId) return
    const ids = slides.map((s) => s.id)
    const from = ids.indexOf(dragId)
    if (from === -1) return
    ids.splice(from, 1)
    let insertAt = ids.indexOf(targetId)
    if (insertAt === -1) return
    if (side === 'after') insertAt += 1
    ids.splice(insertAt, 0, dragId)
    reorderSlides(ids)
  }

  function endDrag() {
    setDragId(null)
    setDropTarget(null)
  }

  // Build the delete request: if the clicked thumb is part of a 2+ multi-select,
  // delete the whole set; otherwise delete just that slide (today's behavior).
  function requestDelete(slideId: string, title: string) {
    const ids =
      selectedIds.size > 1 && selectedIds.has(slideId)
        ? slides.filter((s) => selectedIds.has(s.id)).map((s) => s.id)
        : [slideId]
    const label = ids.length > 1 ? `${ids.length}개 슬라이드` : title
    setPendingDelete({ ids, title: label })
  }

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
              thumbHeight={thumbHeight}
              activeSlideId={activeSlideId}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onUnlink={() => tryUnlink(row.groupId!)}
              dragId={dragId}
              dropTarget={dropTarget}
              onDragStartSlide={setDragId}
              onDragOverSlide={setDropTarget}
              onDropSlide={performReorder}
              onDragEndSlide={endDrag}
            />
          ) : (
            <SingleRow
              slide={row.slides[0]}
              thumb={thumbs[row.slides[0].id]}
              thumbHeight={thumbHeight}
              title={titleText(row.slides[0], previewLocale)}
              active={row.slides[0].id === activeSlideId}
              selected={selectedIds.has(row.slides[0].id)}
              onSelect={(mods) => onSelect(row.slides[0].id, mods)}
              onDuplicate={() => duplicateSlide(row.slides[0].id)}
              canDuplicate={canAdd}
              onDelete={() => requestDelete(row.slides[0].id, titleText(row.slides[0], previewLocale))}
              canDelete={slides.length > 1}
              dragId={dragId}
              dropTarget={dropTarget}
              onDragStartSlide={setDragId}
              onDragOverSlide={setDropTarget}
              onDropSlide={performReorder}
              onDragEndSlide={endDrag}
            />
          )}
          {canLinkAfter(i) && (
            <button
              type="button"
              onClick={() => tryLink(row.slides[0].id)}
              style={{ height: thumbHeight }}
              className="group/link -mx-1 flex w-5 shrink-0 items-center justify-center text-[var(--color-text-dim)] transition hover:text-[var(--color-accent)]"
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
        style={{ height: thumbHeight }}
        className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-dim)]"
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      {pendingDelete && (
        <Modal title="슬라이드 삭제" size="sm" onClose={() => setPendingDelete(null)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              <span className="font-medium text-[var(--color-text)]">{pendingDelete.title}</span>
              {pendingDelete.ids.length > 1 ? '를 삭제합니다.' : ' 슬라이드를 삭제합니다.'} 이 작업은 되돌릴 수 없습니다.
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
                  onRemoveSlides(pendingDelete.ids)
                  setPendingDelete(null)
                }}
                className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                삭제
              </button>
            </div>
        </Modal>
      )}
    </nav>
  )
}

function ThumbImage({
  slide,
  thumb,
  title,
  height,
  selected = false,
}: {
  slide: Slide
  thumb?: string
  title: string
  /** Pixel height set by the tray resize handle; width follows the device aspect. */
  height: number
  /** Selected but not active → show a checkmark corner so it reads as part of a set. */
  selected?: boolean
}) {
  return (
    <div
      className="relative bg-[var(--color-surface-2)]"
      style={{ height, aspectRatio: aspectOf(slide) }}
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
      {selected && (
        <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-bold text-white shadow">
          ✓
        </span>
      )}
    </div>
  )
}

/** Shared drag wiring for a draggable thumb (single slide or a span member). */
interface DragWiring {
  dragId: string | null
  dropTarget: { id: string; side: 'before' | 'after' } | null
  onDragStartSlide: (id: string) => void
  onDragOverSlide: (t: { id: string; side: 'before' | 'after' } | null) => void
  onDropSlide: (targetId: string, side: 'before' | 'after') => void
  onDragEndSlide: () => void
}

/** Compute which side of a thumb the pointer is on for the insertion indicator. */
function sideFromEvent(e: React.DragEvent<HTMLElement>): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
}

function SingleRow({
  slide,
  thumb,
  thumbHeight,
  title,
  active,
  selected,
  onSelect,
  onDuplicate,
  canDuplicate,
  onDelete,
  canDelete,
  dragId,
  dropTarget,
  onDragStartSlide,
  onDragOverSlide,
  onDropSlide,
  onDragEndSlide,
}: {
  slide: Slide
  thumb?: string
  thumbHeight: number
  title: string
  active: boolean
  selected: boolean
  onSelect: (mods: ClickMods) => void
  onDuplicate: () => void
  canDuplicate: boolean
  onDelete: () => void
  canDelete: boolean
} & DragWiring) {
  const dropSide = dropTarget?.id === slide.id ? dropTarget.side : null
  return (
    <div
      className="group relative shrink-0"
      onDragOver={(e) => {
        if (!dragId) return
        e.preventDefault()
        onDragOverSlide({ id: slide.id, side: sideFromEvent(e) })
      }}
      onDrop={(e) => {
        if (!dragId) return
        e.preventDefault()
        onDropSlide(slide.id, sideFromEvent(e))
        onDragEndSlide()
      }}
    >
      <DropIndicator side={dropSide} />
      <button
        type="button"
        draggable
        onDragStart={() => onDragStartSlide(slide.id)}
        onDragEnd={onDragEndSlide}
        onClick={(e) =>
          onSelect({ metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
        }
        title={title}
        aria-label={title}
        className={[
          'block cursor-grab overflow-hidden rounded-lg border text-left transition active:cursor-grabbing',
          dragId === slide.id ? 'opacity-40' : '',
          active
            ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30'
            : selected
              ? 'border-[var(--color-accent)]/60 ring-1 ring-[var(--color-accent)]/40'
              : 'border-[var(--color-border)] hover:border-[var(--color-text-dim)]',
        ].join(' ')}
      >
        <ThumbImage slide={slide} thumb={thumb} title={title} height={thumbHeight} selected={selected && !active} />
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

/** Vertical insertion line shown on the leading/trailing edge of a drop target. */
function DropIndicator({ side }: { side: 'before' | 'after' | null }) {
  if (!side) return null
  return (
    <span
      className={[
        'pointer-events-none absolute top-0 z-20 h-full w-0.5 rounded bg-[var(--color-accent)]',
        side === 'before' ? '-left-1' : '-right-1',
      ].join(' ')}
    />
  )
}

function SpanRow({
  row,
  thumbs,
  thumbHeight,
  activeSlideId,
  selectedIds,
  onSelect,
  onUnlink,
  dragId,
  dropTarget,
  onDragStartSlide,
  onDragOverSlide,
  onDropSlide,
  onDragEndSlide,
}: {
  row: RowItem
  thumbs: Record<string, string | undefined>
  thumbHeight: number
  activeSlideId: string | null
  selectedIds: Set<string>
  onSelect: (id: string, mods: ClickMods) => void
  onUnlink: () => void
} & DragWiring) {
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
        const selected = selectedIds.has(s.id)
        const dropSide = dropTarget?.id === s.id ? dropTarget.side : null
        return (
          <div
            key={s.id}
            className="relative"
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              onDragOverSlide({ id: s.id, side: sideFromEvent(e) })
            }}
            onDrop={(e) => {
              if (!dragId) return
              e.preventDefault()
              onDropSlide(s.id, sideFromEvent(e))
              onDragEndSlide()
            }}
          >
            <DropIndicator side={dropSide} />
            <button
              type="button"
              draggable
              onDragStart={() => onDragStartSlide(s.id)}
              onDragEnd={onDragEndSlide}
              onClick={(e) =>
                onSelect(s.id, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
              }
              title={i === 0 ? '왼쪽 (Leader)' : '오른쪽 (Follower)'}
              className={[
                'block cursor-grab overflow-hidden rounded border transition active:cursor-grabbing',
                dragId === s.id ? 'opacity-40' : '',
                active
                  ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30'
                  : selected
                    ? 'border-[var(--color-accent)]/60 ring-1 ring-[var(--color-accent)]/40'
                    : 'border-[var(--color-border)] hover:border-[var(--color-text-dim)]',
              ].join(' ')}
            >
              <ThumbImage slide={s} thumb={thumbs[s.id]} title={`${s.index + 1}`} height={thumbHeight - 12} selected={selected && !active} />
            </button>
          </div>
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
