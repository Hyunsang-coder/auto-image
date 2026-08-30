import { useEffect, useRef, type ReactNode } from 'react'
import type { RowItem } from './slideRows'
import { EDITOR_CANVAS_WIDTH, editorCanvasHeight } from '../../constants/deviceSpecs'
import { useT } from '../../i18n'

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

  // Keep the edited slide on screen when the selection moves from the tray or
  // the layer panel — otherwise switching slides can leave the canvas scrolled
  // out of view on a wide project.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeSlideId])

  // Report the visible height so the caller can pick a zoom that fits a whole
  // slide. Measured rather than assumed: the tray and toolbar are resizable.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const report = () => onViewportHeight(el.clientHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onViewportHeight])

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-[var(--color-bg)]">
      <div className="flex w-max items-start gap-8 p-8">
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
