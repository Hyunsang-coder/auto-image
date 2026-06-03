export type DeviceType = 'iphone' | 'ipad'
export type TemplateType =
  | 'hero'
  | 'hero-bleed'
  | 'text-top'
  | 'text-bottom'
  | 'split'
export type DeviceModel =
  | 'iphone-16-pro'
  | 'iphone-6-5'
  | 'ipad-pro-13'
  | 'ipad-11'
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
  | 'fire'
  | 'party'
  | 'rocket'
  | 'bulb'
  | 'bolt'
  | 'check'
  | 'thumbsup'
  | 'trophy'
  | 'gem'
  | 'target'
  | 'bell'
  | 'hundred'

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  devices: DeviceType[]
  /**
   * Which export resolution to use per device type (App Store screenshot size).
   * Every slide of a given type renders/exports at this model's spec. Absent →
   * the default model for each type (iphone-16-pro / ipad-pro-13). A size change
   * remaps all slides of that type (see `setDeviceSize`).
   */
  deviceModels?: Partial<Record<DeviceType, DeviceModel>>
  screenshotCount: number
  /** Default background applied to every slide of a new project. */
  themeBackground: Background
  sourceLocale: string
  targetLocales: string[]
  translationApi: TranslationAPI
  /**
   * The languages this project ships. All are peers — there is no source/target
   * asymmetry; translation happens externally and is imported. The shared slide
   * data is the common base; per-locale divergence lives in overrides
   * (`Caption.translations`, `ScreenshotImage.localeOverrides`,
   * `Slide.localeLayout`). Optional during the migration off `sourceLocale`.
   */
  locales?: string[]
  slides: Slide[]
}

export interface Slide {
  id: string
  index: number
  template: TemplateType
  background: Background
  deviceFrame: DeviceFrame
  screenshot: ScreenshotImage | null
  /** 1–4 text blocks; texts[0] = title block. */
  texts: Caption[]
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
  /**
   * Per-locale overrides on top of the shared base (copy-on-write). Only the
   * properties a user changes while editing a given locale are stored here;
   * everything absent inherits the shared slide, so a later edit to the base
   * still propagates to un-overridden locales. Text and the screenshot image
   * have their own per-locale channels (`Caption.translations`,
   * `ScreenshotImage.localeOverrides`); this covers the look: template,
   * background, device transform, screenshot style, and caption style/placement.
   * Badges/ornaments/highlights stay shared (their text is still per-locale via
   * `translations`).
   */
  localeOverrides?: Record<string, LocaleOverride>
}

/** Caption look that can diverge per locale (text content lives in `translations`). */
export interface CaptionOverride {
  style?: Partial<TextStyle>
  pos?: { x: number; y: number }
  boxWidth?: number
}

export interface LocaleOverride {
  template?: TemplateType
  background?: Background
  deviceFrame?: {
    offsetX?: number
    offsetY?: number
    scale?: number
    rotation?: number
    color?: DeviceColor
  }
  screenshotStyle?: ScreenshotStyle
  texts?: Record<number, CaptionOverride>
}

export interface ScreenshotStyle {
  /** 0–1 fraction of screenshot width; 0 = sharp corners. */
  cornerRadiusRatio: number
  shadow: boolean
  /**
   * Floating mode (frame hidden) only: fraction of each edge to trim off the
   * screenshot card. The image fit is unchanged — trimming cuts the card
   * smaller rather than rescaling its content.
   */
  crop?: ScreenshotCrop
}

export interface ScreenshotCrop {
  top: number
  right: number
  bottom: number
  left: number
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
    kind?: 'linear' | 'radial'
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
  /**
   * Optional override for the visual frame drawn. When set, the frame shape
   * (aspect ratio, corner radius, screen inset, Dynamic Island) comes from this
   * model while the canvas export size still comes from `model`. Allows e.g. an
   * iPhone screenshot inside an iPad-sized canvas.
   */
  frameModel?: DeviceModel
}

export interface ScreenshotImage {
  id: string
  imageKey: string
  originalWidth: number
  originalHeight: number
  /**
   * Per-locale screenshot overrides keyed by locale code. When an export
   * targets a locale present here, this image replaces the base screenshot for
   * that locale only (e.g. a UI screenshot captured in that language). Absent
   * locales fall back to the base image. The device frame is unchanged; the
   * override is cover-fit into the same frame using its own dimensions.
   */
  localeOverrides?: Record<string, LocaleScreenshot>
  /**
   * For a locale with no own override, which *other* locale's screenshot to
   * borrow (locale code → donor locale code). Absent → fall back to the base
   * image (the default). Lets e.g. an unscreenshot locale show the English
   * capture instead of the source-language one.
   */
  localeSource?: Record<string, string>
}

export interface LocaleScreenshot {
  imageKey: string
  originalWidth: number
  originalHeight: number
}

export interface Caption {
  text: string
  translations: Record<string, string>
  style: TextStyle
  /**
   * User-dragged position override, normalized to the canvas (x = center X /
   * width, y = top / height) so it scales between editor and export. Absent =
   * use the template's default placement.
   */
  pos?: { x: number; y: number }
  /**
   * User-resized text-box width, normalized to the canvas width. Controls where
   * the text wraps. Absent = use the template's default width.
   */
  boxWidth?: number
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  textAlign: 'left' | 'center' | 'right'
  letterSpacing?: number
  lineHeight?: number
  /** When true, the font is auto-sized so the text fills the caption box width. */
  fitToBox?: boolean
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
