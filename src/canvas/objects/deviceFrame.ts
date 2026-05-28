import { Rect } from 'fabric'
import type { DeviceFrame } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

export interface DeviceFrameOptions {
  left: number
  top: number
  width: number
  height: number
  rx?: number
}

export function renderDeviceFrame(
  deviceFrame: DeviceFrame,
  opts: DeviceFrameOptions,
): Rect | null {
  if (!deviceFrame.show) return null

  const rx = opts.rx ?? 24
  const rect = new Rect({
    left: opts.left,
    top: opts.top,
    width: opts.width,
    height: opts.height,
    fill: 'transparent',
    stroke: deviceFrame.color === 'silver' ? '#C0C0C0' : '#1a1a1a',
    strokeWidth: 3,
    rx,
    ry: rx,
    originX: 'center',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  ;(rect as Rect & { layerName: string }).layerName = LAYER_NAMES.DEVICE_FRAME

  return rect
}
