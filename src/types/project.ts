export type DeviceType = 'iphone' | 'ipad'
export type TemplateType = 'hero' | 'text-top' | 'text-bottom' | 'split'
export type DeviceModel = 'iphone-16-pro' | 'ipad-pro-13'
export type DeviceColor = 'black' | 'silver'
export type HighlightShape = 'rect' | 'circle'
export type BackgroundType = 'solid' | 'gradient' | 'image'
export type TranslationAPI = 'claude' | 'openai' | 'gemini'

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  devices: DeviceType[]
  screenshotCount: number
  themeColor: string
  sourceLocale: string
  targetLocales: string[]
  translationApi: TranslationAPI
  slides: Slide[]
}

export interface Slide {
  id: string
  index: number
  template: TemplateType
  background: Background
  deviceFrame: DeviceFrame
  screenshot: ScreenshotImage | null
  headline: Caption
  subheadline: Caption
  badge: Badge | null
  highlights: Highlight[]
}

export interface Background {
  type: BackgroundType
  color?: string
  gradient?: {
    direction: number
    stops: Array<{ color: string; position: number }>
  }
  imageKey?: string
  imageObjectFit?: 'cover' | 'contain' | 'fill'
}

export interface DeviceFrame {
  show: boolean
  model: DeviceModel
  color: DeviceColor
}

export interface ScreenshotImage {
  id: string
  imageKey: string
  originalWidth: number
  originalHeight: number
}

export interface Caption {
  text: string
  translations: Record<string, string>
  style: TextStyle
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  textAlign: 'left' | 'center' | 'right'
  letterSpacing?: number
  lineHeight?: number
}

export interface Badge {
  id: string
  text: string
  translations: Record<string, string>
  style: BadgeStyle
}

export interface BadgeStyle {
  backgroundColor: string
  textColor: string
  borderRadius: number
  paddingX: number
  paddingY: number
  fontSize: number
  fontWeight: number
  icon?: string
  iconPosition?: 'left' | 'right'
}

export interface Highlight {
  id: string
  sourceRegion: {
    x: number
    y: number
    w: number
    h: number
  }
  shape: HighlightShape
  borderColor: string
  borderWidth: number
  popup: {
    x: number
    y: number
    width: number
    zoom: number
    showConnectorLine: boolean
    connectorStyle?: 'straight' | 'curved'
    borderRadius?: number
    shadowColor?: string
  }
}

export interface ApiConfig {
  claude?: { apiKey: string }
  openai?: { apiKey: string }
  gemini?: { apiKey: string }
}

export type Step = 1 | 2 | 3 | 4
