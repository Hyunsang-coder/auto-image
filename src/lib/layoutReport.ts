import type { Canvas, FabricObject } from 'fabric'
import type { Project, Slide, TemplateType } from '../types/project'
import { LAYER_NAMES } from '../canvas/layerNames'
import { typeOfModel } from '../constants/deviceSpecs'

export interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
  right: number
  bottom: number
  centerX: number
  centerY: number
}

export type LayoutLayer =
  | 'text'
  | 'device-frame'
  | 'screenshot'
  | 'highlight-source'
  | 'highlight-popup'
  | 'badge'

export interface LayoutBox {
  id: string
  layer: LayoutLayer
  /** JSON Pointer-style path to the closest manifest object an agent can edit. */
  manifestPath: string
  canvasBox: LayoutRect
  /** Full object box translated into the exported PNG's coordinate space. */
  outputBox: LayoutRect
  /** Visible portion inside the exported PNG. */
  visibleBox: LayoutRect
  textIndex?: number
  owner?: 'leader' | 'follower'
  badgeId?: string
  highlightId?: string
}

export type LayoutIssueCode =
  | 'text-overlap'
  | 'badge-seam-overlap'
  | 'safe-margin-overflow'
  | 'highlight-popup-source-overlap'
  | 'highlight-popup-overflow'

export interface LayoutIssue {
  code: LayoutIssueCode
  severity: 'warning'
  message: string
  objects: string[]
  manifestPaths: string[]
  suggestedFix: LayoutSuggestedFix
  metrics?: Record<string, number | string | string[]>
}

export interface LayoutSuggestedEdit {
  manifestPath: string
  fields: string[]
  hint: string
}

export interface LayoutSuggestedFix {
  summary: string
  edits: LayoutSuggestedEdit[]
}

export interface LayoutPage {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutReportEntryBase {
  slideNo: number
  slideId: string
  locale: string
  template: TemplateType
  device: 'iphone' | 'ipad'
  canvas: { width: number; height: number }
  output: { width: number; height: number }
  page: LayoutPage
  safeMargin: { x: number; y: number }
  safeArea: LayoutRect
  span?: { groupId: string; role: 'leader' | 'follower'; seamX: number }
  boxes: {
    text: LayoutBox[]
    device: LayoutBox[]
    screenshot: LayoutBox[]
    highlightSource: LayoutBox[]
    highlightPopup: LayoutBox[]
    badge: LayoutBox[]
  }
}

export interface LayoutReportEntry extends LayoutReportEntryBase {
  issues: LayoutIssue[]
}

export interface LayoutReportSummary {
  renderCount: number
  issueCount: number
  affectedRenderCount: number
  byCode: Partial<Record<LayoutIssueCode, number>>
}

export interface LayoutReport {
  version: 1
  generatedAt: string
  project: { id: string; name: string; sourceLocale: string; targetLocales: string[] }
  summary: LayoutReportSummary
  renders: LayoutReportEntry[]
}

export interface LayoutSummaryIssue {
  slideNo: number
  slideId: string
  locale: string
  template: TemplateType
  device: 'iphone' | 'ipad'
  code: LayoutIssueCode
  severity: 'warning'
  message: string
  objects: string[]
  manifestPaths: string[]
  suggestedFix: LayoutSuggestedFix
  metrics?: Record<string, number | string | string[]>
}

export interface LayoutSummary {
  version: 1
  generatedAt: string
  project: LayoutReport['project']
  summary: LayoutReportSummary
  issues: LayoutSummaryIssue[]
}

interface RawBox {
  id: string
  layer: LayoutLayer
  canvasBox: LayoutRect
  textIndex?: number
  owner?: 'leader' | 'follower'
  badgeId?: string
  highlightId?: string
}

const SAFE_MARGIN_RATIO = 0.05
const TEXT_OVERLAP_RATIO = 0.12
const POPUP_SOURCE_OVERLAP_RATIO = 0.25
const EPS = 0.5

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function rect(x: number, y: number, width: number, height: number): LayoutRect {
  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
    right: round(x + width),
    bottom: round(y + height),
    centerX: round(x + width / 2),
    centerY: round(y + height / 2),
  }
}

function area(r: LayoutRect): number {
  return Math.max(0, r.width) * Math.max(0, r.height)
}

function intersection(a: LayoutRect, b: LayoutRect): LayoutRect | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.right, b.right)
  const y2 = Math.min(a.bottom, b.bottom)
  if (x2 <= x1 || y2 <= y1) return null
  return rect(x1, y1, x2 - x1, y2 - y1)
}

function translate(r: LayoutRect, dx: number, dy: number): LayoutRect {
  return rect(r.x + dx, r.y + dy, r.width, r.height)
}

function unionRects(rects: LayoutRect[]): LayoutRect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return rect(left, top, right - left, bottom - top)
}

function boxFromObject(obj: FabricObject): LayoutRect | null {
  obj.setCoords()
  const b = obj.getBoundingRect()
  if (b.width <= 0 || b.height <= 0) return null
  return rect(b.left, b.top, b.width, b.height)
}

function visibleScreenshotBox(obj: FabricObject): LayoutRect | null {
  const clip = (obj as FabricObject & { clipPath?: FabricObject }).clipPath
  return clip ? boxFromObject(clip) : boxFromObject(obj)
}

function tagged(obj: FabricObject): {
  layerName?: string
  textIndex?: number
  owner?: 'leader' | 'follower'
  badgeId?: string
  highlightId?: string
} {
  return obj as FabricObject & {
    layerName?: string
    textIndex?: number
    owner?: 'leader' | 'follower'
    badgeId?: string
    highlightId?: string
  }
}

function rawBoxFromObject(obj: FabricObject, layer: LayoutLayer, id: string, box?: LayoutRect | null): RawBox | null {
  const canvasBox = box ?? boxFromObject(obj)
  if (!canvasBox) return null
  const t = tagged(obj)
  return {
    id,
    layer,
    canvasBox,
    textIndex: t.textIndex,
    owner: t.owner,
    badgeId: t.badgeId,
    highlightId: t.highlightId,
  }
}

function textBoxes(objects: FabricObject[]): RawBox[] {
  const underlays = new Map<string, LayoutRect>()
  for (const obj of objects) {
    const t = tagged(obj)
    if (t.layerName !== LAYER_NAMES.TEXT_BOX) continue
    const box = boxFromObject(obj)
    if (!box) continue
    underlays.set(`${t.owner ?? 'leader'}:${t.textIndex ?? -1}`, box)
  }

  return objects.flatMap((obj) => {
    const t = tagged(obj)
    if (t.layerName !== LAYER_NAMES.TEXT) return []
    const own = boxFromObject(obj)
    if (!own) return []
    const owner = t.owner ?? 'leader'
    const textIndex = t.textIndex ?? 0
    const underlay = underlays.get(`${owner}:${textIndex}`)
    const canvasBox = unionRects(underlay ? [own, underlay] : [own])
    if (!canvasBox) return []
    return [{
      id: `text:${owner}:${textIndex}`,
      layer: 'text' as const,
      canvasBox,
      textIndex,
      owner,
    }]
  })
}

function collectRawBoxes(canvas: Canvas): RawBox[] {
  const objects = canvas.getObjects()
  const raw: RawBox[] = [...textBoxes(objects)]
  const device = unionRects(
    objects
      .filter((obj) => tagged(obj).layerName === LAYER_NAMES.DEVICE_FRAME)
      .map((obj) => boxFromObject(obj))
      .filter((box): box is LayoutRect => box !== null),
  )
  if (device) raw.push({ id: 'device-frame', layer: 'device-frame', canvasBox: device })

  for (const obj of objects) {
    const t = tagged(obj)
    if (t.layerName === LAYER_NAMES.SCREENSHOT) {
      const box = visibleScreenshotBox(obj)
      const item = rawBoxFromObject(obj, 'screenshot', 'screenshot', box)
      if (item) raw.push(item)
    } else if (t.layerName === LAYER_NAMES.HIGHLIGHT_SOURCE) {
      const id = `highlight-source:${t.highlightId ?? raw.length}`
      const item = rawBoxFromObject(obj, 'highlight-source', id)
      if (item) raw.push(item)
    } else if (t.layerName === LAYER_NAMES.HIGHLIGHT_POPUP) {
      const id = `highlight-popup:${t.highlightId ?? raw.length}`
      const item = rawBoxFromObject(obj, 'highlight-popup', id)
      if (item) raw.push(item)
    } else if (t.layerName === LAYER_NAMES.BADGE) {
      const id = `badge:${t.badgeId ?? raw.length}`
      const item = rawBoxFromObject(obj, 'badge', id)
      if (item) raw.push(item)
    }
  }
  return raw
}

function manifestSlidePath(slide: Slide): string {
  return `manifest.json#/slides/${slide.index}`
}

function indexedPath(root: string, collection: string, index: number): string {
  return index >= 0 ? `${root}/${collection}/${index}` : `${root}/${collection}`
}

function owningSlideForBox(
  raw: RawBox,
  fallback: Slide,
  ownerSlides?: { leader: Slide; follower?: Slide },
): Slide {
  if (!ownerSlides) return fallback
  if (raw.layer === 'text') {
    if (raw.owner === 'follower' && ownerSlides.follower) return ownerSlides.follower
    return ownerSlides.leader
  }
  return ownerSlides.leader
}

function manifestPathForBox(
  raw: RawBox,
  fallbackSlide: Slide,
  ownerSlides?: { leader: Slide; follower?: Slide },
): string {
  const slide = owningSlideForBox(raw, fallbackSlide, ownerSlides)
  const root = manifestSlidePath(slide)
  if (raw.layer === 'text') return `${root}/texts/${raw.textIndex ?? 0}`
  if (raw.layer === 'device-frame') return `${root}/deviceFrame`
  if (raw.layer === 'screenshot') return slide.deviceFrame.show ? `${root}/deviceFrame` : `${root}/screenshotStyle`
  if (raw.layer === 'badge') {
    const index = slide.badges.findIndex((badge) => badge.id === raw.badgeId)
    return indexedPath(root, 'badges', index)
  }
  if (raw.layer === 'highlight-source' || raw.layer === 'highlight-popup') {
    const index = slide.highlights.findIndex((highlight) => highlight.id === raw.highlightId)
    const field = raw.layer === 'highlight-source' ? 'sourceRegion' : 'popup'
    return `${indexedPath(root, 'highlights', index)}/${field}`
  }
  return root
}

function boxForPage(
  raw: RawBox,
  page: LayoutPage,
  slide: Slide,
  ownerSlides?: { leader: Slide; follower?: Slide },
): LayoutBox | null {
  const pageRect = rect(page.x, page.y, page.width, page.height)
  const visibleCanvas = intersection(raw.canvasBox, pageRect)
  if (!visibleCanvas) return null
  return {
    ...raw,
    manifestPath: manifestPathForBox(raw, slide, ownerSlides),
    outputBox: translate(raw.canvasBox, -page.x, -page.y),
    visibleBox: translate(visibleCanvas, -page.x, -page.y),
  }
}

function safeArea(width: number, height: number): { margin: { x: number; y: number }; area: LayoutRect } {
  const x = width * SAFE_MARGIN_RATIO
  const y = height * SAFE_MARGIN_RATIO
  return {
    margin: { x: round(x), y: round(y) },
    area: rect(x, y, width - x * 2, height - y * 2),
  }
}

function overflowSides(box: LayoutRect, bounds: LayoutRect): string[] {
  const sides: string[] = []
  if (box.x < bounds.x - EPS) sides.push('left')
  if (box.y < bounds.y - EPS) sides.push('top')
  if (box.right > bounds.right + EPS) sides.push('right')
  if (box.bottom > bounds.bottom + EPS) sides.push('bottom')
  return sides
}

function objectLabel(box: LayoutBox): string {
  if (box.layer === 'text') return `text:${box.owner ?? 'leader'}:${box.textIndex ?? 0}`
  if (box.layer === 'badge') return box.badgeId ? `badge:${box.badgeId}` : box.id
  if (box.highlightId) return `${box.layer}:${box.highlightId}`
  return box.id
}

function issueBoxes(entry: LayoutReportEntryBase, objectIds: string[]): LayoutBox[] {
  const all = [
    ...entry.boxes.text,
    ...entry.boxes.device,
    ...entry.boxes.screenshot,
    ...entry.boxes.highlightSource,
    ...entry.boxes.highlightPopup,
    ...entry.boxes.badge,
  ]
  return objectIds
    .map((id) => all.find((box) => box.id === id))
    .filter((box): box is LayoutBox => box !== undefined)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function suggestedEditForBox(box: LayoutBox): LayoutSuggestedEdit {
  if (box.layer === 'text') {
    return {
      manifestPath: box.manifestPath,
      fields: ['pos', 'boxWidth', 'fontSize', 'fitToBox'],
      hint: 'Move this text block away from the collision, narrow its wrap width, or reduce/fit its font size.',
    }
  }
  if (box.layer === 'device-frame' || box.layer === 'screenshot') {
    return {
      manifestPath: box.manifestPath,
      fields: box.manifestPath.endsWith('/screenshotStyle')
        ? ['crop']
        : ['offsetX', 'offsetY', 'scale'],
      hint: 'Move or scale the device/screenshot area if moving text is not enough.',
    }
  }
  if (box.layer === 'badge') {
    return {
      manifestPath: box.manifestPath,
      fields: ['left', 'top'],
      hint: 'Move the badge center/top so the pill sits fully inside its intended page.',
    }
  }
  if (box.layer === 'highlight-source') {
    return {
      manifestPath: box.manifestPath,
      fields: ['x', 'y', 'w', 'h'],
      hint: 'Adjust the sampled source region only if the popup cannot move without hiding the feature.',
    }
  }
  return {
    manifestPath: box.manifestPath,
    fields: ['x', 'y', 'width'],
    hint: 'Move the highlight popup inside the page or shrink its width.',
  }
}

function makeIssue(
  entry: LayoutReportEntryBase,
  code: LayoutIssueCode,
  message: string,
  objects: string[],
  summary: string,
  metrics?: Record<string, number | string | string[]>,
): LayoutIssue {
  const boxes = issueBoxes(entry, objects)
  const edits = boxes.map(suggestedEditForBox)
  return {
    code,
    severity: 'warning',
    message,
    objects,
    manifestPaths: unique(edits.map((edit) => edit.manifestPath)),
    suggestedFix: { summary, edits },
    ...(metrics ? { metrics } : {}),
  }
}

// pos semantics (Caption.pos): x = box centerX / width, y = box top / height —
// so an agent/autofix can move a text block to an absolute target without
// guessing its current placement (template-anchored text has no manifest pos).
function textPosMetrics(box: LayoutBox, output: { width: number; height: number }): { posX: number; posY: number } {
  return {
    posX: round(box.outputBox.centerX / output.width),
    posY: round(box.outputBox.y / output.height),
  }
}

// Minimum move (along the axis of least penetration) that separates a text box
// from an overlapping target, expressed as an absolute target pos. Clamped to
// the safe area; `shrink` flags that the clamp left residual overlap so the
// autofix should also reduce the font.
function textOverlapMoveMetrics(
  text: LayoutBox,
  target: LayoutBox,
  overlap: LayoutRect,
  entry: LayoutReportEntryBase,
): Record<string, number> {
  const { width: W, height: H } = entry.output
  const t = text.visibleBox
  const gap = Math.min(W, H) * 0.01
  let shiftX = 0
  let shiftY = 0
  let clamped = false
  if (overlap.width <= overlap.height) {
    const dir = t.centerX >= target.visibleBox.centerX ? 1 : -1
    const need = overlap.width + gap
    const room = Math.max(0, dir > 0 ? entry.safeArea.right - t.right : t.x - entry.safeArea.x)
    shiftX = dir * Math.min(need, room)
    if (need > room + EPS) clamped = true
  } else {
    const dir = t.centerY >= target.visibleBox.centerY ? 1 : -1
    const need = overlap.height + gap
    const room = Math.max(0, dir > 0 ? entry.safeArea.bottom - t.bottom : t.y - entry.safeArea.y)
    shiftY = dir * Math.min(need, room)
    if (need > room + EPS) clamped = true
  }
  return {
    ...textPosMetrics(text, entry.output),
    targetX: round((t.centerX + shiftX) / W),
    targetY: round((t.y + shiftY) / H),
    ...(clamped ? { shrink: 1 } : {}),
  }
}

// Absolute target pos that pulls a text box back inside the safe area. Derived
// from the box's real geometry, never a fabricated default. `narrowBox` flags a
// box wider than the safe area (no move can fully fit it) so the autofix narrows
// the wrap width too.
function textSafeMarginMoveMetrics(box: LayoutBox, entry: LayoutReportEntryBase): Record<string, number> {
  const { width: W, height: H } = entry.output
  const a = entry.safeArea
  const b = box.outputBox
  let shiftX = 0
  let narrowBox = false
  if (b.width >= a.width) {
    shiftX = a.x - b.x
    narrowBox = true
  } else if (b.x < a.x - EPS) {
    shiftX = a.x - b.x
  } else if (b.right > a.right + EPS) {
    shiftX = a.right - b.right
  }
  let shiftY = 0
  if (b.height >= a.height) {
    shiftY = a.y - b.y
  } else if (b.y < a.y - EPS) {
    shiftY = a.y - b.y
  } else if (b.bottom > a.bottom + EPS) {
    shiftY = a.bottom - b.bottom
  }
  return {
    ...textPosMetrics(box, entry.output),
    targetX: round((b.centerX + shiftX) / W),
    targetY: round((b.y + shiftY) / H),
    ...(narrowBox ? { narrowBox: 1 } : {}),
  }
}

function pushSafeMarginIssues(entry: LayoutReportEntryBase, issues: LayoutIssue[]): void {
  const checked = [
    ...entry.boxes.text,
    ...entry.boxes.highlightPopup,
    ...entry.boxes.badge,
  ]
  for (const box of checked) {
    const sides = overflowSides(box.outputBox, entry.safeArea)
    if (sides.length === 0) continue
    const move = box.layer === 'text' ? textSafeMarginMoveMetrics(box, entry) : {}
    issues.push(makeIssue(
      entry,
      'safe-margin-overflow',
      `${objectLabel(box)} is outside the safe margin on ${sides.join(', ')}`,
      [box.id],
      'Move the object back inside safeArea, or reduce its size if it cannot move without covering important content.',
      { ...move, sides, safeMarginX: entry.safeMargin.x, safeMarginY: entry.safeMargin.y },
    ))
  }
}

function pushTextOverlapIssues(entry: LayoutReportEntryBase, issues: LayoutIssue[]): void {
  const pageArea = entry.output.width * entry.output.height
  const targets = [
    ...entry.boxes.device,
    ...entry.boxes.screenshot,
    ...entry.boxes.highlightPopup,
    ...entry.boxes.badge,
  ]
  for (const text of entry.boxes.text) {
    for (const target of targets) {
      if (target.layer === 'screenshot' && area(target.visibleBox) / pageArea > 0.8) continue
      const overlap = intersection(text.visibleBox, target.visibleBox)
      if (!overlap) continue
      const ratio = area(overlap) / Math.max(1, area(text.visibleBox))
      if (ratio <= TEXT_OVERLAP_RATIO) continue
      issues.push(makeIssue(
        entry,
        'text-overlap',
        `${objectLabel(text)} overlaps ${objectLabel(target)} by ${round(ratio * 100)}%`,
        [text.id, target.id],
        'Move or resize the text block first; if the target is the device, badge, or popup, move/scale that target as the secondary fix.',
        {
          ...textOverlapMoveMetrics(text, target, overlap, entry),
          overlapArea: round(area(overlap)),
          overlapRatio: round(ratio),
          threshold: TEXT_OVERLAP_RATIO,
        },
      ))
    }
  }
}

function pushBadgeSeamIssues(entry: LayoutReportEntryBase, issues: LayoutIssue[]): void {
  if (!entry.span || entry.span.role !== 'leader') return
  const seamX = entry.span.seamX
  for (const badge of entry.boxes.badge) {
    if (badge.canvasBox.x < seamX - EPS && badge.canvasBox.right > seamX + EPS) {
      issues.push(makeIssue(
        entry,
        'badge-seam-overlap',
        `${objectLabel(badge)} crosses the span seam`,
        [badge.id],
        'Move the badge left/right so its full pill stays on one side of the span seam.',
        { seamX },
      ))
    }
  }
}

function pushHighlightIssues(entry: LayoutReportEntryBase, issues: LayoutIssue[]): void {
  const screen = rect(0, 0, entry.output.width, entry.output.height)
  for (const popup of entry.boxes.highlightPopup) {
    const sides = overflowSides(popup.outputBox, screen)
    if (sides.length > 0) {
      issues.push(makeIssue(
        entry,
        'highlight-popup-overflow',
        `${objectLabel(popup)} is outside the output screen on ${sides.join(', ')}`,
        [popup.id],
        'Move the highlight popup inside the output bounds or shrink popup.width.',
        { sides },
      ))
    }

    const source = entry.boxes.highlightSource.find((s) => s.highlightId === popup.highlightId)
    if (!source) continue
    const overlap = intersection(popup.visibleBox, source.visibleBox)
    if (!overlap) continue
    const ratio = area(overlap) / Math.max(1, Math.min(area(popup.visibleBox), area(source.visibleBox)))
    if (ratio <= POPUP_SOURCE_OVERLAP_RATIO) continue
    issues.push(makeIssue(
      entry,
      'highlight-popup-source-overlap',
      `${objectLabel(popup)} overlaps its source by ${round(ratio * 100)}%`,
      [popup.id, source.id],
      'Move the highlight popup away from sourceRegion or shrink popup.width.',
      {
        overlapArea: round(area(overlap)),
        overlapRatio: round(ratio),
        threshold: POPUP_SOURCE_OVERLAP_RATIO,
      },
    ))
  }
}

export function validateLayoutEntry(entry: LayoutReportEntryBase): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  pushTextOverlapIssues(entry, issues)
  pushBadgeSeamIssues(entry, issues)
  pushSafeMarginIssues(entry, issues)
  pushHighlightIssues(entry, issues)
  return issues
}

export function captureLayoutReportEntry(
  canvas: Canvas,
  opts: {
    slide: Slide
    locale: string
    page: LayoutPage
    span?: { groupId: string; role: 'leader' | 'follower'; seamX: number }
    ownerSlides?: { leader: Slide; follower?: Slide }
  },
): LayoutReportEntry {
  const raw = collectRawBoxes(canvas)
  const pageBoxes = raw
    .map((box) => boxForPage(box, opts.page, opts.slide, opts.ownerSlides))
    .filter((box): box is LayoutBox => box !== null)
  const { margin, area: safe } = safeArea(opts.page.width, opts.page.height)
  const base: LayoutReportEntryBase = {
    slideNo: opts.slide.index + 1,
    slideId: opts.slide.id,
    locale: opts.locale,
    template: opts.slide.template,
    device: typeOfModel(opts.slide.deviceFrame.model),
    canvas: { width: canvas.width, height: canvas.height },
    output: { width: opts.page.width, height: opts.page.height },
    page: opts.page,
    safeMargin: margin,
    safeArea: safe,
    span: opts.span,
    boxes: {
      text: pageBoxes.filter((box) => box.layer === 'text'),
      device: pageBoxes.filter((box) => box.layer === 'device-frame'),
      screenshot: pageBoxes.filter((box) => box.layer === 'screenshot'),
      highlightSource: pageBoxes.filter((box) => box.layer === 'highlight-source'),
      highlightPopup: pageBoxes.filter((box) => box.layer === 'highlight-popup'),
      badge: pageBoxes.filter((box) => box.layer === 'badge'),
    },
  }
  return { ...base, issues: validateLayoutEntry(base) }
}

export function summarizeLayoutReport(renders: LayoutReportEntry[]): LayoutReportSummary {
  const byCode: Partial<Record<LayoutIssueCode, number>> = {}
  for (const render of renders) {
    for (const issue of render.issues) {
      byCode[issue.code] = (byCode[issue.code] ?? 0) + 1
    }
  }
  return {
    renderCount: renders.length,
    issueCount: renders.reduce((sum, render) => sum + render.issues.length, 0),
    affectedRenderCount: renders.filter((render) => render.issues.length > 0).length,
    byCode,
  }
}

export function createLayoutReport(project: Project, renders: LayoutReportEntry[]): LayoutReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
    },
    summary: summarizeLayoutReport(renders),
    renders,
  }
}

export function createLayoutSummary(report: LayoutReport): LayoutSummary {
  return {
    version: 1,
    generatedAt: report.generatedAt,
    project: report.project,
    summary: report.summary,
    issues: report.renders.flatMap((render) =>
      render.issues.map((issue) => ({
        slideNo: render.slideNo,
        slideId: render.slideId,
        locale: render.locale,
        template: render.template,
        device: render.device,
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        objects: issue.objects,
        manifestPaths: issue.manifestPaths,
        suggestedFix: issue.suggestedFix,
        ...(issue.metrics ? { metrics: issue.metrics } : {}),
      })),
    ),
  }
}
