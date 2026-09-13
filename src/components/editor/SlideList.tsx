import { memo, useRef, useState } from 'react'
import { Modal } from '../common/Modal'
import { buildRows, type RowItem } from './slideRows'
import type React from 'react'
import type { Slide } from '../../types/project'
import { useProjectStore } from '../../store/useProjectStore'
import { useDocumentStore } from '../../lib/documentIO'
import { titleText } from '../../constants/defaults'
import { DEVICE_SPECS } from '../../constants/deviceSpecs'
import { useT } from '../../i18n'

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
  /** slideId → object URL. Rendered once by the caller and shared with the
   *  canvas board, so the set is not rendered twice. */
  thumbs: Record<string, string | undefined>
}

const DEFAULT_THUMB_HEIGHT = 168

const MAX_SLIDES = 10

// Aspect ratio of each device's exported PNG — used so the thumbnail box matches
// the rendered image exactly (no letterboxing).
function aspectOf(slide: Slide): string {
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  return `${spec.exportWidth} / ${spec.exportHeight}`
}

// Memoized: the tray re-renders only when its data props change. The caller
// stabilizes the derived props (selection set, callbacks) so zoom/panel-only
// renders skip the whole list.
export const SlideList = memo(function SlideList({
  slides,
  activeSlideId,
  selectedIds,
  onSelect,
  onRemoveSlides,
  previewLocale,
  thumbHeight = DEFAULT_THUMB_HEIGHT,
  thumbs,
}: Props) {
  const t = useT()
  const addSlide = useProjectStore((s) => s.addSlide)
  const duplicateSlide = useProjectStore((s) => s.duplicateSlide)
  const reorderSlides = useProjectStore((s) => s.reorderSlides)
  const linkSpanWithNext = useProjectStore((s) => s.linkSpanWithNext)
  const unlinkSpan = useProjectStore((s) => s.unlinkSpan)
  const [linkError, setLinkError] = useState<string | null>(null)
  // Pending delete holds the resolved list of slide ids + a human label so the
  // modal can say "delete N slides" without re-deriving anything.
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; title: string } | null>(null)
  // Pointer-based reorder drag. dragId = the slide being dragged; dropTarget
  // = {id, side} of the thumb we'd insert next to. Both null when idle.
  // Deliberately NOT HTML5 DnD: a dataTransfer drag is claimed by the desktop
  // shell's OS drop handler, so it never completes there. Pointer events carry
  // no OS payload and behave identically on web and desktop.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  // Pressed-but-maybe-just-clicking. Flips to a real drag past the threshold;
  // a drag always ends with a click event, which the flag swallows.
  const gestureRef = useRef<{ id: string; startX: number; startY: number; active: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const canAdd = slides.length < MAX_SLIDES
  const rows = buildRows(slides)

  // Which thumb (if any) is under the pointer, and on which half — drives the
  // insertion indicator during a drag and the commit on release.
  function targetFromPoint(clientX: number, clientY: number): { id: string; side: 'before' | 'after' } | null {
    const el = document.elementFromPoint(clientX, clientY)
    const thumb = el?.closest?.('[data-slide-id]')
    if (!thumb) return null
    const id = thumb.getAttribute('data-slide-id')
    if (!id) return null
    const rect = thumb.getBoundingClientRect()
    return { id, side: clientX - rect.left < rect.width / 2 ? 'before' : 'after' }
  }

  function onThumbPointerDown(id: string, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gestureRef.current = { id, startX: e.clientX, startY: e.clientY, active: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onThumbPointerMove(id: string, e: React.PointerEvent<HTMLButtonElement>) {
    const g = gestureRef.current
    if (!g || g.id !== id) return
    if (!g.active) {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (dx * dx + dy * dy < 36) return
      g.active = true
      setDragId(id)
      // Desktop: tell the document shell this is an in-page drag so the OS
      // file-drop handler ignores it (no error modal) and the file-drop
      // overlay stays down.
      useDocumentStore.getState().set({ internalDrag: true })
    }
    const t = targetFromPoint(e.clientX, e.clientY)
    setDropTarget((prev) =>
      prev?.id === t?.id && prev?.side === t?.side ? prev : t,
    )
  }

  function onThumbPointerUp(id: string, e: React.PointerEvent<HTMLButtonElement>) {
    const g = gestureRef.current
    gestureRef.current = null
    if (!g || g.id !== id || !g.active) return
    suppressClickRef.current = true
    const t = targetFromPoint(e.clientX, e.clientY)
    if (t && t.id !== id) performReorder(id, t.id, t.side)
    else endDrag()
  }

  function onThumbPointerCancel(id: string) {
    if (gestureRef.current?.id === id) {
      gestureRef.current = null
      endDrag()
    }
  }

  function onThumbClick(id: string, mods: ClickMods) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSelect(id, mods)
  }

  // One-step move for the arrow buttons (keyboard/focus accessible fallback so
  // reorder never depends on a pointer drag succeeding).
  function moveSlide(id: string, dir: -1 | 1) {
    const ids = slides.map((s) => s.id)
    const from = ids.indexOf(id)
    const to = from + dir
    if (from === -1 || to < 0 || to >= ids.length) return
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    reorderSlides(ids)
  }

  // A span pair moves as one block so the leader/follower stay adjacent (moving
  // a single half would strip the group in reorderSlides).
  function moveGroup(groupId: string, dir: -1 | 1) {
    const ids = slides.map((s) => s.id)
    const idx = slides.flatMap((s, i) => (s.spanGroupId === groupId ? [i] : []))
    if (idx.length !== 2 || idx[1] !== idx[0] + 1) return
    const [a] = idx
    if (dir === -1 && a === 0) return
    if (dir === 1 && a + 2 >= ids.length) return
    const block = ids.splice(a, 2)
    ids.splice(dir === -1 ? a - 1 : a + 1, 0, ...block)
    reorderSlides(ids)
  }

  // Drop the dragged slide adjacent to `targetId`, then commit the new linear
  // order to the store (which strips span markers if a leader/follower split).
  function performReorder(fromId: string, targetId: string, side: 'before' | 'after') {
    if (fromId === targetId) {
      endDrag()
      return
    }
    const ids = slides.map((s) => s.id)
    const from = ids.indexOf(fromId)
    if (from === -1) {
      endDrag()
      return
    }
    ids.splice(from, 1)
    let insertAt = ids.indexOf(targetId)
    if (insertAt === -1) {
      endDrag()
      return
    }
    if (side === 'after') insertAt += 1
    ids.splice(insertAt, 0, fromId)
    reorderSlides(ids)
    endDrag()
  }

  function endDrag() {
    setDragId(null)
    setDropTarget(null)
    useDocumentStore.getState().set({ internalDrag: false })
  }

  // Build the delete request: if the clicked thumb is part of a 2+ multi-select,
  // delete the whole set; otherwise delete just that slide (today's behavior).
  function requestDelete(slideId: string, title: string) {
    const ids =
      selectedIds.size > 1 && selectedIds.has(slideId)
        ? slides.filter((s) => selectedIds.has(s.id)).map((s) => s.id)
        : [slideId]
    const label = ids.length > 1 ? t('{n}개 슬라이드', { n: ids.length }) : title
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
    <nav
      className="relative flex flex-row items-center gap-2 overflow-x-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      aria-label={t('슬라이드 순서')}
    >
      {linkError && (
        <p className="absolute left-3 top-1 z-10 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/12 px-2 py-0.5 text-xs text-[var(--color-warning)]">
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
              onUnlink={() => tryUnlink(row.groupId!)}
              dragId={dragId}
              dropTarget={dropTarget}
              onThumbPointerDown={onThumbPointerDown}
              onThumbPointerMove={onThumbPointerMove}
              onThumbPointerUp={onThumbPointerUp}
              onThumbPointerCancel={onThumbPointerCancel}
              onThumbClick={onThumbClick}
              onMoveGroup={(dir) => moveGroup(row.groupId!, dir)}
              canMovePrev={slides.findIndex((s) => s.spanGroupId === row.groupId) > 0}
              canMoveNext={
                slides.findIndex((s) => s.spanGroupId === row.groupId) + 2 < slides.length
              }
            />
          ) : (
            <SingleRow
              slide={row.slides[0]}
              thumb={thumbs[row.slides[0].id]}
              thumbHeight={thumbHeight}
              title={titleText(row.slides[0], previewLocale)}
              active={row.slides[0].id === activeSlideId}
              selected={selectedIds.has(row.slides[0].id)}
              onDuplicate={() => duplicateSlide(row.slides[0].id)}
              canDuplicate={canAdd}
              onDelete={() => requestDelete(row.slides[0].id, titleText(row.slides[0], previewLocale))}
              canDelete={slides.length > 1}
              dragId={dragId}
              dropTarget={dropTarget}
              onThumbPointerDown={onThumbPointerDown}
              onThumbPointerMove={onThumbPointerMove}
              onThumbPointerUp={onThumbPointerUp}
              onThumbPointerCancel={onThumbPointerCancel}
              onThumbClick={onThumbClick}
              onMove={(dir) => moveSlide(row.slides[0].id, dir)}
              canMovePrev={slides.findIndex((s) => s.id === row.slides[0].id) > 0}
              canMoveNext={
                slides.findIndex((s) => s.id === row.slides[0].id) < slides.length - 1
              }
            />
          )}
          {canLinkAfter(i) && (
            <button
              type="button"
              onClick={() => tryLink(row.slides[0].id)}
              style={{ height: thumbHeight }}
              className="group/link -mx-1 flex w-5 shrink-0 items-center justify-center text-[var(--color-text-dim)] transition hover:text-[var(--color-accent-strong)]"
              title={t('옆 슬라이드와 한 장으로 묶기')}
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
        title={canAdd ? t('슬라이드 추가') : t('최대 {n}장까지 추가할 수 있습니다', { n: MAX_SLIDES })}
        style={{ height: thumbHeight }}
        className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-dim)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-dim)]"
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      {pendingDelete && (
        <Modal title={t('슬라이드 삭제')} size="sm" onClose={() => setPendingDelete(null)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              <span className="font-medium text-[var(--color-text)]">{pendingDelete.title}</span>
              {pendingDelete.ids.length > 1 ? t('를 삭제합니다.') : t(' 슬라이드를 삭제합니다.')} {t('이 작업은 되돌릴 수 없습니다.')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                {t('취소')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveSlides(pendingDelete.ids)
                  setPendingDelete(null)
                }}
                className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger-on)] hover:brightness-110"
              >
                {t('삭제')}
              </button>
            </div>
        </Modal>
      )}
    </nav>
  )
})

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
        <img src={thumb} alt={title} draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--color-text-dim)]">
          …
        </div>
      )}
      <span className="absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[10px] font-semibold text-white">
        {slide.index + 1}
      </span>
      {selected && (
        <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent-strong)] text-[10px] font-bold text-[var(--color-accent-on)] shadow">
          ✓
        </span>
      )}
    </div>
  )
}

/** Shared pointer-drag wiring for a thumb (single slide or a span member). */
interface ThumbDragWiring {
  dragId: string | null
  dropTarget: { id: string; side: 'before' | 'after' } | null
  onThumbPointerDown: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void
  onThumbPointerMove: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void
  onThumbPointerUp: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void
  onThumbPointerCancel: (id: string) => void
  onThumbClick: (id: string, mods: ClickMods) => void
}

function SingleRow({
  slide,
  thumb,
  thumbHeight,
  title,
  active,
  selected,
  onDuplicate,
  canDuplicate,
  onDelete,
  canDelete,
  dragId,
  dropTarget,
  onThumbPointerDown,
  onThumbPointerMove,
  onThumbPointerUp,
  onThumbPointerCancel,
  onThumbClick,
  onMove,
  canMovePrev,
  canMoveNext,
}: {
  slide: Slide
  thumb?: string
  thumbHeight: number
  title: string
  active: boolean
  selected: boolean
  onDuplicate: () => void
  canDuplicate: boolean
  onDelete: () => void
  canDelete: boolean
  onMove: (dir: -1 | 1) => void
  canMovePrev: boolean
  canMoveNext: boolean
} & ThumbDragWiring) {
  const t = useT()
  const dropSide = dropTarget?.id === slide.id ? dropTarget.side : null
  return (
    <div className="group relative shrink-0">
      <DropIndicator side={dropSide} />
      <button
        type="button"
        data-slide-thumb
        data-slide-id={slide.id}
        onPointerDown={(e) => onThumbPointerDown(slide.id, e)}
        onPointerMove={(e) => onThumbPointerMove(slide.id, e)}
        onPointerUp={(e) => onThumbPointerUp(slide.id, e)}
        onPointerCancel={() => onThumbPointerCancel(slide.id)}
        onClick={(e) =>
          onThumbClick(slide.id, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
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
      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex group-focus-within:flex">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={!canMovePrev}
          title={t('앞으로 이동')}
          aria-label={t('앞으로 이동')}
          className="rounded bg-black/55 p-1 text-xs leading-none text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={!canMoveNext}
          title={t('뒤로 이동')}
          aria-label={t('뒤로 이동')}
          className="rounded bg-black/55 p-1 text-xs leading-none text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={!canDuplicate}
          title={canDuplicate ? t('슬라이드 복제') : t('최대 {n}장까지 추가할 수 있습니다', { n: MAX_SLIDES })}
          className="rounded bg-black/55 p-1 text-xs leading-none text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⧉
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? t('슬라이드 삭제') : t('마지막 슬라이드는 삭제할 수 없습니다')}
          className="rounded bg-black/55 p-1 text-xs leading-none text-white transition hover:bg-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
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
  onUnlink,
  dragId,
  dropTarget,
  onThumbPointerDown,
  onThumbPointerMove,
  onThumbPointerUp,
  onThumbPointerCancel,
  onThumbClick,
  onMoveGroup,
  canMovePrev,
  canMoveNext,
}: {
  row: RowItem
  thumbs: Record<string, string | undefined>
  thumbHeight: number
  activeSlideId: string | null
  selectedIds: Set<string>
  onUnlink: () => void
  onMoveGroup: (dir: -1 | 1) => void
  canMovePrev: boolean
  canMoveNext: boolean
} & ThumbDragWiring) {
  const t = useT()
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
          >
            <DropIndicator side={dropSide} />
            <button
              type="button"
              data-slide-thumb
              data-slide-id={s.id}
              onPointerDown={(e) => onThumbPointerDown(s.id, e)}
              onPointerMove={(e) => onThumbPointerMove(s.id, e)}
              onPointerUp={(e) => onThumbPointerUp(s.id, e)}
              onPointerCancel={() => onThumbPointerCancel(s.id)}
              onClick={(e) =>
                onThumbClick(s.id, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
              }
              title={i === 0 ? t('왼쪽 (Leader)') : t('오른쪽 (Follower)')}
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
        className="absolute right-1 top-1 hidden rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-none text-white transition hover:bg-black/75 group-hover:block group-focus-within:block"
        title={t('그룹 해제 — 두 장으로 분리')}
      >
        {t('해제')}
      </button>
      <div className="absolute bottom-1 right-1 hidden gap-1 group-hover:flex group-focus-within:flex">
        <button
          type="button"
          onClick={() => onMoveGroup(-1)}
          disabled={!canMovePrev}
          title={t('앞으로 이동')}
          aria-label={t('앞으로 이동')}
          className="rounded bg-black/55 px-1 py-0.5 text-[10px] leading-none text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => onMoveGroup(1)}
          disabled={!canMoveNext}
          title={t('뒤로 이동')}
          aria-label={t('뒤로 이동')}
          className="rounded bg-black/55 px-1 py-0.5 text-[10px] leading-none text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  )
}
