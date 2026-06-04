// AI-authorable project manifest → full internal Project. The manifest is a
// thin schema over makeProject/makeSlide: it declares only what the factories
// can't infer — structure counts that create the caption slots the localize
// template fills by index, layout, locales. Caption text arrives via the
// localize CSV/JSON and screenshots by the bulk filename convention, so
// neither lives here. Authored schema is documented in docs/project-import.md.
// Pure (no store/React deps) so parsing/normalizing stays unit-testable.

import type {
  Background,
  DeviceModel,
  DeviceType,
  Project,
  TemplateType,
} from '../types/project'
import {
  DEFAULT_BACKGROUND,
  DEFAULT_SOURCE_LOCALE,
  MAX_TEXTS,
  SUPPORTED_LOCALES,
  TEMPLATE_FONT_SIZES,
  findThemePreset,
  headlinePlaceholder,
  makeProject,
  makeTextBlock,
} from '../constants/defaults'
import { DEFAULT_MODEL, MODELS_BY_TYPE } from '../constants/deviceSpecs'

const MAX_SLIDES = 10

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
  showDeviceFrame: boolean
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
      issues.push(`${where}: 알 수 없는 테마 프리셋 "${value}" — 기본 배경 사용`)
      return undefined
    }
    return structuredClone(preset.background)
  }
  if (typeof value !== 'object' || value === null) {
    issues.push(`${where}: 배경 형식이 올바르지 않음 — 기본 배경 사용`)
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
      issues.push(`${where}: 그라디언트 stops가 2개 이상 필요 — 기본 배경 사용`)
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
      ? `${where}: image 배경은 manifest에서 지원하지 않음 — 기본 배경 사용`
      : `${where}: 배경 형식이 올바르지 않음 — 기본 배경 사용`,
  )
  return undefined
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
    return { manifest: null, issues: ['매니페스트 JSON을 파싱할 수 없습니다'] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { manifest: null, issues: ['매니페스트는 JSON 객체여야 합니다'] }
  }
  const m = raw as Record<string, unknown>

  if (m.version !== 1) {
    return {
      manifest: null,
      issues: [`지원하지 않는 매니페스트 버전: ${JSON.stringify(m.version)} (version: 1 만 지원)`],
    }
  }
  const name = typeof m.name === 'string' ? m.name.trim() : ''
  if (!name) {
    return { manifest: null, issues: ['프로젝트 이름(name)이 필요합니다'] }
  }
  if (!Array.isArray(m.slides) || m.slides.length === 0) {
    return { manifest: null, issues: ['슬라이드(slides)가 최소 1장 필요합니다'] }
  }
  let rawSlides = m.slides as unknown[]
  if (rawSlides.length > MAX_SLIDES) {
    issues.push(`슬라이드는 최대 ${MAX_SLIDES}장 — ${rawSlides.length}장 중 처음 ${MAX_SLIDES}장만 사용`)
    rawSlides = rawSlides.slice(0, MAX_SLIDES)
  }

  let device: DeviceType = 'iphone'
  if (m.device !== undefined) {
    if (m.device === 'iphone' || m.device === 'ipad') device = m.device
    else issues.push(`알 수 없는 device "${String(m.device)}" — iphone 사용`)
  }

  let deviceModel: DeviceModel = DEFAULT_MODEL[device]
  if (m.deviceModel !== undefined) {
    if (MODELS_BY_TYPE[device].includes(m.deviceModel as DeviceModel)) {
      deviceModel = m.deviceModel as DeviceModel
    } else {
      issues.push(`"${String(m.deviceModel)}"는 ${device}의 모델이 아님 — ${deviceModel} 사용`)
    }
  }

  let sourceLocale = DEFAULT_SOURCE_LOCALE
  if (m.sourceLocale !== undefined) {
    if (typeof m.sourceLocale === 'string' && KNOWN_LOCALES.has(m.sourceLocale)) {
      sourceLocale = m.sourceLocale
    } else {
      issues.push(`지원하지 않는 sourceLocale "${String(m.sourceLocale)}" — ${DEFAULT_SOURCE_LOCALE} 사용`)
    }
  }

  const targetLocales: string[] = []
  if (m.targetLocales !== undefined) {
    if (!Array.isArray(m.targetLocales)) {
      issues.push('targetLocales는 배열이어야 함 — 무시')
    } else {
      for (const code of m.targetLocales) {
        if (typeof code !== 'string' || !KNOWN_LOCALES.has(code)) {
          issues.push(`지원하지 않는 targetLocale "${String(code)}" — 제외`)
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
    const where = `슬라이드 ${i + 1}`
    const s = (
      typeof rawSlide === 'object' && rawSlide !== null ? rawSlide : {}
    ) as Record<string, unknown>
    if (typeof rawSlide !== 'object' || rawSlide === null) {
      issues.push(`${where}: 슬라이드 항목이 객체가 아님 — 기본값 사용`)
    }

    let layout: TemplateType = 'text-top'
    if (s.layout !== undefined) {
      if (typeof s.layout === 'string' && s.layout in TEMPLATE_FONT_SIZES) {
        layout = s.layout as TemplateType
      } else {
        issues.push(`${where}: 알 수 없는 layout "${String(s.layout)}" — text-top 사용`)
      }
    }

    let textBlocks = 1
    if (s.textBlocks !== undefined) {
      const n = typeof s.textBlocks === 'number' ? Math.floor(s.textBlocks) : NaN
      if (Number.isInteger(n) && n >= 1 && n <= MAX_TEXTS) {
        textBlocks = n
      } else {
        issues.push(`${where}: textBlocks는 1~${MAX_TEXTS} — 1 사용`)
      }
    }

    const background =
      s.background !== undefined
        ? coerceBackground(s.background, where, issues)
        : undefined

    return {
      layout,
      textBlocks,
      ...(background ? { background } : {}),
      showDeviceFrame: s.deviceFrame !== false,
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
        ...(spec.showDeviceFrame ? {} : { show: false }),
        ...(spec.layout === 'text-bottom' ? { scale: TEXT_BOTTOM_DEVICE_SCALE } : {}),
      },
    }
  })
  return project
}
