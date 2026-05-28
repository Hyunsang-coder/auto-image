export const LAYER_NAMES = {
  BACKGROUND: 'background',
  SCREENSHOT: 'screenshot',
  DEVICE_FRAME: 'device-frame',
  HEADLINE: 'headline',
  SUBHEADLINE: 'subheadline',
  BADGE: 'badge',
} as const

export type LayerName = (typeof LAYER_NAMES)[keyof typeof LAYER_NAMES]
