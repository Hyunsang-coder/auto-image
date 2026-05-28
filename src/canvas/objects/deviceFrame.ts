import { Path } from 'fabric'
import type { FabricObject } from 'fabric'
import type { DeviceFrame } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

export interface DeviceFrameOptions {
  left: number
  top: number
  width: number
  height: number
  rx?: number
}

function rrPath(x: number, y: number, w: number, h: number, r: number): string {
  const cr = Math.min(r, w / 2, h / 2)
  return (
    `M ${x + cr} ${y} L ${x + w - cr} ${y} ` +
    `Q ${x + w} ${y} ${x + w} ${y + cr} ` +
    `L ${x + w} ${y + h - cr} ` +
    `Q ${x + w} ${y + h} ${x + w - cr} ${y + h} ` +
    `L ${x + cr} ${y + h} ` +
    `Q ${x} ${y + h} ${x} ${y + h - cr} ` +
    `L ${x} ${y + cr} ` +
    `Q ${x} ${y} ${x + cr} ${y} Z`
  )
}

function makePath(d: string, opts: object): Path {
  const p = new Path(d, {
    strokeWidth: 0,
    originX: 'left' as const,
    originY: 'top' as const,
    selectable: false,
    evented: false,
    hoverCursor: 'default',
    ...opts,
  })
  ;(p as Path & { layerName: string }).layerName = LAYER_NAMES.DEVICE_FRAME
  return p
}

export function renderDeviceFrame(
  deviceFrame: DeviceFrame,
  opts: DeviceFrameOptions,
): FabricObject[] {
  if (!deviceFrame.show) return []

  const fw = opts.width
  const fh = opts.height
  const outerRx = opts.rx ?? 24
  // opts.left uses originX:'center', so absolute left edge:
  const fl = opts.left - fw / 2
  const ft = opts.top

  const isIphone = deviceFrame.model === 'iphone-16-pro'
  const frameColor = deviceFrame.color === 'silver' ? '#E2E2E2' : '#1C1C1E'

  const sideBezel = isIphone ? fw * 0.038 : fw * 0.026
  const topBezel = isIphone ? fh * 0.020 : fh * 0.026
  const bottomBezel = isIphone ? fh * 0.038 : fh * 0.026
  const screenW = fw - sideBezel * 2
  const screenH = fh - topBezel - bottomBezel
  const screenRx = Math.max(outerRx * 0.82, 2)

  // Frame body with screen cutout via evenodd fill rule
  const outerD = rrPath(0, 0, fw, fh, outerRx)
  const innerD = rrPath(sideBezel, topBezel, screenW, screenH, screenRx)
  const body = makePath(`${outerD} ${innerD}`, {
    left: fl,
    top: ft,
    fill: frameColor,
    fillRule: 'evenodd',
  })

  const result: FabricObject[] = [body]

  if (isIphone) {
    const islandH = fh * 0.028
    const islandW = screenW * 0.30
    const islandX = fl + sideBezel + (screenW - islandW) / 2
    const islandY = ft + topBezel + fh * 0.010

    result.push(
      makePath(rrPath(0, 0, islandW, islandH, islandH / 2), {
        left: islandX,
        top: islandY,
        fill: '#000000',
      }),
    )
  } else {
    // iPad front camera
    const camD = Math.max(fw * 0.018, 3)
    const camX = fl + fw / 2 - camD / 2
    const camY = ft + topBezel / 2 - camD / 2

    result.push(
      makePath(rrPath(0, 0, camD, camD, camD / 2), {
        left: camX,
        top: camY,
        fill: '#3a3a3a',
      }),
    )
  }

  return result
}
