import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RowItem } from './slideRows'
import { EDITOR_CANVAS_WIDTH, editorCanvasHeight } from '../../constants/deviceSpecs'
import { useT } from '../../i18n'

/** `gap-8` and the vertical `py-8`, in px — the padding maths needs the numbers. */
const GAP = 32
const GUTTER = 32

interface Props {
  rows: RowItem[]
  activeSlideId: string | null
  /** slideId → thumbnail object URL, from the shared thumbnail hook. */
  thumbs: Record<string, string | undefined>
  zoom: number
  onSelect: (id: string) => void
  /** Visible height of the board, so the caller can fit a slide to it. */
  onViewportHeight: (h: number) => void
  /** The live editable canvas, mounted in place of the active row's frame. */
  children: ReactNode
}

/**
 * All of a project's slides side by side, the way the store page shows them.
 *
 * Only the active slide is a live Fabric canvas; every other frame is the
 * thumbnail the tray already renders (same `renderSlide` output, cached by
 * content hash), so showing the whole set costs one canvas, not N.
 */
export function CanvasBoard({ rows, activeSlideId, thumbs, zoom, onSelect, onViewportHeight, children }: Props) {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)

  // Report the visible height so the caller can pick a zoom that fits a whole
  // slide. Measured rather than assumed: the tray and toolbar are resizable.
  // The width is measured here too — the end padding below depends on it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const report = () => {
      onViewportHeight(el.clientHeight)
      setViewportWidth(el.clientWidth)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onViewportHeight])

  // Scrolling stops where the content does, so with a uniform gutter the first
  // and last slides can never reach the middle of the viewport however hard you
  // scroll — selecting one leaves it pinned to an edge. Widening the outer
  // gutters to half the empty space gives those two the room every slide in the
  // middle already has.
  const slideWidth = EDITOR_CANVAS_WIDTH * zoom
  const rowWidth = (row: RowItem) => row.slides.length * slideWidth
  const contentWidth =
    rows.reduce((w, row) => w + rowWidth(row), 0) + GAP * Math.max(0, rows.length - 1)
  // Only when the set actually overflows: padding a set that already fits would
  // introduce a scrollbar and shove it off-centre.
  const overflows = viewportWidth > 0 && contentWidth + GUTTER * 2 > viewportWidth
  const padStart =
    overflows && rows.length ? Math.max(GUTTER, (viewportWidth - rowWidth(rows[0])) / 2) : GUTTER
  const padEnd =
    overflows && rows.length
      ? Math.max(GUTTER, (viewportWidth - rowWidth(rows[rows.length - 1])) / 2)
      : GUTTER

  // Keep the edited slide on screen when the selection moves from the tray or
  // the layer panel — otherwise switching slides can leave the canvas scrolled
  // out of view on a wide project. Re-runs when the padding lands (first
  // measurement, resize, zoom) so the centring is against the final layout.
  useEffect(() => {
    const el = activeRef.current
    if (!el) return
    const centre = () => el.scrollIntoView({ block: 'nearest', inline: 'center' })
    centre()
    // The live canvas mounts into this row and only takes its width a frame
    // later, so centring once aims at a half-built box and stops short.
    const ro = new ResizeObserver(centre)
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeSlideId, padStart, padEnd])

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-[var(--color-bg)]">
      <div
        className="flex w-max items-start gap-8 py-8"
        style={{ paddingInlineStart: padStart, paddingInlineEnd: padEnd }}
      >
        {rows.map((row) => {
          const isActive = row.slides.some((s) => s.id === activeSlideId)
          const first = row.slides[0]
          const height = editorCanvasHeight(first.deviceFrame.model) * zoom

          if (isActive) {
            return (
              <div key={first.id} ref={activeRef} className="flex flex-col gap-2">
                <FrameLabel row={row} />
                {children}
              </div>
            )
          }

          return (
            <div key={first.id} className="flex flex-col gap-2">
              <FrameLabel row={row} />
              <button
                type="button"
                onClick={() => onSelect(first.id)}
                title={t('이 슬라이드 편집')}
                className="flex overflow-hidden rounded-lg border border-[var(--color-border)] transition hover:border-[var(--color-accent)]"
              >
                {row.slides.map((s) => (
                  <ThumbFrame key={s.id} thumb={thumbs[s.id]} zoom={zoom} height={height} />
                ))}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FrameLabel({ row }: { row: RowItem }) {
  const t = useT()
  const n = row.slides.map((s) => s.index + 1).join('–')
  return (
    <div className="flex items-center gap-1.5 text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
      <span className="tabular-nums">{n}</span>
      {row.kind === 'span' && (
        <span className="text-[var(--color-accent-strong)]">{t('2페이지')}</span>
      )}
    </div>
  )
}

function ThumbFrame({
  thumb,
  zoom,
  height,
}: {
  thumb?: string
  zoom: number
  height: number
}) {
  const width = EDITOR_CANVAS_WIDTH * zoom
  return (
    <div
      className="shrink-0 bg-[var(--color-surface-2)]"
      style={{ width, height }}
    >
      {thumb && (
        <img
          src={thumb}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  )
}
