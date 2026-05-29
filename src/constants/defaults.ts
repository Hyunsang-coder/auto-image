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
  SlideTemplate,
  TemplateType,
  TextStyle,
  TranslationAPI,
} from '../types/project'

export const DEFAULT_THEME_COLOR = '#6366F1'
export const DEFAULT_SOURCE_LOCALE = 'ko'
export const DEFAULT_TARGET_LOCALES = ['en', 'ja']
export const DEFAULT_TRANSLATION_API: TranslationAPI = 'claude'

export const SUPPORTED_LOCALES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'it', label: 'Italiano' },
] as const

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
  hero:          { headline: 84, subheadline: 38 },
  'hero-bleed':  { headline: 58, subheadline: 26 },
  'text-top':    { headline: 54, subheadline: 28 },
  'text-bottom': { headline: 54, subheadline: 28 },
  split:         { headline: 46, subheadline: 24 },
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
  // Default: sample the middle band of the screenshot, float a 1.5×-ish
  // magnified card just below the device's vertical center. Users move both.
  return {
    id,
    sourceRegion: { x: 0.08, y: 0.42, w: 0.84, h: 0.18 },
    shape: 'rect',
    borderColor: '#FFFFFF',
    borderWidth: 0,
    popup: {
      x: 0.5,
      y: 0.66,
      width: 0.78,
    },
  }
}

export function makeBadge(text = '새 기능'): Badge {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `badge-${Date.now()}`
  return { id, text, translations: {}, style: { ...DEFAULT_BADGE_STYLE }, top: 0.03 }
}

export function defaultDeviceFrame(device: DeviceType = 'iphone'): DeviceFrame {
  const model = device === 'ipad' ? 'ipad-pro-13' : 'iphone-16-pro'
  return { show: true, model, color: 'black' }
}

export function defaultBackground(themeColor: string): Background {
  return {
    type: 'gradient',
    gradient: {
      direction: 180,
      stops: [
        { color: themeColor, position: 0 },
        { color: shiftLightness(themeColor, -25), position: 1 },
      ],
    },
  }
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

// 파스텔 + 선명 믹스. 시커먼 다크 톤은 두지 않는다.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'mint',
    label: 'Mint',
    background: {
      type: 'gradient',
      gradient: {
        direction: 200,
        stops: [
          { color: '#2BBE60', position: 0 },
          { color: '#14843C', position: 1 },
        ],
      },
    },
    headlineColor: '#FFFFFF',
    subheadlineColor: '#E8FFEF',
    accentColor: '#FFD84D',
  },
  {
    id: 'tan',
    label: 'Tan',
    background: {
      type: 'solid',
      color: '#C99973',
    },
    headlineColor: '#1B0F08',
    subheadlineColor: '#3C271C',
    accentColor: '#FF5722',
  },
  {
    id: 'blush',
    label: 'Blush',
    background: {
      type: 'gradient',
      gradient: {
        direction: 180,
        stops: [
          { color: '#FCE4EC', position: 0 },
          { color: '#F6C9D8', position: 1 },
        ],
      },
    },
    headlineColor: '#3B1721',
    subheadlineColor: '#6E3A45',
    accentColor: '#E0457B',
  },
  {
    id: 'sky',
    label: 'Sky',
    background: {
      type: 'gradient',
      gradient: {
        direction: 180,
        stops: [
          { color: '#DEEDFB', position: 0 },
          { color: '#C2DBF6', position: 1 },
        ],
      },
    },
    headlineColor: '#0F2440',
    subheadlineColor: '#38506E',
    accentColor: '#2563EB',
  },
  {
    id: 'coral',
    label: 'Coral',
    background: {
      type: 'gradient',
      gradient: {
        direction: 200,
        stops: [
          { color: '#FF9A6B', position: 0 },
          { color: '#F4602E', position: 1 },
        ],
      },
    },
    headlineColor: '#FFFFFF',
    subheadlineColor: '#FFF0EA',
    accentColor: '#FFD27A',
  },
  {
    id: 'azure',
    label: 'Azure',
    background: {
      type: 'gradient',
      gradient: {
        direction: 180,
        stops: [
          { color: '#4D90F5', position: 0 },
          { color: '#1F5FD6', position: 1 },
        ],
      },
    },
    headlineColor: '#FFFFFF',
    subheadlineColor: '#E7EFFF',
    accentColor: '#FFD166',
  },
]

export function findThemePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id)
}

/** Capture the current slide's background + text colors as a reusable preset. */
export function presetFromSlide(slide: Slide, label: string): ThemePreset {
  return {
    id: newId('preset'),
    label,
    background: slide.background,
    headlineColor: slide.headline.style.color,
    subheadlineColor: slide.subheadline.style.color,
    accentColor: slide.badges[0]?.style.backgroundColor ?? slide.headline.style.color,
  }
}

/** Capture the current slide's full styling/composition as a reusable template. */
export function templateFromSlide(slide: Slide, label: string): SlideTemplate {
  return {
    id: newId('tpl'),
    label,
    template: slide.template,
    background: slide.background,
    deviceFrame: { ...slide.deviceFrame },
    headline: { ...slide.headline, style: { ...slide.headline.style } },
    subheadline: { ...slide.subheadline, style: { ...slide.subheadline.style } },
    badges: slide.badges.map((b) => ({ ...b, style: { ...b.style } })),
    ornaments: (slide.ornaments ?? []).map((o) => ({ ...o })),
    screenshotStyle: slide.screenshotStyle ? { ...slide.screenshotStyle } : undefined,
  }
}

/**
 * Build the patch that applies a template's look onto `slide`, preserving the
 * slide's content (screenshot, caption text/translations, highlights) and its
 * device model (so an iPhone-saved look can't flip an iPad slide's frame).
 * Badges/ornaments get fresh IDs so the two slides stay independent.
 */
export function applyTemplateToSlide(slide: Slide, tpl: SlideTemplate): Partial<Slide> {
  return {
    template: tpl.template,
    background: tpl.background,
    deviceFrame: { ...tpl.deviceFrame, model: slide.deviceFrame.model },
    headline: {
      ...slide.headline,
      style: { ...tpl.headline.style },
      pos: tpl.headline.pos,
      boxWidth: tpl.headline.boxWidth,
    },
    subheadline: {
      ...slide.subheadline,
      style: { ...tpl.subheadline.style },
      pos: tpl.subheadline.pos,
      boxWidth: tpl.subheadline.boxWidth,
    },
    badges: tpl.badges.map((b) => ({ ...b, id: newId('badge'), style: { ...b.style } })),
    ornaments: tpl.ornaments.map((o) => ({ ...o, id: newId('orn') })),
    screenshotStyle: tpl.screenshotStyle ? { ...tpl.screenshotStyle } : slide.screenshotStyle,
  }
}

export function makeOrnament(shape: OrnamentShape, overrides?: Partial<Ornament>): Ornament {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `orn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // 모양별로 기본 위치/크기를 다르게 잡아서 추가하자마자 바로 보이게 한다.
  const defaultsByShape: Record<OrnamentShape, Partial<Ornament>> = {
    'star':      { x: 0.5,  y: 0.30, size: 0.12, rotation: 0,  color: '#FFB400', opacity: 1 },
    'sparkles':  { x: 0.85, y: 0.16, size: 0.14, rotation: 0,  color: '#FFFFFF', opacity: 0.95 },
    'heart':     { x: 0.85, y: 0.16, size: 0.12, rotation: 0,  color: '#FF4D6D', opacity: 1 },
    'flower':    { x: 0.12, y: 0.90, size: 0.14, rotation: 0,  color: '#EC4899', opacity: 1 },
    'leaf':      { x: 0.14, y: 0.5,  size: 0.20, rotation: 0,  color: '#34A853', opacity: 1 },
    'paw':       { x: 0.85, y: 0.18, size: 0.14, rotation: 15, color: '#FFFFFF', opacity: 0.9 },
    'dot-grid':  { x: 0.5,  y: 0.5,  size: 0.7,  rotation: 0,  color: '#FFFFFF', opacity: 0.18 },
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

export function makeSlide(index: number, themeColor: string, device: DeviceType = 'iphone'): Slide {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `slide-${index}-${Date.now()}`
  const template: TemplateType = index === 0 ? 'hero-bleed' : 'text-top'
  const sizes = TEMPLATE_FONT_SIZES[template]
  return {
    id,
    index,
    template,
    background: defaultBackground(themeColor),
    deviceFrame: defaultDeviceFrame(device),
    screenshot: null,
    headline: defaultCaption('당신의 헤드라인', { ...HEADLINE_STYLE, fontSize: sizes.headline }),
    subheadline: defaultCaption(
      '한 문장으로 가치 제안을 전달하세요',
      { ...SUBHEADLINE_STYLE, fontSize: sizes.subheadline },
    ),
    badges: [],
    highlights: [],
    ornaments: [],
    screenshotStyle: { ...DEFAULT_SCREENSHOT_STYLE },
  }
}

export function makeProject(input: {
  name: string
  devices: Project['devices']
  screenshotCount: number
  themeColor: string
}): Project {
  const now = new Date().toISOString()
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `project-${Date.now()}`
  return {
    id,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    devices: input.devices,
    screenshotCount: input.screenshotCount,
    themeColor: input.themeColor,
    sourceLocale: DEFAULT_SOURCE_LOCALE,
    targetLocales: [...DEFAULT_TARGET_LOCALES],
    translationApi: DEFAULT_TRANSLATION_API,
    slides: Array.from({ length: input.screenshotCount }, (_, i) =>
      makeSlide(i, input.themeColor, input.devices[0]),
    ),
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function shiftLightness(hex: string, delta: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const nl = clamp(l + delta, 0, 100)
  const { r: nr, g: ng, b: nb } = hslToRgb(h, s, nl)
  return rgbToHex(nr, ng, nb)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').padEnd(6, '0')
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return {
    r: f(0) * 255,
    g: f(8) * 255,
    b: f(4) * 255,
  }
}
