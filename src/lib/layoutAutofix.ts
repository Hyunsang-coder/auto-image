import type {
  LayoutIssueCode,
  LayoutSummary,
  LayoutSummaryIssue,
  LayoutSuggestedEdit,
} from './layoutReport'

type JsonObject = Record<string, unknown>

type AutofixTargetKind =
  | 'text'
  | 'deviceFrame'
  | 'screenshotStyle'
  | 'badge'
  | 'highlightPopup'
  | 'highlightSource'

interface AutofixTarget {
  kind: AutofixTargetKind
  manifestPath: string
  node: JsonObject
  slide: JsonObject
  highlight?: JsonObject
}

interface AutofixContext {
  manifest: unknown
  changes: LayoutAutofixChange[]
  warnings: LayoutAutofixWarning[]
  skippedDuplicateIssues: number
  appliedIssueKeys: Set<string>
}

export interface LayoutAutofixChange {
  issueIndex: number
  code: LayoutIssueCode
  slideNo: number
  locale: string
  manifestPath: string
  fieldPath: string
  before: unknown
  after: unknown
  reason: string
}

export interface LayoutAutofixWarning {
  issueIndex?: number
  code?: LayoutIssueCode
  manifestPath?: string
  message: string
}

export interface LayoutAutofixResult {
  manifest: unknown
  issueCount: number
  appliedIssueCount: number
  skippedDuplicateIssues: number
  changes: LayoutAutofixChange[]
  warnings: LayoutAutofixWarning[]
}

export interface LayoutAutofixReportOptions {
  write: boolean
  summaryPath?: string
  manifestPath?: string
}

const POSITION_STEP = 0.06
const SAFE_TOP_STEP = 0.04
const SIZE_REDUCTION = 0.9
const TEXT_WIDTH_REDUCTION = 0.94

const MIN_FONT_SIZE = 8
const MIN_FONT_SCALE = 0.3
const MIN_BOX_WIDTH = 0.1
const MIN_POPUP_WIDTH = 0.1
const MAX_POPUP_WIDTH = 1.5

export function isLayoutSummary(value: unknown): value is Pick<LayoutSummary, 'issues'> {
  return isRecord(value) && Array.isArray(value.issues)
}

export function applyLayoutSummaryFixes(
  manifestInput: unknown,
  summary: Pick<LayoutSummary, 'issues'>,
): LayoutAutofixResult {
  const ctx: AutofixContext = {
    manifest: cloneJson(manifestInput),
    changes: [],
    warnings: [],
    skippedDuplicateIssues: 0,
    appliedIssueKeys: new Set(),
  }
  if (!isRecord(ctx.manifest)) {
    ctx.warnings.push({ message: 'manifest must be a JSON object' })
    return finish(ctx, summary.issues.length)
  }

  summary.issues.forEach((issue, index) => {
    const issueIndex = index + 1
    if (!isSupportedIssueCode(issue.code)) {
      ctx.warnings.push({
        issueIndex,
        message: `unsupported issue code: ${String(issue.code)}`,
      })
      return
    }

    const edit = choosePrimaryEdit(issue)
    if (!edit) {
      ctx.warnings.push({
        issueIndex,
        code: issue.code,
        message: 'issue has no applicable suggestedFix.edits entry',
      })
      return
    }

    const issueKey = `${issue.code}|${edit.manifestPath}`
    if (ctx.appliedIssueKeys.has(issueKey)) {
      ctx.skippedDuplicateIssues += 1
      return
    }

    const target = resolveTarget(ctx.manifest as JsonObject, edit.manifestPath)
    if ('warning' in target) {
      ctx.warnings.push({
        issueIndex,
        code: issue.code,
        manifestPath: edit.manifestPath,
        message: target.warning,
      })
      return
    }

    const before = ctx.changes.length
    applyIssue(ctx, issue, issueIndex, target.target)
    if (ctx.changes.length > before) ctx.appliedIssueKeys.add(issueKey)
  })

  return finish(ctx, summary.issues.length)
}

export function formatLayoutAutofixReport(
  result: LayoutAutofixResult,
  opts: LayoutAutofixReportOptions,
): string {
  const lines: string[] = []
  lines.push(opts.write ? 'layout autofix write' : 'layout autofix dry-run')
  if (opts.summaryPath) lines.push(`summary: ${opts.summaryPath}`)
  if (opts.manifestPath) lines.push(`manifest: ${opts.manifestPath}`)
  lines.push(
    `issues: ${result.issueCount}; applied issues: ${result.appliedIssueCount}; changes: ${result.changes.length}; ` +
    `duplicates skipped: ${result.skippedDuplicateIssues}; warnings: ${result.warnings.length}`,
  )
  for (const change of result.changes) {
    lines.push(
      `- [${change.issueIndex}] ${change.code} slide ${change.slideNo} ${change.locale}: ${change.fieldPath}`,
    )
    lines.push(`  ${formatValue(change.before)} -> ${formatValue(change.after)}`)
    lines.push(`  ${change.reason}`)
  }
  for (const warning of result.warnings) {
    const prefix = warning.issueIndex !== undefined
      ? `warning [${warning.issueIndex}]`
      : 'warning'
    const suffix = warning.manifestPath ? ` (${warning.manifestPath})` : ''
    lines.push(`- ${prefix}${suffix}: ${warning.message}`)
  }
  if (!opts.write) lines.push('dry-run only; pass --write to update the manifest file.')
  else if (result.changes.length === 0) lines.push('no manifest changes to write.')
  return lines.join('\n')
}

function finish(ctx: AutofixContext, issueCount: number): LayoutAutofixResult {
  return {
    manifest: ctx.manifest,
    issueCount,
    appliedIssueCount: ctx.appliedIssueKeys.size,
    skippedDuplicateIssues: ctx.skippedDuplicateIssues,
    changes: ctx.changes,
    warnings: ctx.warnings,
  }
}

function choosePrimaryEdit(issue: LayoutSummaryIssue): LayoutSuggestedEdit | null {
  const edits = Array.isArray(issue.suggestedFix?.edits)
    ? issue.suggestedFix.edits
    : []
  if (edits.length === 0) return null

  if (issue.code === 'text-overlap') {
    return edits.find((edit) => edit.manifestPath.includes('/texts/')) ?? edits[0]
  }
  if (issue.code === 'badge-seam-overlap') {
    return edits.find((edit) => edit.manifestPath.includes('/badges/')) ?? edits[0]
  }
  if (
    issue.code === 'highlight-popup-overflow' ||
    issue.code === 'highlight-popup-source-overlap'
  ) {
    return edits.find((edit) => edit.manifestPath.endsWith('/popup')) ?? edits[0]
  }
  return edits[0]
}

function applyIssue(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
): void {
  if (issue.code === 'text-overlap') {
    applyTextOverlap(ctx, issue, issueIndex, target)
  } else if (issue.code === 'safe-margin-overflow') {
    applySafeMarginOverflow(ctx, issue, issueIndex, target)
  } else if (issue.code === 'badge-seam-overlap') {
    applyBadgeSeamOverlap(ctx, issue, issueIndex, target)
  } else if (issue.code === 'highlight-popup-overflow') {
    applyPopupOverflow(ctx, issue, issueIndex, target)
  } else if (issue.code === 'highlight-popup-source-overlap') {
    applyPopupSourceOverlap(ctx, issue, issueIndex, target)
  }
}

function applyTextOverlap(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
): void {
  if (target.kind === 'text') {
    const fontSize = numberField(target.node, 'fontSize')
    if (fontSize !== undefined) {
      setField(
        ctx,
        issue,
        issueIndex,
        target,
        'fontSize',
        round3(Math.max(MIN_FONT_SIZE, fontSize * SIZE_REDUCTION)),
        'reduce text fontSize to clear an overlap',
      )
    } else {
      const fontScale = numberField(target.node, 'fontScale') ?? 1
      setField(
        ctx,
        issue,
        issueIndex,
        target,
        'fontScale',
        round3(Math.max(MIN_FONT_SCALE, fontScale * SIZE_REDUCTION)),
        'reduce text fontScale to clear an overlap',
      )
    }
    setField(ctx, issue, issueIndex, target, 'fitToBox', true, 'allow text to fit within its box')

    const boxWidth = numberField(target.node, 'boxWidth')
    if (boxWidth !== undefined) {
      setField(
        ctx,
        issue,
        issueIndex,
        target,
        'boxWidth',
        round3(Math.max(MIN_BOX_WIDTH, boxWidth * TEXT_WIDTH_REDUCTION)),
        'slightly narrow the text wrap box',
      )
    }
    return
  }

  if (target.kind === 'highlightPopup') {
    shrinkPopup(ctx, issue, issueIndex, target, 'shrink popup that overlaps text')
  } else if (target.kind === 'deviceFrame') {
    const scale = numberField(target.node, 'scale') ?? 1
    setField(
      ctx,
      issue,
      issueIndex,
      target,
      'scale',
      round3(Math.max(0.3, scale * 0.95)),
      'slightly scale down the device target',
    )
  }
}

function applySafeMarginOverflow(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
): void {
  const sides = metricSides(issue)
  if (target.kind === 'text') {
    const pos = isRecord(target.node.pos) ? target.node.pos : {}
    let x = numberField(pos, 'x') ?? 0.5
    let y = numberField(pos, 'y') ?? defaultTextY(sides)
    if (sides.includes('left')) x += POSITION_STEP
    if (sides.includes('right')) x -= POSITION_STEP
    if (sides.includes('top')) y += SAFE_TOP_STEP
    if (sides.includes('bottom')) y -= POSITION_STEP
    setField(
      ctx,
      issue,
      issueIndex,
      target,
      'pos',
      { x: round3(clamp(x, 0.06, 0.94)), y: round3(clamp(y, 0.05, 0.9)) },
      `move text inside safe margin (${sides.join(', ') || 'unknown side'})`,
    )
    setField(ctx, issue, issueIndex, target, 'fitToBox', true, 'keep text within its adjusted box')
    const boxWidth = numberField(target.node, 'boxWidth')
    if (boxWidth !== undefined && (sides.includes('left') || sides.includes('right'))) {
      setField(
        ctx,
        issue,
        issueIndex,
        target,
        'boxWidth',
        round3(Math.max(MIN_BOX_WIDTH, boxWidth * TEXT_WIDTH_REDUCTION)),
        'narrow text box after horizontal safe-margin overflow',
      )
    }
  } else if (target.kind === 'badge') {
    moveBadgeForSides(ctx, issue, issueIndex, target, sides, 'move badge inside safe margin')
  } else if (target.kind === 'highlightPopup') {
    movePopupForSides(ctx, issue, issueIndex, target, sides, 'move popup inside safe margin')
    shrinkPopup(ctx, issue, issueIndex, target, 'shrink popup after safe-margin overflow')
  }
}

function applyBadgeSeamOverlap(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
): void {
  if (target.kind !== 'badge') {
    ctx.warnings.push({
      issueIndex,
      code: issue.code,
      manifestPath: target.manifestPath,
      message: 'badge seam issue did not point to a badge object',
    })
    return
  }
  const current = numberField(target.node, 'left') ?? 0.5
  const next = current <= 0.5
    ? (current === 0.5 ? 0.42 : clamp(current - 0.08, 0.08, 0.92))
    : clamp(current + 0.08, 0.08, 0.92)
  setField(
    ctx,
    issue,
    issueIndex,
    target,
    'left',
    round3(next),
    'move badge center away from the span seam',
  )
}

function applyPopupOverflow(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
): void {
  if (target.kind !== 'highlightPopup') {
    ctx.warnings.push({
      issueIndex,
      code: issue.code,
      manifestPath: target.manifestPath,
      message: 'highlight popup overflow did not point to popup',
    })
    return
  }
  movePopupForSides(ctx, issue, issueIndex, target, metricSides(issue), 'move popup inside output bounds')
  shrinkPopup(ctx, issue, issueIndex, target, 'shrink popup after output overflow')
}

function applyPopupSourceOverlap(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
): void {
  if (target.kind !== 'highlightPopup') {
    ctx.warnings.push({
      issueIndex,
      code: issue.code,
      manifestPath: target.manifestPath,
      message: 'highlight popup/source issue did not point to popup',
    })
    return
  }

  const source = isRecord(target.highlight?.sourceRegion) ? target.highlight.sourceRegion : null
  const sourceX = source
    ? (numberField(source, 'x') ?? 0.5) + (numberField(source, 'w') ?? 0) / 2
    : 0.5
  const sourceY = source
    ? (numberField(source, 'y') ?? 0.5) + (numberField(source, 'h') ?? 0) / 2
    : 0.5
  const currentX = numberField(target.node, 'x') ?? 0.5
  const currentY = numberField(target.node, 'y') ?? 0.32
  const nextX = currentX <= sourceX ? currentX - POSITION_STEP : currentX + POSITION_STEP
  const nextY = currentY <= sourceY ? currentY - POSITION_STEP : currentY + POSITION_STEP

  setField(
    ctx,
    issue,
    issueIndex,
    target,
    'x',
    round3(clamp(nextX, 0.06, 0.94)),
    'move popup horizontally away from sourceRegion',
  )
  setField(
    ctx,
    issue,
    issueIndex,
    target,
    'y',
    round3(clamp(nextY, 0.06, 0.94)),
    'move popup vertically away from sourceRegion',
  )
  shrinkPopup(ctx, issue, issueIndex, target, 'shrink popup after source overlap')
}

function moveBadgeForSides(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
  sides: string[],
  reason: string,
): void {
  let left = numberField(target.node, 'left') ?? 0.5
  let top = numberField(target.node, 'top') ?? 0.03
  if (sides.includes('left')) left += POSITION_STEP
  if (sides.includes('right')) left -= POSITION_STEP
  if (sides.includes('top')) top += SAFE_TOP_STEP
  if (sides.includes('bottom')) top -= POSITION_STEP
  setField(ctx, issue, issueIndex, target, 'left', round3(clamp(left, 0.08, 0.92)), reason)
  setField(ctx, issue, issueIndex, target, 'top', round3(clamp(top, 0.05, 0.9)), reason)
}

function movePopupForSides(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
  sides: string[],
  reason: string,
): void {
  let x = numberField(target.node, 'x') ?? 0.5
  let y = numberField(target.node, 'y') ?? 0.32
  if (sides.includes('left')) x += POSITION_STEP
  if (sides.includes('right')) x -= POSITION_STEP
  if (sides.includes('top')) y += POSITION_STEP
  if (sides.includes('bottom')) y -= POSITION_STEP
  setField(ctx, issue, issueIndex, target, 'x', round3(clamp(x, 0.06, 0.94)), reason)
  setField(ctx, issue, issueIndex, target, 'y', round3(clamp(y, 0.06, 0.94)), reason)
}

function shrinkPopup(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
  reason: string,
): void {
  const width = numberField(target.node, 'width') ?? 0.78
  setField(
    ctx,
    issue,
    issueIndex,
    target,
    'width',
    round3(clamp(width * SIZE_REDUCTION, MIN_POPUP_WIDTH, MAX_POPUP_WIDTH)),
    reason,
  )
}

function setField(
  ctx: AutofixContext,
  issue: LayoutSummaryIssue,
  issueIndex: number,
  target: AutofixTarget,
  field: string,
  after: unknown,
  reason: string,
): void {
  const before = target.node[field]
  if (jsonEqual(before, after)) return
  target.node[field] = after
  ctx.changes.push({
    issueIndex,
    code: issue.code,
    slideNo: issue.slideNo,
    locale: issue.locale,
    manifestPath: target.manifestPath,
    fieldPath: `${target.manifestPath}/${escapePointer(field)}`,
    before: cloneJson(before),
    after: cloneJson(after),
    reason,
  })
}

function resolveTarget(root: JsonObject, manifestPath: string): { target: AutofixTarget } | { warning: string } {
  const parsed = parseManifestPath(manifestPath)
  if (!parsed) return { warning: 'manifestPath must look like manifest.json#/...' }
  const tokens = parsed.tokens
  if (tokens[0] !== 'slides') return { warning: 'manifestPath must point under /slides' }
  const slideIndex = arrayIndex(tokens[1])
  if (slideIndex === null) return { warning: 'slide index is not a non-negative integer' }
  if (!Array.isArray(root.slides)) return { warning: 'manifest.slides is not an array' }
  const slide = root.slides[slideIndex]
  if (!isRecord(slide)) return { warning: `manifest.slides[${slideIndex}] is not an object` }

  if (tokens.length === 4 && tokens[2] === 'texts') {
    const textIndex = arrayIndex(tokens[3])
    if (textIndex === null) return { warning: 'text index is not a non-negative integer' }
    const texts = ensureArray(slide, 'texts')
    if (!texts) return { warning: `slides[${slideIndex}].texts is not an array` }
    const text = ensureObjectAt(texts, textIndex)
    if (!text) return { warning: `slides[${slideIndex}].texts[${textIndex}] is not an object` }
    return { target: { kind: 'text', manifestPath, node: text, slide } }
  }

  if (tokens.length === 3 && tokens[2] === 'deviceFrame') {
    const node = ensureObjectField(slide, 'deviceFrame', { show: slide.deviceFrame !== false })
    if (!node) return { warning: `slides[${slideIndex}].deviceFrame is not an object or boolean` }
    return { target: { kind: 'deviceFrame', manifestPath, node, slide } }
  }

  if (tokens.length === 3 && tokens[2] === 'screenshotStyle') {
    const node = ensureObjectField(slide, 'screenshotStyle', {})
    if (!node) return { warning: `slides[${slideIndex}].screenshotStyle is not an object` }
    return { target: { kind: 'screenshotStyle', manifestPath, node, slide } }
  }

  if (tokens.length === 4 && tokens[2] === 'badges') {
    const badgeIndex = arrayIndex(tokens[3])
    if (badgeIndex === null) return { warning: 'badge index is not a non-negative integer' }
    const badges = Array.isArray(slide.badges) ? slide.badges : null
    if (!badges) return { warning: `slides[${slideIndex}].badges is not an array` }
    const badge = badges[badgeIndex]
    if (!isRecord(badge)) return { warning: `slides[${slideIndex}].badges[${badgeIndex}] is not an object` }
    return { target: { kind: 'badge', manifestPath, node: badge, slide } }
  }

  if (tokens.length === 5 && tokens[2] === 'highlights') {
    const highlightIndex = arrayIndex(tokens[3])
    if (highlightIndex === null) return { warning: 'highlight index is not a non-negative integer' }
    const highlights = Array.isArray(slide.highlights) ? slide.highlights : null
    if (!highlights) return { warning: `slides[${slideIndex}].highlights is not an array` }
    const highlight = highlights[highlightIndex]
    if (!isRecord(highlight)) {
      return { warning: `slides[${slideIndex}].highlights[${highlightIndex}] is not an object` }
    }
    if (tokens[4] === 'popup') {
      const popup = ensureObjectField(highlight, 'popup', {})
      if (!popup) return { warning: `slides[${slideIndex}].highlights[${highlightIndex}].popup is not an object` }
      return { target: { kind: 'highlightPopup', manifestPath, node: popup, slide, highlight } }
    }
    if (tokens[4] === 'sourceRegion') {
      const source = ensureObjectField(highlight, 'sourceRegion', {})
      if (!source) {
        return {
          warning: `slides[${slideIndex}].highlights[${highlightIndex}].sourceRegion is not an object`,
        }
      }
      return { target: { kind: 'highlightSource', manifestPath, node: source, slide, highlight } }
    }
  }

  return { warning: 'manifestPath does not point to an autofixable manifest object' }
}

function parseManifestPath(manifestPath: string): { tokens: string[] } | null {
  const hash = manifestPath.indexOf('#')
  if (hash < 0) return null
  if (manifestPath.slice(0, hash) !== 'manifest.json') return null
  const pointer = manifestPath.slice(hash + 1)
  if (!pointer.startsWith('/')) return null
  return {
    tokens: pointer.slice(1).split('/').map(unescapePointer),
  }
}

function ensureArray(parent: JsonObject, field: string): unknown[] | null {
  if (parent[field] === undefined) parent[field] = []
  return Array.isArray(parent[field]) ? parent[field] : null
}

function ensureObjectAt(items: unknown[], index: number): JsonObject | null {
  while (items.length <= index) items.push({})
  return isRecord(items[index]) ? items[index] : null
}

function ensureObjectField(parent: JsonObject, field: string, fallback: JsonObject): JsonObject | null {
  if (parent[field] === undefined || typeof parent[field] === 'boolean') {
    parent[field] = { ...fallback }
  }
  return isRecord(parent[field]) ? parent[field] : null
}

function metricSides(issue: LayoutSummaryIssue): string[] {
  const sides = issue.metrics?.sides
  if (Array.isArray(sides)) return sides.filter((side): side is string => typeof side === 'string')
  if (typeof sides === 'string') return sides.split(',').map((side) => side.trim()).filter(Boolean)
  return []
}

function defaultTextY(sides: string[]): number {
  if (sides.includes('bottom')) return 0.78
  if (sides.includes('top')) return 0.08
  return 0.16
}

function numberField(obj: JsonObject, field: string): number | undefined {
  const value = obj[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function arrayIndex(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  return Number(value)
}

function isSupportedIssueCode(code: string): code is LayoutIssueCode {
  return (
    code === 'text-overlap' ||
    code === 'badge-seam-overlap' ||
    code === 'safe-margin-overflow' ||
    code === 'highlight-popup-source-overlap' ||
    code === 'highlight-popup-overflow'
  )
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function unescapePointer(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
}

function formatValue(value: unknown): string {
  return value === undefined ? '(missing)' : JSON.stringify(value)
}
