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
  | 'star'
  | 'sparkles'
  | 'heart'
  | 'flower'
  | 'leaf'
  | 'paw'
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
  badges: Badge[]
  highlights: Highlight[]
  /** Decorative SVG ornaments rendered above background, below screenshot. */
  ornaments?: Ornament[]
  /** When deviceFrame.show is false, controls how the screenshot floats. */
  screenshotStyle?: ScreenshotStyle
  /**
   * Span-group membership. When set, this slide is one half of a 2-page
   * App-Store-style spanning composition. Leader owns all layers (rendered on
   * a 2×-wide canvas); follower is a pointer whose own layer fields are
   * ignored while grouped. Adjacency (leader.index + 1 === follower.index) is
   * a structural invariant enforced by the store.
   */
  spanGroupId?: string
  spanRole?: 'leader' | 'follower'
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
  /** Line-art shapes: fill the interior with `color` in addition to the outline. */
  filled?: boolean
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
  /** Uniform scale factor applied on top of the template's default size. 1 = default. */
  scale?: number
  /** Tilt of the device + screenshot in degrees, about the device center. 0 = upright. */
  rotation?: number
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
  top: number  // 0–1, fraction of canvas height (top edge)
  left?: number  // 0–1, fraction of canvas width (center X). Defaults to 0.5.
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
