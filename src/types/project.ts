export type DeviceType = 'iphone' | 'ipad'
export type TemplateType =
  | 'hero'
  | 'hero-bleed'
  | 'text-top'
  | 'text-bottom'
  | 'split'
export type DeviceModel = 'iphone-16-pro' | 'ipad-pro-13'
export type DeviceColor = 'black' | 'silver'
export type HighlightShape = 'rect' | 'circle'
export type BackgroundType = 'solid' | 'gradient' | 'image'
export type TranslationAPI = 'claude' | 'openai' | 'gemini'
export type OrnamentShape =
  | 'laurel-left'
  | 'laurel-right'
  | 'star'
  | 'paw'
  | 'sparkle'
  | 'flower'
  | 'dot-grid'

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
  /** Decorative SVG ornaments rendered above background, below screenshot. */
  ornaments?: Ornament[]
  /** When deviceFrame.show is false, controls how the screenshot floats. */
  screenshotStyle?: ScreenshotStyle
}

export interface ScreenshotStyle {
  /** 0–1 fraction of screenshot width; 0 = sharp corners. */
  cornerRadiusRatio: number
  shadow: boolean
}

export interface Ornament {
  id: string
  shape: OrnamentShape
  /** Canvas-relative anchor, 0..1 on each axis. */
  x: number
  y: number
  /** Width as fraction of canvas width (0..1). */
  size: number
  rotation: number
  color: string
  opacity: number
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
  /**
   * User-applied translation of the device within the editor canvas,
   * relative to the template's default placement. Stored in editor-canvas
   * pixels so it persists independently of canvas resizing for export.
   */
  offsetX?: number
  offsetY?: number
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
  top: number  // 0–1, fraction of canvas height
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
