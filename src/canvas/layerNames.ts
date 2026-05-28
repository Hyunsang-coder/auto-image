export const LAYER_NAMES = {
  BACKGROUND: 'background',
  ORNAMENT: 'ornament',
  SCREENSHOT: 'screenshot',
  DEVICE_FRAME: 'device-frame',
  HEADLINE: 'headline',
  SUBHEADLINE: 'subheadline',
  BADGE: 'badge',
} as const

export type LayerName = (typeof LAYER_NAMES)[keyof typeof LAYER_NAMES]
