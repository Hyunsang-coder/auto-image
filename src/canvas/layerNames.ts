export const LAYER_NAMES = {
  BACKGROUND: 'background',
  ORNAMENT: 'ornament',
  SCREENSHOT: 'screenshot',
  DEVICE_FRAME: 'device-frame',
  HIGHLIGHT_SOURCE: 'highlight-source',
  HIGHLIGHT_POPUP: 'highlight-popup',
  HEADLINE: 'headline',
  SUBHEADLINE: 'subheadline',
  BADGE: 'badge',
} as const

export type LayerName = (typeof LAYER_NAMES)[keyof typeof LAYER_NAMES]
