// Surgical patch over a (bundle-loaded) Project: change one slide · one locale ·
// one field, or one whitelisted layout knob, preserving everything else
// bit-for-bit. The address vocabulary — 1-based `slide` or `slideId`, `field`,
// locale routing (=== sourceLocale → base, else translation/override) — mirrors
// the localize template + manifest import, and every op delegates to the same
// validators the import already uses (localePatch / projectImport coercers), so
// there's almost no new validation logic.
//
// Pure: no store/React/idb. `setScreenshot` takes a decoded {imageKey,width,
// height} and only mutates the project JSON — the CLI decodes files and places
// the blobs. Never throws; every rejection/clamp lands in `issues`.

import type { Caption, Project, Slide } from '../types/project'
import {
  DEFAULT_SCREENSHOT_STYLE,
  SUPPORTED_LOCALES,
  TEMPLATE_FONT_SIZES,
  makeHighlight,
  makeOrnament,
} from '../constants/defaults'
import { DEFAULT_MODEL, MODELS_BY_TYPE, detectTypeFromAspect, typeOfModel } from '../constants/deviceSpecs'
import { buildImportPatch, type FieldKey } from './localePatch'
import {
  applyTextOverride,
  coerceBackground,
  coerceBadgeStyle,
  coerceDeviceFrame,
  coerceHighlights,
  coerceOrnaments,
  coerceScreenshotStyle,
  coerceTextOverrides,
  type ParsedTextOverride,
} from './projectImport'

export interface PatchOp {
  op: 'setText' | 'setScreenshot' | 'set'
  /** 1-based slide index or a slideId. Omitted on a project-scoped `set`. */
  slide?: number | string
  /** Explicit slideId (alternative to a string `slide`). */
  slideId?: string
  /** setText: headline | subheadline | text:N | badge:N */
  field?: string
  locale?: string
  value?: unknown
  /** set: dotted path under the slide (or project when slide is omitted). */
  path?: string
  /** setScreenshot: decoded blob pointer + dims (the CLI fills these from `file`). */
  imageKey?: string
  width?: number
  height?: number
  /** setScreenshot base: re-detect device model from the new aspect (default keeps the frame). */
  redetect?: boolean
}

export interface ApplyPatchResult {
  project: Project
  issues: string[]
}

const KNOWN_LOCALES = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code))

// Shared layers are leader-owned in a span pair; only `texts` are per-slide, so
// these paths are rejected when addressed to a follower (edit the leader).
const FOLLOWER_SHARED_PREFIXES = ['background', 'template', 'deviceFrame', 'screenshotStyle', 'ornaments', 'highlights', 'badges']

// TextStyle field name → ParsedTextOverride field name, so `texts[i].style.*`
// rides the same coercion/apply path as the manifest's per-block overrides.
const STYLE_TO_OVERRIDE: Record<string, keyof ParsedTextOverride> = {
  color: 'color',
  fontSize: 'fontSize',
  fontWeight: 'weight',
  textAlign: 'align',
  fitToBox: 'fitToBox',
  box: 'box',
  outline: 'outline',
  shadow: 'shadow',
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** headline/subheadline aliases → text:N; passes text:N / badge:N through. */
function normalizeField(field: string | undefined): FieldKey | null {
  if (field === 'headline') return 'text:0'
  if (field === 'subheadline') return 'text:1'
  if (/^text:\d+$/.test(field ?? '')) return field as FieldKey
  if (/^badge:\d+$/.test(field ?? '')) return field as FieldKey
  return null
}

function resolveSlide(project: Project, op: PatchOp, issues: string[]): { slide: Slide; index: number } | null {
  const id = op.slideId ?? (typeof op.slide === 'string' ? op.slide : undefined)
  if (id !== undefined) {
    const index = project.slides.findIndex((s) => s.id === id)
    if (index < 0) {
      issues.push(`slideId "${id}" not found`)
      return null
    }
    return { slide: project.slides[index], index }
  }
  if (typeof op.slide === 'number') {
    const index = op.slide - 1
    if (index < 0 || index >= project.slides.length) {
      issues.push(`slide ${op.slide} out of range (1..${project.slides.length})`)
      return null
    }
    return { slide: project.slides[index], index }
  }
  issues.push('slide (1-based index or slideId) is required')
  return null
}

function addTargetLocale(project: Project, locale: string): void {
  if (locale !== project.sourceLocale && !project.targetLocales.includes(locale)) {
    project.targetLocales.push(locale)
  }
}

function applySetText(project: Project, op: PatchOp, issues: string[]): void {
  const resolved = resolveSlide(project, op, issues)
  if (!resolved) return
  const field = normalizeField(op.field)
  if (!field) {
    issues.push(`setText: unknown field "${op.field}"`)
    return
  }
  if (!op.locale) {
    issues.push('setText: locale is required')
    return
  }
  if (!KNOWN_LOCALES.has(op.locale)) {
    issues.push(`setText: unsupported locale "${op.locale}"`)
    return
  }
  if (typeof op.value !== 'string') {
    issues.push('setText: value must be a string')
    return
  }
  if (resolved.slide.spanRole === 'follower' && field.startsWith('badge:')) {
    issues.push(`setText rejected: badges are leader-owned on a span pair — address the leader (slide ${resolved.index})`)
    return
  }
  const patch = buildImportPatch(project.slides, resolved.slide.id, field, op.locale, op.value, project.sourceLocale)
  if (!patch) {
    issues.push(`setText: slide has no ${field} slot`)
    return
  }
  project.slides[resolved.index] = { ...project.slides[resolved.index], ...patch }
  addTargetLocale(project, op.locale)
}

function applySetScreenshot(project: Project, op: PatchOp, issues: string[]): void {
  const resolved = resolveSlide(project, op, issues)
  if (!resolved) return
  const { slide, index } = resolved
  if (!op.locale) {
    issues.push('setScreenshot: locale is required')
    return
  }
  if (op.imageKey === undefined || op.width === undefined || op.height === undefined) {
    issues.push('setScreenshot: imageKey/width/height are required (the CLI decodes them from `file`)')
    return
  }
  if (slide.spanRole === 'follower') {
    issues.push(`setScreenshot rejected: the screenshot is leader-owned on a span pair — address the leader (slide ${index})`)
    return
  }
  const isBase = op.locale === project.sourceLocale
  if (isBase) {
    if (slide.template === 'hero') {
      issues.push(`setScreenshot: slide ${op.slide ?? slide.id} is text-only (hero) — no screenshot`)
      return
    }
    const detectedType = detectTypeFromAspect(op.width, op.height)
    const canvasType = typeOfModel(slide.deviceFrame.model)
    const crossType = detectedType !== canvasType
    let frameOverride: Partial<typeof slide.deviceFrame> = {}
    if (op.redetect) {
      const detected = project.deviceModels?.[detectedType] ?? DEFAULT_MODEL[detectedType]
      frameOverride = crossType
        ? { frameModel: detected }
        : detected !== slide.deviceFrame.model
          ? { model: detected, frameModel: undefined }
          : slide.deviceFrame.frameModel !== undefined
            ? { frameModel: undefined }
            : {}
    } else if (crossType) {
      issues.push(
        `setScreenshot: slide image aspect looks like ${detectedType} but the frame is ${canvasType} — kept the frame (pass "redetect": true to switch)`,
      )
    }
    const next = project.slides[index]
    project.slides[index] = {
      ...next,
      screenshot: {
        id: op.imageKey,
        imageKey: op.imageKey,
        originalWidth: op.width,
        originalHeight: op.height,
        ...(next.screenshot?.localeOverrides ? { localeOverrides: next.screenshot.localeOverrides } : {}),
        ...(next.screenshot?.localeSource ? { localeSource: next.screenshot.localeSource } : {}),
      },
      ...(Object.keys(frameOverride).length ? { deviceFrame: { ...next.deviceFrame, ...frameOverride } } : {}),
    }
    return
  }
  // Per-locale override.
  if (!KNOWN_LOCALES.has(op.locale)) {
    issues.push(`setScreenshot: unsupported locale "${op.locale}"`)
    return
  }
  if (!slide.screenshot) {
    issues.push(`setScreenshot: slide has no base screenshot — cannot attach a ${op.locale} override`)
    return
  }
  const next = project.slides[index]
  project.slides[index] = {
    ...next,
    screenshot: {
      ...next.screenshot!,
      localeOverrides: {
        ...next.screenshot!.localeOverrides,
        [op.locale]: { imageKey: op.imageKey, originalWidth: op.width, originalHeight: op.height },
      },
    },
  }
  addTargetLocale(project, op.locale)
}

function applyProjectSet(project: Project, path: string, value: unknown, issues: string[]): void {
  switch (path) {
    case 'name':
      if (typeof value === 'string' && value.trim()) project.name = value.trim()
      else issues.push('set name: value must be a non-empty string')
      return
    case 'sourceLocale':
      if (typeof value === 'string' && KNOWN_LOCALES.has(value)) {
        project.sourceLocale = value
        // Keep the invariant sourceLocale ∉ targetLocales (the targetLocales
        // setter below enforces the same); leaving the overlap corrupts the
        // localize template (a duplicate source column).
        project.targetLocales = project.targetLocales.filter((l) => l !== value)
      } else issues.push(`set sourceLocale: unsupported locale "${String(value)}"`)
      return
    case 'targetLocales': {
      if (!Array.isArray(value)) {
        issues.push('set targetLocales: value must be an array')
        return
      }
      const clean: string[] = []
      for (const code of value) {
        if (typeof code === 'string' && KNOWN_LOCALES.has(code)) {
          if (code !== project.sourceLocale && !clean.includes(code)) clean.push(code)
        } else issues.push(`set targetLocales: unsupported locale "${String(code)}" — skipped`)
      }
      project.targetLocales = clean
      return
    }
    case 'deviceModels': {
      if (!isObj(value)) {
        issues.push('set deviceModels: value must be an object')
        return
      }
      const next = { ...project.deviceModels }
      for (const [type, model] of Object.entries(value)) {
        if (type !== 'iphone' && type !== 'ipad') {
          issues.push(`set deviceModels: unknown device type "${type}" — skipped`)
        } else if (MODELS_BY_TYPE[type].includes(model as never)) {
          next[type] = model as never
          // Resize every slide of this type. Render/export resolution follows
          // slide.deviceFrame.model (renderSlide reads DEVICE_SPECS[model]), so
          // updating deviceModels alone is invisible — mirror the store's
          // setDeviceSize same-type remap.
          project.slides = project.slides.map((s) =>
            typeOfModel(s.deviceFrame.model) === type
              ? { ...s, deviceFrame: { ...s.deviceFrame, model: model as never } }
              : s,
          )
        } else {
          issues.push(`set deviceModels: "${String(model)}" is not a ${type} model — skipped`)
        }
      }
      project.deviceModels = next
      return
    }
    default:
      issues.push(`set: unsupported project path "${path}"`)
  }
}

function applyTextPath(caption: Caption, rest: string | undefined, value: unknown, where: string, issues: string[]): void {
  let override: ParsedTextOverride | null
  if (rest === undefined) {
    override = isObj(value) ? (value as ParsedTextOverride) : null
    if (!override) issues.push(`${where}: texts override must be an object`)
  } else if (rest === 'pos') {
    override = { pos: value as ParsedTextOverride['pos'] }
  } else if (rest === 'boxWidth') {
    override = { boxWidth: value as number }
  } else if (rest === 'style' || rest.startsWith('style.')) {
    override = {}
    const entries: [string, unknown][] | null =
      rest === 'style' ? (isObj(value) ? Object.entries(value) : null) : [[rest.slice('style.'.length), value]]
    if (!entries) {
      issues.push(`${where}: style must be an object`)
      return
    }
    for (const [k, v] of entries) {
      const key = STYLE_TO_OVERRIDE[k]
      if (key) (override as Record<string, unknown>)[key] = v
      else issues.push(`${where}: unsupported text style field "${k}"`)
    }
  } else {
    issues.push(`${where}: unsupported text path "texts[..].${rest}"`)
    return
  }
  if (!override) return
  const [parsed] = coerceTextOverrides([override], where, issues) ?? []
  if (parsed) applyTextOverride(caption, parsed)
}

function applySlideSet(project: Project, slide: Slide, index: number, path: string, value: unknown, issues: string[]): void {
  // Forbidden: identity/structure fields and the image pointer (use setScreenshot).
  if (/^(id|index|imageKey|spanGroupId|spanRole|screenshot)\b/.test(path)) {
    issues.push(`set rejected: "${path}" is not patchable (use setScreenshot for images; ids/structure are immutable)`)
    return
  }
  if (slide.spanRole === 'follower' && FOLLOWER_SHARED_PREFIXES.some((p) => path === p || path.startsWith(`${p}[`) || path.startsWith(`${p}.`))) {
    issues.push(`set rejected: "${path}" is a leader-owned layer on a span pair — address the leader (slide ${index})`)
    return
  }
  const next = project.slides[index]

  if (path === 'background') {
    const bg = coerceBackground(value, `slide ${index + 1}`, issues)
    if (bg) next.background = bg
    return
  }
  if (path === 'template') {
    if (typeof value === 'string' && value in TEMPLATE_FONT_SIZES) next.template = value as Slide['template']
    else issues.push(`set template: unknown template "${String(value)}"`)
    return
  }
  if (path === 'deviceFrame' || path.startsWith('deviceFrame.')) {
    const leaves: [string, unknown][] | null = path === 'deviceFrame'
      ? isObj(value) ? Object.entries(value) : null
      : [[path.slice('deviceFrame.'.length), value]]
    if (!leaves) {
      issues.push('set deviceFrame: value must be an object')
      return
    }
    for (const [leaf, v] of leaves) applyDeviceFrameLeaf(next, leaf, v, `slide ${index + 1}`, issues)
    return
  }
  if (path === 'screenshotStyle' || path.startsWith('screenshotStyle.')) {
    const leaves: [string, unknown][] | null = path === 'screenshotStyle'
      ? isObj(value) ? Object.entries(value) : null
      : [[path.slice('screenshotStyle.'.length), value]]
    if (!leaves) {
      issues.push('set screenshotStyle: value must be an object')
      return
    }
    if (!next.screenshotStyle) next.screenshotStyle = { ...DEFAULT_SCREENSHOT_STYLE }
    const parsed = coerceScreenshotStyle(Object.fromEntries(leaves), `slide ${index + 1}`, issues)
    if (parsed?.cornerRadiusRatio !== undefined) next.screenshotStyle.cornerRadiusRatio = parsed.cornerRadiusRatio
    if (parsed?.shadow !== undefined) next.screenshotStyle.shadow = parsed.shadow
    if (parsed?.crop !== undefined) next.screenshotStyle.crop = parsed.crop
    return
  }
  if (path === 'ornaments') {
    const parsed = coerceOrnaments(value, `slide ${index + 1}`, issues)
    if (parsed) next.ornaments = parsed.map((o) => makeOrnament(o.shape, o))
    return
  }
  if (path === 'highlights') {
    const parsed = coerceHighlights(value, `slide ${index + 1}`, issues)
    if (parsed) next.highlights = parsed.map((h) => makeHighlight(h))
    return
  }
  const textMatch = path.match(/^texts\[(\d+)\](?:\.(.+))?$/)
  if (textMatch) {
    const ti = Number(textMatch[1])
    if (!next.texts[ti]) {
      issues.push(`set: slide ${index + 1} has no texts[${ti}]`)
      return
    }
    applyTextPath(next.texts[ti], textMatch[2], value, `slide ${index + 1} texts[${ti}]`, issues)
    return
  }
  const badgeMatch = path.match(/^badges\[(\d+)\](?:\.(.+))?$/)
  if (badgeMatch) {
    const bi = Number(badgeMatch[1])
    if (!next.badges?.[bi]) {
      issues.push(`set: slide ${index + 1} has no badges[${bi}]`)
      return
    }
    const rest = badgeMatch[2]
    const styleInput = rest === 'style' ? value : rest?.startsWith('style.') ? { [rest.slice('style.'.length)]: value } : null
    if (!styleInput) {
      issues.push(`set: only badges[i].style is patchable (badge text → setText)`)
      return
    }
    const parsed = coerceBadgeStyle(styleInput, `slide ${index + 1} badge ${bi + 1}`, issues)
    if (parsed) next.badges[bi] = { ...next.badges[bi], style: { ...next.badges[bi].style, ...parsed } }
    return
  }
  issues.push(`set: unsupported path "${path}"`)
}

function applyDeviceFrameLeaf(slide: Slide, leaf: string, value: unknown, where: string, issues: string[]): void {
  if (leaf === 'show') {
    if (typeof value === 'boolean') slide.deviceFrame.show = value
    else issues.push(`${where}: deviceFrame.show must be a boolean`)
    return
  }
  const parsed = coerceDeviceFrame({ [leaf]: value }, where, issues)
  switch (leaf) {
    case 'scale':
      if (parsed.scale !== undefined) slide.deviceFrame.scale = parsed.scale
      return
    case 'offsetX':
      if (parsed.offsetX !== undefined) slide.deviceFrame.offsetX = parsed.offsetX
      return
    case 'offsetY':
      if (parsed.offsetY !== undefined) slide.deviceFrame.offsetY = parsed.offsetY
      return
    case 'rotation':
      if (parsed.rotation !== undefined) slide.deviceFrame.rotation = parsed.rotation
      return
    case 'color':
      if (parsed.color !== undefined) slide.deviceFrame.color = parsed.color
      return
    default:
      issues.push(`${where}: unsupported deviceFrame field "${leaf}"`)
  }
}

function applySet(project: Project, op: PatchOp, issues: string[]): void {
  if (!op.path) {
    issues.push('set: path is required')
    return
  }
  if (op.slide === undefined && op.slideId === undefined) {
    applyProjectSet(project, op.path, op.value, issues)
    return
  }
  const resolved = resolveSlide(project, op, issues)
  if (!resolved) return
  applySlideSet(project, resolved.slide, resolved.index, op.path, op.value, issues)
}

/**
 * Apply an ordered list of patch ops to a copy of `project`. Never mutates the
 * input. Ops run sequentially, so a later op sees earlier edits. Unknown ops,
 * rejected paths, and clamped values are reported in `issues`.
 */
export function applyPatch(project: Project, ops: PatchOp[]): ApplyPatchResult {
  const out = structuredClone(project)
  const issues: string[] = []
  if (!Array.isArray(ops)) {
    return { project: out, issues: ['patch must be an array of ops'] }
  }
  ops.forEach((op, i) => {
    if (!isObj(op) || typeof op.op !== 'string') {
      issues.push(`op ${i}: not a valid op object`)
      return
    }
    switch (op.op) {
      case 'setText':
        applySetText(out, op, issues)
        return
      case 'setScreenshot':
        applySetScreenshot(out, op, issues)
        return
      case 'set':
        applySet(out, op, issues)
        return
      default:
        issues.push(`op ${i}: unknown op "${op.op}"`)
    }
  })
  return { project: out, issues }
}
