import type {
  Badge,
  BadgeStyle,
  Background,
  Caption,
  DeviceFrame,
  DeviceType,
  Highlight,
  Ornament,
  OrnamentShape,
  Project,
  ScreenshotStyle,
  Slide,
  TemplateType,
  TextStyle,
  TranslationAPI,
} from '../types/project'
import { t } from '../i18n'

export const DEFAULT_THEME_COLOR = '#6366F1'
export const DEFAULT_SOURCE_LOCALE = 'ko'
export const DEFAULT_TARGET_LOCALES = ['en', 'ja']
export const DEFAULT_TRANSLATION_API: TranslationAPI = 'claude'

// `label` is the Korean UI name shown on the localize page; `name` is the
// English language name fed to the translation prompt (kept unambiguous so a
// Korean UI doesn't leak into the LLM instruction). Order = display order.
// Scoped to the ASO/ASC seed-locale set we ship store copy for (all Latin +
// Korean + Japanese) — Chinese/Thai/etc. are intentionally out of scope, which
// is also why Noto Sans JP is the only non-Latin webfont we load.
export const SUPPORTED_LOCALES = [
  { code: 'en', label: '영어', name: 'English' },
  { code: 'ko', label: '한국어', name: 'Korean' },
  { code: 'ja', label: '일본어', name: 'Japanese' },
  { code: 'de', label: '독일어', name: 'German' },
  { code: 'fr', label: '프랑스어', name: 'French' },
  { code: 'es', label: '스페인어', name: 'Spanish' },
  { code: 'it', label: '이탈리아어', name: 'Italian' },
  { code: 'pt-BR', label: '포르투갈어(브라질)', name: 'Brazilian Portuguese' },
  { code: 'es-MX', label: '스페인어(멕시코)', name: 'Mexican Spanish' },
] as const

// Canvas placeholder copy per locale — covers every SUPPORTED_LOCALES entry.
// The canonical string is first; extra entries are recognized as placeholders
// too (the starter template uses a different Korean phrasing). Anything
// outside the map falls back to English.
const HEADLINE_PLACEHOLDERS: Record<string, readonly string[]> = {
  ko: ['당신의 헤드라인', '헤드라인을 작성하세요'],
  en: ['Your headline'],
  ja: ['あなたの見出し'],
  de: ['Deine Überschrift'],
  fr: ['Votre titre'],
  es: ['Tu titular'],
  it: ['Il tuo titolo'],
  'pt-BR': ['Seu título'],
  'es-MX': ['Tu titular'],
}
const BADGE_PLACEHOLDERS: Record<string, readonly string[]> = {
  ko: ['새 기능'],
  en: ['New'],
  ja: ['新機能'],
  de: ['Neu'],
  fr: ['Nouveau'],
  es: ['Nuevo'],
  it: ['Novità'],
  'pt-BR': ['Novo'],
  'es-MX': ['Nuevo'],
}

export function headlinePlaceholder(locale: string): string {
  return (HEADLINE_PLACEHOLDERS[locale] ?? HEADLINE_PLACEHOLDERS.en)[0]
}

export function badgePlaceholder(locale: string): string {
  return (BADGE_PLACEHOLDERS[locale] ?? BADGE_PLACEHOLDERS.en)[0]
}

/**
 * Re-localize untouched placeholder text when the source locale changes, so a
 * project whose 기준 언어 flips to English doesn't keep Korean placeholders on
 * the canvas. User-written text never matches and passes through unchanged.
 */
export function relocalizePlaceholder(text: string, from: string, to: string): string {
  for (const table of [HEADLINE_PLACEHOLDERS, BADGE_PLACEHOLDERS]) {
    if ((table[from] ?? table.en).includes(text)) return (table[to] ?? table.en)[0]
  }
  return text
}

// In-app locale codes that differ from App Store Connect's canonical codes.
// Used only for export folder names so a deliver/fastlane-style upload lands in
// the right ASC locale dir; the stored translation keys keep the in-app code.
const ASC_LOCALE_OVERRIDES: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
}

export function ascExportCode(code: string): string {
  return ASC_LOCALE_OVERRIDES[code] ?? code
}

/** Free font families offered for headline/subheadline. Loaded in index.html.
 * Pretendard leads because it covers Korean + Latin cleanly. */
export const FONT_OPTIONS: { label: string; family: string }[] = [
  { label: 'Pretendard', family: 'Pretendard' },
  { label: 'Inter', family: 'Inter' },
  { label: 'Montserrat', family: 'Montserrat' },
  { label: 'Poppins', family: 'Poppins' },
]

export const HEADLINE_STYLE: TextStyle = {
  fontFamily: 'Pretendard',
  fontSize: 76,
  fontWeight: 900,
  color: '#FFFFFF',
  textAlign: 'center',
  letterSpacing: -2.2,
  lineHeight: 1.02,
}

export const SUBHEADLINE_STYLE: TextStyle = {
  fontFamily: 'Pretendard',
  fontSize: 34,
  fontWeight: 500,
  color: '#E6E8EE',
  textAlign: 'center',
  letterSpacing: -0.4,
  lineHeight: 1.22,
}

// 템플릿별 적정 폰트 크기 (에디터 캔버스 440px 기준)
// 레퍼런스 톤에 맞춰 헤드라인을 더 묵직하게, 스플릿/히어로블리드는 좌측 컬럼에서 줄바꿈을 의도.
export const TEMPLATE_FONT_SIZES: Record<
  TemplateType,
  { headline: number; subheadline: number }
> = {
  hero:          { headline: 40, subheadline: 22 },
  'hero-bleed':  { headline: 40, subheadline: 22 },
  'text-top':    { headline: 40, subheadline: 22 },
  'text-bottom': { headline: 40, subheadline: 22 },
  split:         { headline: 40, subheadline: 22 },
}

// Each layout's default caption alignment. Applied on layout switch; after that
// the alignment is the user's to change (and the caption panel's choice wins).
export const TEMPLATE_TEXT_ALIGN: Record<TemplateType, 'left' | 'center' | 'right'> = {
  hero:          'center',
  'hero-bleed':  'left',
  'text-top':    'center',
  'text-bottom': 'center',
  split:         'left',
}

export const DEFAULT_SCREENSHOT_STYLE: ScreenshotStyle = {
  cornerRadiusRatio: 0.06,
  shadow: true,
}

export const DEFAULT_BADGE_STYLE: BadgeStyle = {
  backgroundColor: '#FFFFFF',
  textColor: '#1A1A2E',
  borderRadius: 100,
  paddingX: 16,
  paddingY: 8,
  fontSize: 48,
  fontWeight: 600,
}

export function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function makeHighlight(): Highlight {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // Default: sample the middle band of the screenshot. The loupe card renders
  // on top of this region; dragging the card on canvas moves the region.
  return {
    id,
    sourceRegion: { x: 0.08, y: 0.42, w: 0.84, h: 0.18 },
    popup: {
      width: 0.78,
    },
  }
}

export function makeBadge(text = t('새 기능'), accentColor?: string): Badge {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `badge-${Date.now()}`
  // A badge is the slide's main accent, so it defaults to the project's theme
  // color (with a legible auto-contrast label). Falls back to the neutral pill.
  const style = accentColor
    ? {
        ...DEFAULT_BADGE_STYLE,
        backgroundColor: accentColor,
        textColor: readableTextOn(accentColor),
      }
    : { ...DEFAULT_BADGE_STYLE }
  return { id, text, translations: {}, style, top: 0.03 }
}

export function defaultDeviceFrame(device: DeviceType = 'iphone'): DeviceFrame {
  const model = device === 'ipad' ? 'ipad-pro-13' : 'iphone-16-pro'
  return { show: true, model, color: 'black' }
}

// New-slide default: a soft, near-white wash (faint cool corner → warm cream)
// with dark text — the App-Store reference look. Intentionally theme-independent;
// cloned per slide so they don't share the gradient object.
export const DEFAULT_BACKGROUND: Background = {
  type: 'gradient',
  gradient: {
    direction: 145,
    stops: [
      { color: '#ECEAF3', position: 0 },
      { color: '#F2EEE7', position: 1 },
    ],
  },
}
export const DEFAULT_HEADLINE_COLOR = '#1C1C24'
export const DEFAULT_SUBHEADLINE_COLOR = '#3A3A46'

/**
 * Derive a single accent hex from a background, for the parts that still need a
 * solid color (badge fill + its auto-contrast label). Solid → its color;
 * gradient → first stop; image → its tint color. Always returns a valid hex,
 * falling back to the neutral theme color.
 */
export function accentFromBackground(bg: Background): string {
  if (bg.type === 'solid') return bg.color ?? DEFAULT_THEME_COLOR
  if (bg.type === 'gradient') return bg.gradient?.stops[0]?.color ?? DEFAULT_THEME_COLOR
  return bg.color ?? DEFAULT_THEME_COLOR
}

export interface ThemePreset {
  id: string
  label: string
  background: Background
  headlineColor: string
  subheadlineColor: string
  /** Optional accent for badges or decorative bits. */
  accentColor: string
}

// 기본 제공 템플릿 배경(#ECEAF3→#F2EEE7)과 같은 결 — 은은한 휴 시프트
// 그라디언트 + 잉크 톤 텍스트. 채도 높은 원색/시커먼 다크 톤은 두지 않는다.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'porcelain',
    label: 'Porcelain',
    background: {
      type: 'gradient',
      gradient: {
        direction: 145,
        stops: [
          { color: '#ECEAF3', position: 0 },
          { color: '#F2EEE7', position: 1 },
        ],
      },
    },
    headlineColor: '#1C1C24',
    subheadlineColor: '#5A5564',
    accentColor: '#6366F1',
  },
  {
    id: 'mist',
    label: 'Mist',
    background: {
      type: 'gradient',
      gradient: {
        direction: 145,
        stops: [
          { color: '#DFEAF6', position: 0 },
          { color: '#F0F4F4', position: 1 },
        ],
      },
    },
    headlineColor: '#15263E',
    subheadlineColor: '#4E617B',
    accentColor: '#3B82F6',
  },
  {
    id: 'sage',
    label: 'Sage',
    background: {
      type: 'gradient',
      gradient: {
        direction: 145,
        stops: [
          { color: '#DFECE2', position: 0 },
          { color: '#F1F4EA', position: 1 },
        ],
      },
    },
    headlineColor: '#1C2B22',
    subheadlineColor: '#52645A',
    accentColor: '#2F9E68',
  },
  {
    id: 'sand',
    label: 'Sand',
    background: {
      type: 'gradient',
      gradient: {
        direction: 145,
        stops: [
          { color: '#F0E7D8', position: 0 },
          { color: '#F7F1E8', position: 1 },
        ],
      },
    },
    headlineColor: '#2D2317',
    subheadlineColor: '#6A5C49',
    accentColor: '#B97F45',
  },
  {
    id: 'blush',
    label: 'Blush',
    background: {
      type: 'gradient',
      gradient: {
        direction: 145,
        stops: [
          { color: '#F5E2E9', position: 0 },
          { color: '#FAF0EE', position: 1 },
        ],
      },
    },
    headlineColor: '#38202C',
    subheadlineColor: '#72525F',
    accentColor: '#D45C8A',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    background: {
      type: 'gradient',
      gradient: {
        direction: 145,
        stops: [
          { color: '#E6E1F5', position: 0 },
          { color: '#F2EFF9', position: 1 },
        ],
      },
    },
    headlineColor: '#241D41',
    subheadlineColor: '#5A5278',
    accentColor: '#7757DB',
  },
]

export function findThemePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id)
}

/**
 * The slide patch a theme preset applies: background, text colors, and the
 * badge accent (with an auto-contrast label). The inverse of presetFromSlide,
 * so apply → capture round-trips the same accent.
 */
export function themePresetPatch(slide: Slide, preset: ThemePreset): Partial<Slide> {
  return {
    background: structuredClone(preset.background),
    texts: slide.texts.map((c, i) => ({
      ...c,
      style: { ...c.style, color: i === 0 ? preset.headlineColor : preset.subheadlineColor },
    })),
    badges: (slide.badges ?? []).map((b) => ({
      ...b,
      style: { ...b.style, backgroundColor: preset.accentColor, textColor: readableTextOn(preset.accentColor) },
    })),
  }
}

/** Capture the current slide's background + text colors as a reusable preset.
 *  Background is deep-cloned so the stored preset never aliases the live slide. */
export function presetFromSlide(slide: Slide, label: string): ThemePreset {
  return {
    id: newId('preset'),
    label,
    background: structuredClone(slide.background),
    headlineColor: slide.texts[0].style.color,
    subheadlineColor: slide.texts[1]?.style.color ?? slide.texts[0].style.color,
    accentColor: slide.badges[0]?.style.backgroundColor ?? slide.texts[0].style.color,
  }
}

/** Capture the current slide's full styling/composition as a reusable template.
 *  Everything captured is deep-cloned so the stored template never shares a
 *  mutable object (background, caption translations, badge styles) with the
 *  live slide. */
export function makeOrnament(shape: OrnamentShape, overrides?: Partial<Ornament>): Ornament {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `orn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // 모양별로 기본 위치/크기를 다르게 잡아서 추가하자마자 바로 보이게 한다.
  // color는 이모지엔 적용되지 않지만 데이터 모델 호환을 위해 유지한다.
  const defaultsByShape: Record<OrnamentShape, Partial<Ornament>> = {
    'star':      { x: 0.50, y: 0.30, size: 0.12, rotation: 0,  opacity: 1 },
    'sparkles':  { x: 0.85, y: 0.16, size: 0.14, rotation: 0,  opacity: 1 },
    'heart':     { x: 0.85, y: 0.16, size: 0.12, rotation: 0,  opacity: 1 },
    'flower':    { x: 0.12, y: 0.90, size: 0.14, rotation: 0,  opacity: 1 },
    'leaf':      { x: 0.14, y: 0.50, size: 0.18, rotation: 0,  opacity: 1 },
    'paw':       { x: 0.85, y: 0.18, size: 0.14, rotation: 15, opacity: 1 },
    'fire':      { x: 0.82, y: 0.20, size: 0.13, rotation: 0,  opacity: 1 },
    'party':     { x: 0.82, y: 0.18, size: 0.14, rotation: 0,  opacity: 1 },
    'rocket':    { x: 0.82, y: 0.22, size: 0.14, rotation: 0,  opacity: 1 },
    'bulb':      { x: 0.82, y: 0.18, size: 0.13, rotation: 0,  opacity: 1 },
    'bolt':      { x: 0.84, y: 0.16, size: 0.12, rotation: 0,  opacity: 1 },
    'check':     { x: 0.82, y: 0.18, size: 0.12, rotation: 0,  opacity: 1 },
    'thumbsup':  { x: 0.82, y: 0.20, size: 0.13, rotation: 0,  opacity: 1 },
    'trophy':    { x: 0.82, y: 0.20, size: 0.13, rotation: 0,  opacity: 1 },
    'gem':       { x: 0.84, y: 0.18, size: 0.12, rotation: 0,  opacity: 1 },
    'target':    { x: 0.82, y: 0.18, size: 0.13, rotation: 0,  opacity: 1 },
    'bell':      { x: 0.84, y: 0.16, size: 0.12, rotation: 0,  opacity: 1 },
    'hundred':   { x: 0.82, y: 0.20, size: 0.13, rotation: 0,  opacity: 1 },
  }
  const base = defaultsByShape[shape]
  return {
    id,
    shape,
    x: base.x ?? 0.5,
    y: base.y ?? 0.5,
    size: base.size ?? 0.1,
    rotation: base.rotation ?? 0,
    color: base.color ?? '#FFFFFF',
    opacity: base.opacity ?? 1,
    ...overrides,
  }
}

export function defaultCaption(text: string, style: TextStyle): Caption {
  return { text, translations: {}, style: { ...style } }
}

/** Max number of text blocks per slide. */
export const MAX_TEXTS = 4

/**
 * Build a text block for a given index + template. Block 0 uses the headline
 * style/color/size; every other index uses the subheadline style/color/size.
 * Alignment follows the template default.
 */
export function makeTextBlock(index: number, template: TemplateType, text = ''): Caption {
  const base = index === 0 ? HEADLINE_STYLE : SUBHEADLINE_STYLE
  const color = index === 0 ? DEFAULT_HEADLINE_COLOR : DEFAULT_SUBHEADLINE_COLOR
  const fontSize = index === 0
    ? TEMPLATE_FONT_SIZES[template].headline
    : TEMPLATE_FONT_SIZES[template].subheadline
  const textAlign = TEMPLATE_TEXT_ALIGN[template]
  return defaultCaption(text, { ...base, fontSize, textAlign, color })
}

/** The slide's display title — the first text block's text (locale-aware). */
export function titleText(slide: Slide, locale?: string): string {
  const first = slide.texts[0]
  const text = first ? (locale ? first.translations[locale] ?? first.text : first.text) : ''
  return text || t('슬라이드 {n}', { n: slide.index + 1 })
}

export function makeSlide(
  index: number,
  device: DeviceType = 'iphone',
  background?: Background,
  sourceLocale: string = DEFAULT_SOURCE_LOCALE,
): Slide {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `slide-${index}-${Date.now()}`
  const template: TemplateType = 'text-top'
  return {
    id,
    index,
    template,
    background: structuredClone(background ?? DEFAULT_BACKGROUND),
    deviceFrame: defaultDeviceFrame(device),
    screenshot: null,
    // Reference layout starts title-only; the caption panel adds more blocks.
    texts: [makeTextBlock(0, template, headlinePlaceholder(sourceLocale))],
    badges: [],
    highlights: [],
    ornaments: [],
    screenshotStyle: { ...DEFAULT_SCREENSHOT_STYLE },
  }
}

export function makeProject(input: {
  name: string
  devices: Project['devices']
  deviceModels?: Project['deviceModels']
  screenshotCount: number
  themeBackground: Background
}): Project {
  const now = new Date().toISOString()
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `project-${Date.now()}`
  const seedModel = input.deviceModels?.[input.devices[0]]
  return {
    id,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    devices: input.devices,
    deviceModels: input.deviceModels,
    screenshotCount: input.screenshotCount,
    themeBackground: structuredClone(input.themeBackground),
    sourceLocale: DEFAULT_SOURCE_LOCALE,
    targetLocales: [...DEFAULT_TARGET_LOCALES],
    translationApi: DEFAULT_TRANSLATION_API,
    slides: Array.from({ length: input.screenshotCount }, (_, i) => {
      const slide = makeSlide(i, input.devices[0], input.themeBackground)
      // Seed slides at the project's chosen size (makeSlide uses the type default).
      if (seedModel) slide.deviceFrame = { ...slide.deviceFrame, model: seedModel }
      return slide
    }),
  }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').padEnd(6, '0')
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  }
}

// Black or white — whichever stays legible on the given background color.
export function readableTextOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1A1A2E' : '#FFFFFF'
}
