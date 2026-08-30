export const LAYER_NAMES = {
  BACKGROUND: 'background',
  /** Generic vector shapes; band (back/front) is insertion order, not the name. */
  SHAPE: 'shape',
  ORNAMENT: 'ornament',
  EXTERNAL_IMAGE: 'external-image',
  /** Shadow-only proxy rects under the floating screenshot card (ambient/contact layers). */
  SCREENSHOT_SHADOW: 'screenshot-shadow',
  SCREENSHOT: 'screenshot',
  DEVICE_FRAME: 'device-frame',
  HIGHLIGHT_SOURCE: 'highlight-source',
  /** Non-evented leader line from the source marker to the card; derived. */
  HIGHLIGHT_CONNECTOR: 'highlight-connector',
  HIGHLIGHT_POPUP: 'highlight-popup',
  /** Non-evented outline drawn over the popup; derived from it, never synced back. */
  HIGHLIGHT_RIM: 'highlight-rim',
  TEXT: 'text',
  TEXT_BOX: 'text-box',
  BADGE: 'badge',
} as const

export type LayerName = (typeof LAYER_NAMES)[keyof typeof LAYER_NAMES]
