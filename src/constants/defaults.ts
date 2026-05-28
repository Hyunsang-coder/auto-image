import type {
  Badge,
  BadgeStyle,
  Background,
  Caption,
  DeviceFrame,
  Project,
  Slide,
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

export const HEADLINE_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 72,
  fontWeight: 800,
  color: '#FFFFFF',
  textAlign: 'center',
  letterSpacing: -1.5,
  lineHeight: 1.05,
}

export const SUBHEADLINE_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 36,
  fontWeight: 500,
  color: '#E6E8EE',
  textAlign: 'center',
  letterSpacing: -0.3,
  lineHeight: 1.25,
}

// 템플릿별 적정 폰트 크기 (에디터 캔버스 440px 기준)
export const TEMPLATE_FONT_SIZES: Record<
  TemplateType,
  { headline: number; subheadline: number }
> = {
  hero:          { headline: 80, subheadline: 40 },
  'text-top':    { headline: 56, subheadline: 30 },
  'text-bottom': { headline: 56, subheadline: 30 },
  split:         { headline: 44, subheadline: 24 },
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

export function makeBadge(text = '새 기능'): Badge {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `badge-${Date.now()}`
  return { id, text, translations: {}, style: { ...DEFAULT_BADGE_STYLE }, top: 0.03 }
}

export function defaultDeviceFrame(): DeviceFrame {
  return { show: true, model: 'iphone-16-pro', color: 'black' }
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

export function defaultCaption(text: string, style: TextStyle): Caption {
  return { text, translations: {}, style: { ...style } }
}

export function makeSlide(index: number, themeColor: string): Slide {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `slide-${index}-${Date.now()}`
  const template: TemplateType = index === 0 ? 'hero' : 'text-top'
  const sizes = TEMPLATE_FONT_SIZES[template]
  return {
    id,
    index,
    template,
    background: defaultBackground(themeColor),
    deviceFrame: defaultDeviceFrame(),
    screenshot: null,
    headline: defaultCaption('당신의 헤드라인', { ...HEADLINE_STYLE, fontSize: sizes.headline }),
    subheadline: defaultCaption(
      '한 문장으로 가치 제안을 전달하세요',
      { ...SUBHEADLINE_STYLE, fontSize: sizes.subheadline },
    ),
    badge: null,
    highlights: [],
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
      makeSlide(i, input.themeColor),
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
