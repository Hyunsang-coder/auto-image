import type { ShapeKind, Slide } from '../../types/project'
import type { ObjIdentity } from './FabricCanvas'
import { LAYER_NAMES } from '../../canvas/layerNames'
import { SHAPE_KINDS } from '../../constants/defaults'
import { MenuButton } from '../common/MenuButton'
import { PANEL_SECTIONS, type PanelTab } from './properties/sections'
import { useT } from '../../i18n'

// Reuses the shape panel's own labels rather than a second copy — the two
// drifted the moment there were two (원 vs 타원).
const shapeLabel = (kind: ShapeKind) => SHAPE_KINDS.find((k) => k.id === kind)?.label ?? kind

interface Row {
  /** Identity handed to the canvas to select this object. */
  id: ObjIdentity
  label: string
  /** Single glyph standing in for the layer kind. */
  glyph: string
  /** Structural singletons (background, device, screenshot) sit flush; the
   *  per-instance content layers indent under their group heading. */
  group?: string
  /** Not selectable on canvas — background is painted, not an object. */
  inert?: boolean
  /** Group name to print above this row; set only on the first row of a run. */
  heading?: string
}

interface Props {
  slide: Slide
  /** Span follower: it owns the right page's captions, so they list separately. */
  followerSlide?: Slide | null
  selected: ObjIdentity | null
  onSelect: (id: ObjIdentity) => void
  /** Open an inspector section directly — the way to reach a kind of layer
   *  that has no instance yet (you can't select a badge you haven't added). */
  onOpenSection: (tab: PanelTab) => void
}

function sameIdentity(a: ObjIdentity | null, b: ObjIdentity): boolean {
  if (!a) return false
  return (
    a.layerName === b.layerName &&
    a.badgeId === b.badgeId &&
    a.ornamentId === b.ornamentId &&
    a.shapeId === b.shapeId &&
    a.externalImageId === b.externalImageId &&
    a.highlightId === b.highlightId &&
    a.textIndex === b.textIndex &&
    a.owner === b.owner
  )
}

/** First line of a caption, trimmed — captions have no id or name of their own. */
function captionLabel(text: string, fallback: string): string {
  const first = (text ?? '').split('\n')[0].trim()
  if (!first) return fallback
  return first.length > 26 ? `${first.slice(0, 26)}…` : first
}

/**
 * Rows in canvas z-order, TOP FIRST — the order a layers list is read in, and
 * the reverse of the paint order in `FabricCanvas`. Keep this mirroring the
 * layer bands documented in CLAUDE.md; a row that drifts out of order lies
 * about what covers what.
 */
function buildRows(slide: Slide, follower: Slide | null | undefined, t: (k: string, v?: Record<string, string | number>) => string): Row[] {
  const rows: Row[] = []
  const shapes = slide.shapes ?? []

  for (const b of slide.badges ?? []) {
    rows.push({
      id: { layerName: LAYER_NAMES.BADGE, badgeId: b.id },
      label: b.text?.trim() || t('배지'),
      glyph: '◉',
      group: t('배지'),
    })
  }

  for (const h of slide.highlights ?? []) {
    rows.push({
      id: { layerName: LAYER_NAMES.HIGHLIGHT_POPUP, highlightId: h.id },
      label: t('확대 카드'),
      glyph: '◎',
      group: t('하이라이트'),
    })
    rows.push({
      id: { layerName: LAYER_NAMES.HIGHLIGHT_SOURCE, highlightId: h.id },
      label: t('원본 영역'),
      glyph: '⬚',
      group: t('하이라이트'),
    })
  }

  for (const img of slide.externalImages ?? []) {
    rows.push({
      id: { layerName: LAYER_NAMES.EXTERNAL_IMAGE, externalImageId: img.id },
      label: t('이미지'),
      glyph: '▨',
      group: t('이미지'),
    })
  }

  const front = shapes.filter((s) => s.layer === 'front')
  for (const s of front) {
    rows.push({
      id: { layerName: LAYER_NAMES.SHAPE, shapeId: s.id },
      label: t(shapeLabel(s.kind)),
      glyph: '◇',
      group: t('도형 (앞)'),
    })
  }

  // `owner` is always tagged on the canvas object (renderCaption defaults it to
  // 'leader'), so it has to be spelled out here too or the identity never matches.
  slide.texts.forEach((c, i) => {
    rows.push({
      id: { layerName: LAYER_NAMES.TEXT, textIndex: i, owner: 'leader' },
      label: captionLabel(c.text, t('텍스트 {n}', { n: i + 1 })),
      glyph: 'T',
      group: follower ? t('텍스트 — 왼쪽 페이지') : t('텍스트'),
    })
  })

  if (follower) {
    follower.texts.forEach((c, i) => {
      rows.push({
        id: { layerName: LAYER_NAMES.TEXT, textIndex: i, owner: 'follower' },
        label: captionLabel(c.text, t('텍스트 {n}', { n: i + 1 })),
        glyph: 'T',
        group: t('텍스트 — 오른쪽 페이지'),
      })
    })
  }

  if (slide.deviceFrame.show) {
    rows.push({
      id: { layerName: LAYER_NAMES.DEVICE_FRAME },
      label: t('기기 프레임'),
      glyph: '▭',
    })
  }

  if (slide.screenshot) {
    rows.push({
      id: { layerName: LAYER_NAMES.SCREENSHOT },
      label: t('스크린샷'),
      glyph: '▤',
    })
  }

  for (const o of slide.ornaments ?? []) {
    rows.push({
      id: { layerName: LAYER_NAMES.ORNAMENT, ornamentId: o.id },
      label: o.shape,
      glyph: '✦',
      group: t('장식'),
    })
  }

  const back = shapes.filter((s) => s.layer !== 'front')
  for (const s of back) {
    rows.push({
      id: { layerName: LAYER_NAMES.SHAPE, shapeId: s.id },
      label: t(shapeLabel(s.kind)),
      glyph: '◇',
      group: t('도형 (뒤)'),
    })
  }

  rows.push({
    id: { layerName: LAYER_NAMES.BACKGROUND },
    label: t('배경'),
    glyph: '▩',
    inert: true,
  })

  // Headings are decided here rather than during render: mutating a cursor
  // inside the JSX map is a render-phase side effect.
  let prev: string | undefined
  for (const row of rows) {
    if (row.group && row.group !== prev) row.heading = row.group
    prev = row.group
  }
  return rows
}

/**
 * The slide's layers, top of the stack first. The data was always there
 * (`layerNames.ts` plus the per-instance ids); this is the first surface that
 * lets you see the stack and pick an object without hunting on the canvas.
 */
export function LayerPanel({ slide, followerSlide, selected, onSelect, onOpenSection }: Props) {
  const t = useT()
  const rows = buildRows(slide, followerSlide, t)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2.5 py-1.5">
        <span className="text-[length:var(--text-ui-sm)] font-semibold text-[var(--color-text)]">
          {t('레이어 목록')}
        </span>
        <div className="ml-auto">
          <MenuButton
            label={t('요소 추가')}
            glyph="+"
            items={PANEL_SECTIONS.map((sec) => ({
              label: t(sec.label),
              onSelect: () => onOpenSection(sec.id),
            }))}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {rows.map((row, i) => {
          const isSel = sameIdentity(selected, row.id)
          return (
            <div key={`${row.id.layerName}-${i}`}>
              {row.heading && (
                <div className="px-1.5 pb-0.5 pt-2 text-[length:var(--text-ui-xs)] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                  {row.heading}
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-pressed={isSel}
                title={row.inert ? t('배경은 캔버스에서 선택할 수 없습니다 — 속성 패널에서 편집합니다') : row.label}
                className={[
                  'flex h-[var(--control-h)] w-full items-center gap-2 rounded-md px-2 text-left',
                  'text-[length:var(--text-ui)] transition',
                  row.group ? 'pl-4' : '',
                  isSel
                    ? 'bg-[var(--color-accent-strong)] text-[var(--color-accent-on)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-3)]',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={`w-3.5 shrink-0 text-center text-[length:var(--text-ui-xs)] ${
                    isSel ? '' : 'text-[var(--color-text-dim)]'
                  }`}
                >
                  {row.glyph}
                </span>
                <span className="truncate">{row.label}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
