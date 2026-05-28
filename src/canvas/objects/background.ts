import { Rect, Gradient } from 'fabric'
import type { Background } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

export function renderBackground(
  canvasWidth: number,
  canvasHeight: number,
  background: Background,
): Rect {
  const rect = new Rect({
    left: 0,
    top: 0,
    width: canvasWidth,
    height: canvasHeight,
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  // Store layer name as custom data
  ;(rect as Rect & { layerName: string }).layerName = LAYER_NAMES.BACKGROUND

  if (background.type === 'solid') {
    rect.set('fill', background.color ?? '#6366F1')
  } else if (background.type === 'gradient' && background.gradient) {
    const { stops, direction } = background.gradient
    // direction is degrees: 0 = top-to-bottom vertical, 90 = left-to-right horizontal
    const rad = (direction * Math.PI) / 180
    const x1 = 0.5 - Math.sin(rad) * 0.5
    const y1 = 0.5 - Math.cos(rad) * 0.5
    const x2 = 0.5 + Math.sin(rad) * 0.5
    const y2 = 0.5 + Math.cos(rad) * 0.5

    const gradient = new Gradient({
      type: 'linear',
      coords: {
        x1: x1 * canvasWidth,
        y1: y1 * canvasHeight,
        x2: x2 * canvasWidth,
        y2: y2 * canvasHeight,
      },
      colorStops: stops.map((s) => ({ offset: s.position, color: s.color })),
    })
    rect.set('fill', gradient)
  } else {
    // fallback solid
    rect.set('fill', background.color ?? '#6366F1')
  }

  return rect
}
