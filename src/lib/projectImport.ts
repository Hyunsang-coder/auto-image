// AI-authorable project manifest → full internal Project. The manifest is a
// thin schema over makeProject/makeSlide: it declares only what the factories
// can't infer — structure counts that create the caption slots the localize
// template fills by index, layout, locales. Caption text arrives via the
// localize CSV/JSON and screenshots by the bulk filename convention, so
// neither lives here. Authored schema is documented in docs/project-import.md.
// Pure (no store/React deps) so parsing/normalizing stays unit-testable.

import type {
  Background,
  BadgeStyle,
  Caption,
  DeviceColor,
  DeviceModel,
  DeviceType,
  OrnamentShape,
  Project,
  ScreenshotCrop,
  TemplateType,
} from '../types/project'
import { t } from '../i18n'
import {
  DEFAULT_BACKGROUND,
  DEFAULT_SCREENSHOT_STYLE,
  DEFAULT_SOURCE_LOCALE,
  accentFromBackground,
  badgePlaceholder,
  MAX_TEXTS,
  ORNAMENT_DEFAULTS,
  SUPPORTED_LOCALES,
  TEMPLATE_FONT_SIZES,
  findThemePreset,
  headlinePlaceholder,
  makeBadge,
  makeHighlight,
  makeOrnament,
  makeProject,
  makeTextBlock,
  newId,
} from '../constants/defaults'
import { DEFAULT_MODEL, MODELS_BY_TYPE } from '../constants/deviceSpecs'

const MAX_SLIDES = 10
const MAX_ORNAMENTS = 5
const MAX_HIGHLIGHTS = 3 // a loupe per slide reads clean; more clutters the cut
const MAX_BADGES = 5
const HIGHLIGHT_DIM_MIN = 0.02 // a sampling window narrower than this is degenerate
const POPUP_WIDTH_MIN = 0.1
const POPUP_WIDTH_MAX = 1.5

// Device-transform clamps mirror the editor: scale matches FabricCanvas's
// drag clamp (0.3–2.0); offsets are editor-canvas px (EDITOR_CANVAS_WIDTH 440)
// bounded generously so a device can bleed off-canvas but never vanish.
const DEVICE_SCALE_MIN = 0.3
const DEVICE_SCALE_MAX = 2.0
const DEVICE_OFFSET_X_MAX = 400
const DEVICE_OFFSET_Y_MAX = 600
const CORNER_RADIUS_RATIO_MAX = 0.2 // matches the floating-card slider range
const CROP_EDGE_MAX = 0.5 // matches templateLayouts' clampEdge

// Per-caption style clamps. fontSize/box/outline/shadow values are editor-canvas
// px (440 base, like TEMPLATE_FONT_SIZES) — withScaledFonts multiplies them at
// export. boxWidth may exceed 1 (a wrap width wider than one page).
const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 200
const FONT_SCALE_MIN = 0.3
const FONT_SCALE_MAX = 4
const FONT_WEIGHT_MIN = 100
const FONT_WEIGHT_MAX = 900
const BOX_WIDTH_MIN = 0.1
const BOX_WIDTH_MAX = 2
const PAD_MAX = 200
const OUTLINE_WIDTH_MAX = 40
const SHADOW_OFFSET_MAX = 100
const SHADOW_BLUR_MAX = 100

// text-bottom anchors its caption at 74% of the canvas height, but a
// default-scale device spans 5%→83% and runs under the text. Editor-authored
// text-bottom slides tune scale/offset per slide; the import seeds a scale
// that keeps the default device above the text band (0.05 + 0.78·s ≤ ~0.72).
const TEXT_BOTTOM_DEVICE_SCALE = 0.85

/** Normalized manifest: defaults resolved, invalid values replaced + warned. */
export interface ParsedManifest {
  name: string
  device: DeviceType
  deviceModel: DeviceModel
  sourceLocale: string
  targetLocales: string[]
  themeBackground: Background
  slides: ParsedSlide[]
}

export interface ParsedSlide {
  layout: TemplateType
  textBlocks: number
  background?: Background
  deviceFrame: ParsedDeviceFrame
  screenshotStyle?: ParsedScreenshotStyle
  ornaments?: ParsedOrnament[]
  /** Absolute headline placement (0..1 of canvas). Set to override the
   *  layout's default text band — e.g. drop the headline toward a cropped
   *  feature card. Activated by textY; textX defaults to 0.5 (centered). */
  textX?: number
  textY?: number
  /** Per-text-block style/placement overrides, index-aligned to the block
   *  slots (0 = headline). Sparse: a slot may be an empty object (no override)
   *  to keep later indices aligned. */
  texts?: ParsedTextOverride[]
  /** Loupe magnifiers — each samples `sourceRegion` of the screenshot and can
   *  place a magnified card independently on the canvas. Ignored when the slide has no
   *  screenshot (e.g. a `hero` text-only slide). */
  highlights?: ParsedHighlight[]
  /** App Store-style badges/pills. Captions can fill them via `badge:N` rows. */
  badges?: ParsedBadge[]
  /** 2-page span marker. Valid only as adjacent leader/follower pairs. */
  span?: ParsedSpan
}

/** A loupe spec: which screenshot region to magnify and where/how big/tilted
 *  the popped card is. `popup.x/y` are optional for legacy source-attached
 *  placement; the other fields fall back to makeHighlight-compatible defaults. */
export interface ParsedHighlight {
  sourceRegion: { x: number; y: number; w: number; h: number }
  popup: { x?: number; y?: number; width: number; rotation?: number }
}

/** Per-caption style + placement override. All fields optional — absent ones
 *  keep the layout's per-block default (makeTextBlock). `pos` generalizes the
 *  headline-only textX/textY to any block. */
export interface ParsedTextOverride {
  /** Absolute editor px; overrides fontScale when both are set. */
  fontSize?: number
  /** Multiplier on the block's layout-default fontSize. */
  fontScale?: number
  /** Shrink long copy to the box width while preserving the authored max size. */
  fitToBox?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  weight?: number
  pos?: { x: number; y: number }
  boxWidth?: number
  box?: { fill: string; opacity: number; paddingX: number; paddingY: number; borderRadius: number }
  outline?: { color: string; width: number }
  shadow?: { color: string; opacity: number; offsetX: number; offsetY: number; blur: number }
}

export interface ParsedBadge {
  text?: string
  left?: number
  top?: number
  style?: Partial<Pick<BadgeStyle, 'backgroundColor' | 'textColor' | 'borderRadius' | 'paddingX' | 'paddingY' | 'fontSize' | 'fontWeight'>>
}

export interface ParsedSpan {
  group: string
  role: 'leader' | 'follower'
}

/** Manifest `deviceFrame`: bare boolean (show/hide, the v1 original) or an
 *  object adding the editor's device transform. Absent fields inherit the
 *  template's default placement. */
export interface ParsedDeviceFrame {
  show: boolean
  offsetX?: number
  offsetY?: number
  scale?: number
  rotation?: number
  color?: DeviceColor
}

/** Floating-card look — the renderer only acts on it when the frame is hidden,
 *  but it's parsed unconditionally so authors can set it before deciding. */
export interface ParsedScreenshotStyle {
  cornerRadiusRatio?: number
  shadow?: boolean
  crop?: ScreenshotCrop
}

/** Emoji decoration. `color` is kept for model compat but emoji ignore it. */
export interface ParsedOrnament {
  shape: OrnamentShape
  x?: number
  y?: number
  size?: number
  rotation?: number
  color?: string
  opacity?: number
}

export interface ManifestParseResult {
  manifest: ParsedManifest | null
  issues: string[]
}

/** Shape probe for routing a .json file: manifest vs caption template. */
export function isManifestShaped(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    Array.isArray((value as { slides?: unknown }).slides)
  )
}

const KNOWN_LOCALES = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code))

/** Accepts a THEME_PRESETS id or an inline solid/gradient background.
 *  `image` is rejected — an imageKey can't exist before the import runs. */
function coerceBackground(
  value: unknown,
  where: string,
  issues: string[],
): Background | undefined {
  if (typeof value === 'string') {
    const preset = findThemePreset(value)
    if (!preset) {
      issues.push(t('{where}: 알 수 없는 테마 프리셋 "{value}" — 기본 배경 사용', { where, value }))
      return undefined
    }
    return structuredClone(preset.background)
  }
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: 배경 형식이 올바르지 않음 — 기본 배경 사용', { where }))
    return undefined
  }
  const bg = value as Record<string, unknown>
  if (bg.type === 'solid' && typeof bg.color === 'string') {
    return { type: 'solid', color: bg.color }
  }
  if (bg.type === 'gradient') {
    const g = bg.gradient as
      | { kind?: unknown; direction?: unknown; stops?: unknown }
      | undefined
    const stops = Array.isArray(g?.stops)
      ? g.stops.filter(
          (s): s is { color: string; position: number } =>
            typeof s === 'object' &&
            s !== null &&
            typeof (s as { color?: unknown }).color === 'string' &&
            typeof (s as { position?: unknown }).position === 'number',
        )
      : []
    if (stops.length < 2) {
      issues.push(t('{where}: 그라디언트 stops가 2개 이상 필요 — 기본 배경 사용', { where }))
      return undefined
    }
    return {
      type: 'gradient',
      gradient: {
        ...(g?.kind === 'radial' ? { kind: 'radial' as const } : {}),
        direction: typeof g?.direction === 'number' ? g.direction : 145,
        stops,
      },
    }
  }
  issues.push(
    bg.type === 'image'
      ? t('{where}: image 배경은 manifest에서 지원하지 않음 — 기본 배경 사용', { where })
      : t('{where}: 배경 형식이 올바르지 않음 — 기본 배경 사용', { where }),
  )
  return undefined
}

/** Clamp an optional numeric field into [min, max]; non-numbers warn + drop. */
function coerceNumber(
  value: unknown,
  min: number,
  max: number,
  where: string,
  field: string,
  issues: string[],
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(t('{where}: {field} 값이 숫자가 아님 — 무시', { where, field }))
    return undefined
  }
  if (value < min || value > max) {
    issues.push(
      t('{where}: {field} {value}는 {min}~{max} 범위 밖 — 경계값으로 보정', {
        where, field, value, min, max,
      }),
    )
    return Math.max(min, Math.min(max, value))
  }
  return value
}

/** Normalize an optional rotation into (-180, 180]; non-numbers warn + drop. */
function coerceRotation(
  value: unknown,
  where: string,
  field: string,
  issues: string[],
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(t('{where}: {field} 값이 숫자가 아님 — 무시', { where, field }))
    return undefined
  }
  const r = ((value % 360) + 540) % 360 - 180
  return r === -180 ? 180 : r
}

/** Bare boolean (the v1 original) or the object form with device transform. */
function coerceDeviceFrame(
  value: unknown,
  where: string,
  issues: string[],
): ParsedDeviceFrame {
  if (value === undefined || value === true) return { show: true }
  if (value === false) return { show: false }
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: deviceFrame 형식이 올바르지 않음 — 기본값 사용', { where }))
    return { show: true }
  }
  const f = value as Record<string, unknown>
  const out: ParsedDeviceFrame = { show: f.show !== false }
  const offsetX = coerceNumber(f.offsetX, -DEVICE_OFFSET_X_MAX, DEVICE_OFFSET_X_MAX, where, 'deviceFrame.offsetX', issues)
  if (offsetX !== undefined) out.offsetX = offsetX
  const offsetY = coerceNumber(f.offsetY, -DEVICE_OFFSET_Y_MAX, DEVICE_OFFSET_Y_MAX, where, 'deviceFrame.offsetY', issues)
  if (offsetY !== undefined) out.offsetY = offsetY
  const scale = coerceNumber(f.scale, DEVICE_SCALE_MIN, DEVICE_SCALE_MAX, where, 'deviceFrame.scale', issues)
  if (scale !== undefined) out.scale = scale
  const rotation = coerceRotation(f.rotation, where, 'deviceFrame.rotation', issues)
  if (rotation !== undefined) out.rotation = rotation
  if (f.color !== undefined) {
    if (f.color === 'black' || f.color === 'silver') out.color = f.color
    else issues.push(t('{where}: deviceFrame.color는 black|silver — 무시', { where }))
  }
  return out
}

function coerceScreenshotStyle(
  value: unknown,
  where: string,
  issues: string[],
): ParsedScreenshotStyle | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: screenshotStyle 형식이 올바르지 않음 — 무시', { where }))
    return undefined
  }
  const s = value as Record<string, unknown>
  const out: ParsedScreenshotStyle = {}
  const ratio = coerceNumber(s.cornerRadiusRatio, 0, CORNER_RADIUS_RATIO_MAX, where, 'screenshotStyle.cornerRadiusRatio', issues)
  if (ratio !== undefined) out.cornerRadiusRatio = ratio
  if (s.shadow !== undefined) {
    if (typeof s.shadow === 'boolean') out.shadow = s.shadow
    else issues.push(t('{where}: screenshotStyle.shadow는 boolean — 무시', { where }))
  }
  if (s.crop !== undefined) {
    if (typeof s.crop === 'object' && s.crop !== null) {
      const c = s.crop as Record<string, unknown>
      out.crop = {
        top: coerceNumber(c.top, 0, CROP_EDGE_MAX, where, 'crop.top', issues) ?? 0,
        right: coerceNumber(c.right, 0, CROP_EDGE_MAX, where, 'crop.right', issues) ?? 0,
        bottom: coerceNumber(c.bottom, 0, CROP_EDGE_MAX, where, 'crop.bottom', issues) ?? 0,
        left: coerceNumber(c.left, 0, CROP_EDGE_MAX, where, 'crop.left', issues) ?? 0,
      }
    } else {
      issues.push(t('{where}: screenshotStyle.crop 형식이 올바르지 않음 — 무시', { where }))
    }
  }
  return out
}

function coerceOrnaments(
  value: unknown,
  where: string,
  issues: string[],
): ParsedOrnament[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    issues.push(t('{where}: ornaments는 배열이어야 함 — 무시', { where }))
    return undefined
  }
  let items = value
  if (items.length > MAX_ORNAMENTS) {
    issues.push(t('{where}: ornaments는 최대 {max}개 — 처음 {max}개만 사용', { where, max: MAX_ORNAMENTS }))
    items = items.slice(0, MAX_ORNAMENTS)
  }
  const out: ParsedOrnament[] = []
  items.forEach((rawOrn, j) => {
    const ow = t('{where} ornament {n}', { where, n: j + 1 })
    if (typeof rawOrn !== 'object' || rawOrn === null) {
      issues.push(t('{where}: 항목이 객체가 아님 — 제외', { where: ow }))
      return
    }
    const o = rawOrn as Record<string, unknown>
    if (typeof o.shape !== 'string' || !(o.shape in ORNAMENT_DEFAULTS)) {
      issues.push(t('{where}: 알 수 없는 shape "{shape}" — 제외', { where: ow, shape: String(o.shape) }))
      return
    }
    const orn: ParsedOrnament = { shape: o.shape as OrnamentShape }
    const x = coerceNumber(o.x, 0, 1, ow, 'x', issues)
    if (x !== undefined) orn.x = x
    const y = coerceNumber(o.y, 0, 1, ow, 'y', issues)
    if (y !== undefined) orn.y = y
    const size = coerceNumber(o.size, 0.02, 1, ow, 'size', issues)
    if (size !== undefined) orn.size = size
    const rotation = coerceRotation(o.rotation, ow, 'rotation', issues)
    if (rotation !== undefined) orn.rotation = rotation
    if (o.color !== undefined) {
      if (typeof o.color === 'string') orn.color = o.color
      else issues.push(t('{where}: color는 문자열 — 무시', { where: ow }))
    }
    const opacity = coerceNumber(o.opacity, 0, 1, ow, 'opacity', issues)
    if (opacity !== undefined) orn.opacity = opacity
    out.push(orn)
  })
  return out
}

function coerceBadgeStyle(
  value: unknown,
  where: string,
  issues: string[],
): ParsedBadge['style'] | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: badge.style 형식이 올바르지 않음 — 무시', { where }))
    return undefined
  }
  const raw = value as Record<string, unknown>
  const style: ParsedBadge['style'] = {}
  if (raw.backgroundColor !== undefined) {
    if (typeof raw.backgroundColor === 'string') style.backgroundColor = raw.backgroundColor
    else issues.push(t('{where}: badge.style.backgroundColor는 문자열 — 무시', { where }))
  }
  if (raw.textColor !== undefined) {
    if (typeof raw.textColor === 'string') style.textColor = raw.textColor
    else issues.push(t('{where}: badge.style.textColor는 문자열 — 무시', { where }))
  }
  const borderRadius = coerceNumber(raw.borderRadius, 0, PAD_MAX, where, 'badge.style.borderRadius', issues)
  if (borderRadius !== undefined) style.borderRadius = borderRadius
  const paddingX = coerceNumber(raw.paddingX, 0, PAD_MAX, where, 'badge.style.paddingX', issues)
  if (paddingX !== undefined) style.paddingX = paddingX
  const paddingY = coerceNumber(raw.paddingY, 0, PAD_MAX, where, 'badge.style.paddingY', issues)
  if (paddingY !== undefined) style.paddingY = paddingY
  const fontSize = coerceNumber(raw.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, where, 'badge.style.fontSize', issues)
  if (fontSize !== undefined) style.fontSize = fontSize
  const fontWeight = coerceNumber(raw.fontWeight, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX, where, 'badge.style.fontWeight', issues)
  if (fontWeight !== undefined) style.fontWeight = fontWeight
  return Object.keys(style).length ? style : undefined
}

function coerceBadges(
  value: unknown,
  where: string,
  issues: string[],
): ParsedBadge[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    issues.push(t('{where}: badges는 배열이어야 함 — 무시', { where }))
    return undefined
  }
  let items = value
  if (items.length > MAX_BADGES) {
    issues.push(t('{where}: badges는 최대 {max}개 — 처음 {max}개만 사용', { where, max: MAX_BADGES }))
    items = items.slice(0, MAX_BADGES)
  }
  const out: ParsedBadge[] = []
  items.forEach((rawBadge, j) => {
    const bw = t('{where} badge {n}', { where, n: j + 1 })
    if (typeof rawBadge !== 'object' || rawBadge === null) {
      issues.push(t('{where}: 항목이 객체가 아님 — 제외', { where: bw }))
      return
    }
    const b = rawBadge as Record<string, unknown>
    const badge: ParsedBadge = {}
    if (b.text !== undefined) {
      if (typeof b.text === 'string') badge.text = b.text
      else issues.push(t('{where}: text는 문자열 — 무시', { where: bw }))
    }
    const left = coerceNumber(b.left, 0, 1, bw, 'left', issues)
    if (left !== undefined) badge.left = left
    const top = coerceNumber(b.top, 0, 1, bw, 'top', issues)
    if (top !== undefined) badge.top = top
    const style = coerceBadgeStyle(b.style, bw, issues)
    if (style) badge.style = style
    out.push(badge)
  })
  return out
}

function coerceSpan(
  value: unknown,
  where: string,
  issues: string[],
): ParsedSpan | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: span은 {group, role} 객체여야 함 — 무시', { where }))
    return undefined
  }
  const raw = value as Record<string, unknown>
  const group = typeof raw.group === 'string' ? raw.group.trim() : ''
  if (!group) {
    issues.push(t('{where}: span.group이 필요 — span 무시', { where }))
    return undefined
  }
  if (raw.role !== 'leader' && raw.role !== 'follower') {
    issues.push(t('{where}: span.role은 leader|follower — span 무시', { where }))
    return undefined
  }
  return { group, role: raw.role }
}

/** A caption `box` (fill pill): requires a string fill; numeric fields clamp
 *  with sensible defaults so a `{ "fill": "#000" }` still renders a usable pill. */
function coerceCaptionBox(
  value: unknown,
  where: string,
  issues: string[],
): ParsedTextOverride['box'] | undefined {
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: box 형식이 올바르지 않음 — 무시', { where }))
    return undefined
  }
  const b = value as Record<string, unknown>
  if (typeof b.fill !== 'string') {
    issues.push(t('{where}: box.fill(문자열)이 필요 — box 무시', { where }))
    return undefined
  }
  return {
    fill: b.fill,
    opacity: coerceNumber(b.opacity, 0, 1, where, 'box.opacity', issues) ?? 1,
    paddingX: coerceNumber(b.paddingX, 0, PAD_MAX, where, 'box.paddingX', issues) ?? 16,
    paddingY: coerceNumber(b.paddingY, 0, PAD_MAX, where, 'box.paddingY', issues) ?? 10,
    borderRadius: coerceNumber(b.borderRadius, 0, PAD_MAX, where, 'box.borderRadius', issues) ?? 12,
  }
}

function coerceOutline(
  value: unknown,
  where: string,
  issues: string[],
): ParsedTextOverride['outline'] | undefined {
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: outline 형식이 올바르지 않음 — 무시', { where }))
    return undefined
  }
  const o = value as Record<string, unknown>
  if (typeof o.color !== 'string') {
    issues.push(t('{where}: outline.color(문자열)이 필요 — outline 무시', { where }))
    return undefined
  }
  return { color: o.color, width: coerceNumber(o.width, 0, OUTLINE_WIDTH_MAX, where, 'outline.width', issues) ?? 2 }
}

function coerceTextShadow(
  value: unknown,
  where: string,
  issues: string[],
): ParsedTextOverride['shadow'] | undefined {
  if (typeof value !== 'object' || value === null) {
    issues.push(t('{where}: shadow 형식이 올바르지 않음 — 무시', { where }))
    return undefined
  }
  const s = value as Record<string, unknown>
  if (typeof s.color !== 'string') {
    issues.push(t('{where}: shadow.color(문자열)이 필요 — shadow 무시', { where }))
    return undefined
  }
  return {
    color: s.color,
    opacity: coerceNumber(s.opacity, 0, 1, where, 'shadow.opacity', issues) ?? 0.4,
    offsetX: coerceNumber(s.offsetX, -SHADOW_OFFSET_MAX, SHADOW_OFFSET_MAX, where, 'shadow.offsetX', issues) ?? 0,
    offsetY: coerceNumber(s.offsetY, -SHADOW_OFFSET_MAX, SHADOW_OFFSET_MAX, where, 'shadow.offsetY', issues) ?? 2,
    blur: coerceNumber(s.blur, 0, SHADOW_BLUR_MAX, where, 'shadow.blur', issues) ?? 6,
  }
}

/** Parse the per-slide `texts` array. Keeps array positions (invalid entries
 *  become `{}`) so index→block alignment survives a bad slot. */
function coerceTextOverrides(
  value: unknown,
  where: string,
  issues: string[],
): ParsedTextOverride[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    issues.push(t('{where}: texts는 배열이어야 함 — 무시', { where }))
    return undefined
  }
  let items = value
  if (items.length > MAX_TEXTS) {
    issues.push(t('{where}: texts는 최대 {max}개 — 처음 {max}개만 사용', { where, max: MAX_TEXTS }))
    items = items.slice(0, MAX_TEXTS)
  }
  return items.map((raw, j) => {
    const tw = t('{where} texts[{n}]', { where, n: j })
    if (typeof raw !== 'object' || raw === null) {
      if (raw !== undefined && raw !== null) issues.push(t('{where}: 항목이 객체가 아님 — 무시', { where: tw }))
      return {}
    }
    const r = raw as Record<string, unknown>
    const out: ParsedTextOverride = {}
    const fontSize = coerceNumber(r.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, tw, 'fontSize', issues)
    if (fontSize !== undefined) out.fontSize = fontSize
    const fontScale = coerceNumber(r.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX, tw, 'fontScale', issues)
    if (fontScale !== undefined) out.fontScale = fontScale
    if (r.fitToBox !== undefined) {
      if (typeof r.fitToBox === 'boolean') out.fitToBox = r.fitToBox
      else issues.push(t('{where}: fitToBox는 boolean — 무시', { where: tw }))
    }
    if (r.color !== undefined) {
      if (typeof r.color === 'string') out.color = r.color
      else issues.push(t('{where}: color는 문자열 — 무시', { where: tw }))
    }
    if (r.align !== undefined) {
      if (r.align === 'left' || r.align === 'center' || r.align === 'right') out.align = r.align
      else issues.push(t('{where}: align은 left|center|right — 무시', { where: tw }))
    }
    const weight = coerceNumber(r.weight, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX, tw, 'weight', issues)
    if (weight !== undefined) out.weight = weight
    if (r.pos !== undefined) {
      if (typeof r.pos === 'object' && r.pos !== null) {
        const p = r.pos as Record<string, unknown>
        const x = coerceNumber(p.x, 0, 1, tw, 'pos.x', issues)
        const y = coerceNumber(p.y, 0, 1, tw, 'pos.y', issues)
        if (x !== undefined && y !== undefined) out.pos = { x, y }
        else issues.push(t('{where}: pos는 x,y(0~1) 둘 다 필요 — 무시', { where: tw }))
      } else {
        issues.push(t('{where}: pos 형식이 올바르지 않음 — 무시', { where: tw }))
      }
    }
    const boxWidth = coerceNumber(r.boxWidth, BOX_WIDTH_MIN, BOX_WIDTH_MAX, tw, 'boxWidth', issues)
    if (boxWidth !== undefined) out.boxWidth = boxWidth
    if (r.box !== undefined) {
      const box = coerceCaptionBox(r.box, tw, issues)
      if (box) out.box = box
    }
    if (r.outline !== undefined) {
      const outline = coerceOutline(r.outline, tw, issues)
      if (outline) out.outline = outline
    }
    if (r.shadow !== undefined) {
      const shadow = coerceTextShadow(r.shadow, tw, issues)
      if (shadow) out.shadow = shadow
    }
    return out
  })
}

/** Parse the per-slide `highlights` array. Each entry's missing fields fall
 *  back to makeHighlight's defaults so a partial region still renders. */
function coerceHighlights(
  value: unknown,
  where: string,
  issues: string[],
): ParsedHighlight[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    issues.push(t('{where}: highlights는 배열이어야 함 — 무시', { where }))
    return undefined
  }
  let items = value
  if (items.length > MAX_HIGHLIGHTS) {
    issues.push(t('{where}: highlights는 최대 {max}개 — 처음 {max}개만 사용', { where, max: MAX_HIGHLIGHTS }))
    items = items.slice(0, MAX_HIGHLIGHTS)
  }
  const out: ParsedHighlight[] = []
  items.forEach((raw, j) => {
    const hw = t('{where} highlight {n}', { where, n: j + 1 })
    if (typeof raw !== 'object' || raw === null) {
      issues.push(t('{where}: 항목이 객체가 아님 — 제외', { where: hw }))
      return
    }
    const h = raw as Record<string, unknown>
    const sr = (typeof h.sourceRegion === 'object' && h.sourceRegion !== null
      ? h.sourceRegion
      : {}) as Record<string, unknown>
    if (h.sourceRegion !== undefined && (typeof h.sourceRegion !== 'object' || h.sourceRegion === null)) {
      issues.push(t('{where}: sourceRegion 형식이 올바르지 않음 — 기본값 사용', { where: hw }))
    }
    const p = (typeof h.popup === 'object' && h.popup !== null ? h.popup : {}) as Record<string, unknown>
    if (h.popup !== undefined && (typeof h.popup !== 'object' || h.popup === null)) {
      issues.push(t('{where}: popup 형식이 올바르지 않음 — 기본값 사용', { where: hw }))
    }
    const rotation = coerceRotation(p.rotation, hw, 'popup.rotation', issues)
    const popupX = coerceNumber(p.x, 0, 1, hw, 'popup.x', issues)
    const popupY = coerceNumber(p.y, 0, 1, hw, 'popup.y', issues)
    out.push({
      sourceRegion: {
        x: coerceNumber(sr.x, 0, 1, hw, 'sourceRegion.x', issues) ?? 0.08,
        y: coerceNumber(sr.y, 0, 1, hw, 'sourceRegion.y', issues) ?? 0.42,
        w: coerceNumber(sr.w, HIGHLIGHT_DIM_MIN, 1, hw, 'sourceRegion.w', issues) ?? 0.84,
        h: coerceNumber(sr.h, HIGHLIGHT_DIM_MIN, 1, hw, 'sourceRegion.h', issues) ?? 0.18,
      },
      popup: {
        ...(popupX !== undefined ? { x: popupX } : {}),
        ...(popupY !== undefined ? { y: popupY } : {}),
        width: coerceNumber(p.width, POPUP_WIDTH_MIN, POPUP_WIDTH_MAX, hw, 'popup.width', issues) ?? 0.78,
        ...(rotation !== undefined ? { rotation } : {}),
      },
    })
  })
  return out
}

/**
 * Parse + normalize a manifest JSON text. Never throws; recoverable problems
 * (unknown device/locale/layout, count out of range) fall back to defaults and
 * are reported as issues. Only a fatal problem (broken JSON, wrong version,
 * missing name/slides) yields `manifest: null`.
 */
export function parseManifest(text: string): ManifestParseResult {
  const issues: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { manifest: null, issues: [t('매니페스트 JSON을 파싱할 수 없습니다')] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { manifest: null, issues: [t('매니페스트는 JSON 객체여야 합니다')] }
  }
  const m = raw as Record<string, unknown>

  if (m.version !== 1) {
    return {
      manifest: null,
      issues: [t('지원하지 않는 매니페스트 버전: {ver} (version: 1 만 지원)', { ver: JSON.stringify(m.version) })],
    }
  }
  const name = typeof m.name === 'string' ? m.name.trim() : ''
  if (!name) {
    return { manifest: null, issues: [t('프로젝트 이름(name)이 필요합니다')] }
  }
  if (!Array.isArray(m.slides) || m.slides.length === 0) {
    return { manifest: null, issues: [t('슬라이드(slides)가 최소 1장 필요합니다')] }
  }
  let rawSlides = m.slides as unknown[]
  if (rawSlides.length > MAX_SLIDES) {
    issues.push(t('슬라이드는 최대 {max}장 — {n}장 중 처음 {max}장만 사용', { max: MAX_SLIDES, n: rawSlides.length }))
    rawSlides = rawSlides.slice(0, MAX_SLIDES)
  }

  let device: DeviceType = 'iphone'
  if (m.device !== undefined) {
    if (m.device === 'iphone' || m.device === 'ipad') device = m.device
    else issues.push(t('알 수 없는 device "{device}" — iphone 사용', { device: String(m.device) }))
  }

  let deviceModel: DeviceModel = DEFAULT_MODEL[device]
  if (m.deviceModel !== undefined) {
    if (MODELS_BY_TYPE[device].includes(m.deviceModel as DeviceModel)) {
      deviceModel = m.deviceModel as DeviceModel
    } else {
      issues.push(t('"{model}"는 {device}의 모델이 아님 — {fallback} 사용', { model: String(m.deviceModel), device, fallback: deviceModel }))
    }
  }

  let sourceLocale = DEFAULT_SOURCE_LOCALE
  if (m.sourceLocale !== undefined) {
    if (typeof m.sourceLocale === 'string' && KNOWN_LOCALES.has(m.sourceLocale)) {
      sourceLocale = m.sourceLocale
    } else {
      issues.push(t('지원하지 않는 sourceLocale "{locale}" — {fallback} 사용', { locale: String(m.sourceLocale), fallback: DEFAULT_SOURCE_LOCALE }))
    }
  }

  const targetLocales: string[] = []
  if (m.targetLocales !== undefined) {
    if (!Array.isArray(m.targetLocales)) {
      issues.push(t('targetLocales는 배열이어야 함 — 무시'))
    } else {
      for (const code of m.targetLocales) {
        if (typeof code !== 'string' || !KNOWN_LOCALES.has(code)) {
          issues.push(t('지원하지 않는 targetLocale "{code}" — 제외', { code: String(code) }))
        } else if (code !== sourceLocale && !targetLocales.includes(code)) {
          targetLocales.push(code)
        }
      }
    }
  }

  const themeBackground =
    m.themeBackground !== undefined
      ? (coerceBackground(m.themeBackground, 'themeBackground', issues) ??
        structuredClone(DEFAULT_BACKGROUND))
      : structuredClone(DEFAULT_BACKGROUND)

  const slides: ParsedSlide[] = rawSlides.map((rawSlide, i) => {
    const where = t('슬라이드 {n}', { n: i + 1 })
    const s = (
      typeof rawSlide === 'object' && rawSlide !== null ? rawSlide : {}
    ) as Record<string, unknown>
    if (typeof rawSlide !== 'object' || rawSlide === null) {
      issues.push(t('{where}: 슬라이드 항목이 객체가 아님 — 기본값 사용', { where }))
    }

    let layout: TemplateType = 'text-top'
    if (s.layout !== undefined) {
      if (typeof s.layout === 'string' && s.layout in TEMPLATE_FONT_SIZES) {
        layout = s.layout as TemplateType
      } else {
        issues.push(t('{where}: 알 수 없는 layout "{layout}" — text-top 사용', { where, layout: String(s.layout) }))
      }
    }

    let textBlocks = 1
    if (s.textBlocks !== undefined) {
      const n = typeof s.textBlocks === 'number' ? Math.floor(s.textBlocks) : NaN
      if (Number.isInteger(n) && n >= 1 && n <= MAX_TEXTS) {
        textBlocks = n
      } else {
        issues.push(t('{where}: textBlocks는 1~{max} — 1 사용', { where, max: MAX_TEXTS }))
      }
    }

    const background =
      s.background !== undefined
        ? coerceBackground(s.background, where, issues)
        : undefined

    const screenshotStyle = coerceScreenshotStyle(s.screenshotStyle, where, issues)
    const ornaments = coerceOrnaments(s.ornaments, where, issues)
    const textX = coerceNumber(s.textX, 0, 1, where, 'textX', issues)
    const textY = coerceNumber(s.textY, 0, 1, where, 'textY', issues)
    const texts = coerceTextOverrides(s.texts, where, issues)
    const highlights = coerceHighlights(s.highlights, where, issues)
    const badges = coerceBadges(s.badges, where, issues)
    const span = coerceSpan(s.span, where, issues)

    return {
      layout,
      textBlocks,
      ...(background ? { background } : {}),
      deviceFrame: coerceDeviceFrame(s.deviceFrame, where, issues),
      ...(screenshotStyle ? { screenshotStyle } : {}),
      ...(ornaments ? { ornaments } : {}),
      ...(textX !== undefined ? { textX } : {}),
      ...(textY !== undefined ? { textY } : {}),
      ...(texts ? { texts } : {}),
      ...(highlights ? { highlights } : {}),
      ...(badges ? { badges } : {}),
      ...(span ? { span } : {}),
    }
  })

  validateSpanPairs(slides, issues)

  return {
    manifest: { name, device, deviceModel, sourceLocale, targetLocales, themeBackground, slides },
    issues,
  }
}

function validateSpanPairs(slides: ParsedSlide[], issues: string[]): void {
  const byGroup = new Map<string, Array<{ index: number; role: ParsedSpan['role'] }>>()
  slides.forEach((slide, index) => {
    if (!slide.span) return
    const members = byGroup.get(slide.span.group) ?? []
    members.push({ index, role: slide.span.role })
    byGroup.set(slide.span.group, members)
  })

  for (const [group, members] of byGroup) {
    const leader = members.find((m) => m.role === 'leader')
    const follower = members.find((m) => m.role === 'follower')
    const valid =
      members.length === 2 &&
      !!leader &&
      !!follower &&
      follower.index === leader.index + 1
    if (valid) continue
    issues.push(t('span "{group}"은 인접한 leader/follower 한 쌍이어야 함 — span 무시', { group }))
    for (const member of members) slides[member.index].span = undefined
  }
}

/** Apply a parsed per-block override onto a factory-built caption (mutates).
 *  fontSize wins over fontScale; pos here supersedes the headline textX/textY. */
function applyTextOverride(block: Caption, ov: ParsedTextOverride | undefined): void {
  if (!ov) return
  if (ov.fontSize !== undefined) block.style.fontSize = ov.fontSize
  else if (ov.fontScale !== undefined) block.style.fontSize = Math.round(block.style.fontSize * ov.fontScale)
  if (ov.fitToBox !== undefined) block.style.fitToBox = ov.fitToBox
  if (ov.color !== undefined) block.style.color = ov.color
  if (ov.weight !== undefined) block.style.fontWeight = ov.weight
  if (ov.align !== undefined) block.style.textAlign = ov.align
  if (ov.pos !== undefined) block.pos = { ...ov.pos }
  if (ov.boxWidth !== undefined) block.boxWidth = ov.boxWidth
  if (ov.box !== undefined) block.style.box = { ...ov.box }
  if (ov.outline !== undefined) block.style.outline = { ...ov.outline }
  if (ov.shadow !== undefined) block.style.shadow = { ...ov.shadow }
}

/**
 * Materialize a normalized manifest into a full Project via the existing
 * factories, so ids/styles/placements stay correct. Total — every recoverable
 * problem was already normalized away in parseManifest.
 */
export function buildProjectFromManifest(manifest: ParsedManifest): Project {
  const { device, deviceModel, sourceLocale } = manifest
  const project = makeProject({
    name: manifest.name,
    devices: [device],
    deviceModels: { [device]: deviceModel },
    screenshotCount: manifest.slides.length,
    themeBackground: manifest.themeBackground,
  })
  // makeProject hardcodes the default locales — the manifest's win.
  project.sourceLocale = sourceLocale
  project.targetLocales = [...manifest.targetLocales]

  const spanGroupIds = new Map<string, string>()
  project.slides = project.slides.map((slide, i) => {
    const spec = manifest.slides[i]
    const background = spec.background ? structuredClone(spec.background) : slide.background
    let spanGroupId: string | undefined
    let spanRole: ParsedSpan['role'] | undefined
    if (spec.span) {
      spanGroupId = spanGroupIds.get(spec.span.group) ?? newId('span')
      spanGroupIds.set(spec.span.group, spanGroupId)
      spanRole = spec.span.role
    }
    return {
      ...slide,
      template: spec.layout,
      // Rebuild all text blocks: per-layout font/align + source-locale
      // placeholder (makeProject seeded the ko default). Extra blocks start
      // empty — the caption file fills them by index. An explicit textY drops
      // the headline (text:0) to an absolute position; later blocks still
      // stack from the layout default.
      texts: Array.from({ length: spec.textBlocks }, (_, ti) => {
        const block = makeTextBlock(ti, spec.layout, ti === 0 ? headlinePlaceholder(sourceLocale) : '')
        if (ti === 0 && spec.textY !== undefined) {
          block.pos = { x: spec.textX ?? 0.5, y: spec.textY }
        }
        applyTextOverride(block, spec.texts?.[ti])
        return block
      }),
      background,
      deviceFrame: {
        ...slide.deviceFrame,
        show: spec.deviceFrame.show,
        ...(spec.deviceFrame.offsetX !== undefined ? { offsetX: spec.deviceFrame.offsetX } : {}),
        ...(spec.deviceFrame.offsetY !== undefined ? { offsetY: spec.deviceFrame.offsetY } : {}),
        ...(spec.deviceFrame.rotation !== undefined ? { rotation: spec.deviceFrame.rotation } : {}),
        ...(spec.deviceFrame.color !== undefined ? { color: spec.deviceFrame.color } : {}),
        // text-bottom auto-seed only fires when the manifest didn't say —
        // an explicit scale is a deliberate override of the layout default.
        ...(spec.deviceFrame.scale !== undefined
          ? { scale: spec.deviceFrame.scale }
          : spec.layout === 'text-bottom'
            ? { scale: TEXT_BOTTOM_DEVICE_SCALE }
            : {}),
      },
      ...(spec.screenshotStyle
        ? {
            screenshotStyle: {
              ...DEFAULT_SCREENSHOT_STYLE,
              ...(spec.screenshotStyle.cornerRadiusRatio !== undefined
                ? { cornerRadiusRatio: spec.screenshotStyle.cornerRadiusRatio }
                : {}),
              ...(spec.screenshotStyle.shadow !== undefined ? { shadow: spec.screenshotStyle.shadow } : {}),
              ...(spec.screenshotStyle.crop ? { crop: { ...spec.screenshotStyle.crop } } : {}),
            },
          }
        : {}),
      ...(spec.ornaments !== undefined
        ? { ornaments: spec.ornaments.map((o) => makeOrnament(o.shape, o)) }
        : {}),
      ...(spec.highlights !== undefined
        ? { highlights: spec.highlights.map((h) => makeHighlight(h)) }
        : {}),
      ...(spec.badges !== undefined
        ? {
            badges: spec.badges.map((b) => {
              const badge = makeBadge(b.text ?? badgePlaceholder(sourceLocale), accentFromBackground(background))
              return {
                ...badge,
                ...(b.left !== undefined ? { left: b.left } : {}),
                ...(b.top !== undefined ? { top: b.top } : {}),
                ...(b.style ? { style: { ...badge.style, ...b.style } } : {}),
              }
            }),
          }
        : {}),
      ...(spanGroupId ? { spanGroupId, spanRole } : {}),
    }
  })
  return project
}
