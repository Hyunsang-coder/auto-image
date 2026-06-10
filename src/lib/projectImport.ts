// AI-authorable project manifest → full internal Project. The manifest is a
// thin schema over makeProject/makeSlide: it declares only what the factories
// can't infer — structure counts that create the caption slots the localize
// template fills by index, layout, locales. Caption text arrives via the
// localize CSV/JSON and screenshots by the bulk filename convention, so
// neither lives here. Authored schema is documented in docs/project-import.md.
// Pure (no store/React deps) so parsing/normalizing stays unit-testable.

import type {
  Background,
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
  MAX_TEXTS,
  ORNAMENT_DEFAULTS,
  SUPPORTED_LOCALES,
  TEMPLATE_FONT_SIZES,
  findThemePreset,
  headlinePlaceholder,
  makeOrnament,
  makeProject,
  makeTextBlock,
} from '../constants/defaults'
import { DEFAULT_MODEL, MODELS_BY_TYPE } from '../constants/deviceSpecs'

const MAX_SLIDES = 10
const MAX_ORNAMENTS = 5

// Device-transform clamps mirror the editor: scale matches FabricCanvas's
// drag clamp (0.3–2.0); offsets are editor-canvas px (EDITOR_CANVAS_WIDTH 440)
// bounded generously so a device can bleed off-canvas but never vanish.
const DEVICE_SCALE_MIN = 0.3
const DEVICE_SCALE_MAX = 2.0
const DEVICE_OFFSET_X_MAX = 400
const DEVICE_OFFSET_Y_MAX = 600
const CORNER_RADIUS_RATIO_MAX = 0.2 // matches the floating-card slider range
const CROP_EDGE_MAX = 0.45 // matches templateLayouts' clampEdge

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

// Imported slides are deliberately text + image only — no badge slots, so
// badge rows in the caption file are skipped (badges stay an editor feature).
export interface ParsedSlide {
  layout: TemplateType
  textBlocks: number
  background?: Background
  deviceFrame: ParsedDeviceFrame
  screenshotStyle?: ParsedScreenshotStyle
  ornaments?: ParsedOrnament[]
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

    return {
      layout,
      textBlocks,
      ...(background ? { background } : {}),
      deviceFrame: coerceDeviceFrame(s.deviceFrame, where, issues),
      ...(screenshotStyle ? { screenshotStyle } : {}),
      ...(ornaments ? { ornaments } : {}),
    }
  })

  return {
    manifest: { name, device, deviceModel, sourceLocale, targetLocales, themeBackground, slides },
    issues,
  }
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

  project.slides = project.slides.map((slide, i) => {
    const spec = manifest.slides[i]
    return {
      ...slide,
      template: spec.layout,
      // Rebuild all text blocks: per-layout font/align + source-locale
      // placeholder (makeProject seeded the ko default). Extra blocks start
      // empty — the caption file fills them by index.
      texts: Array.from({ length: spec.textBlocks }, (_, ti) =>
        makeTextBlock(ti, spec.layout, ti === 0 ? headlinePlaceholder(sourceLocale) : ''),
      ),
      ...(spec.background ? { background: structuredClone(spec.background) } : {}),
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
    }
  })
  return project
}
