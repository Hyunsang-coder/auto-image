export const LAYER_NAMES = {
  BACKGROUND: 'background',
  ORNAMENT: 'ornament',
  SCREENSHOT: 'screenshot',
  DEVICE_FRAME: 'device-frame',
  HIGHLIGHT_POPUP: 'highlight-popup',
  TEXT: 'text',
  TEXT_BOX: 'text-box',
  BADGE: 'badge',
} as const

export type LayerName = (typeof LAYER_NAMES)[keyof typeof LAYER_NAMES]
