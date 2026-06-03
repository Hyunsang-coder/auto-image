import { Path } from 'fabric'
import type { DeviceFrame } from '../../types/project'
import { frameSpecOf } from '../../constants/deviceSpecs'
import { LAYER_NAMES } from '../layerNames'

export interface DeviceFrameOptions {
  left: number
  top: number
  width: number
  height: number
  rx?: number
}

export interface ScreenBounds {
  left: number
  top: number
  width: number
  height: number
  rx: number
}

export interface DeviceFrameRender {
  paths: Path[]
  screen: ScreenBounds
}

// Uses elliptical arcs (A) instead of quadratic beziers so the corner curve
// matches Fabric's Rect rx/ry geometry — otherwise the frame cutout and the
// screenshot clipPath disagree at corners and a hairline gap shows through.
function rrPath(x: number, y: number, w: number, h: number, r: number): string {
  const cr = Math.min(r, w / 2, h / 2)
  return (
    `M ${x + cr} ${y} L ${x + w - cr} ${y} ` +
    `A ${cr} ${cr} 0 0 1 ${x + w} ${y + cr} ` +
    `L ${x + w} ${y + h - cr} ` +
    `A ${cr} ${cr} 0 0 1 ${x + w - cr} ${y + h} ` +
    `L ${x + cr} ${y + h} ` +
    `A ${cr} ${cr} 0 0 1 ${x} ${y + h - cr} ` +
    `L ${x} ${y + cr} ` +
    `A ${cr} ${cr} 0 0 1 ${x + cr} ${y} Z`
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
): DeviceFrameRender {
  if (!deviceFrame.show) {
    return {
      paths: [],
      screen: { left: opts.left - opts.width / 2, top: opts.top, width: opts.width, height: opts.height, rx: opts.rx ?? 0 },
    }
  }

  const fw = opts.width
  const fh = opts.height
  const outerRx = opts.rx ?? 24
  // opts.left uses originX:'center', so absolute left edge:
  const fl = opts.left - fw / 2
  const ft = opts.top

  const frameColor = deviceFrame.color === 'silver' ? '#E2E2E2' : '#1C1C1E'

  // Symmetric bezel — uniform on all 4 sides. Ratio is taken from the spec
  // (fraction of device width) so the editor matches Apple's device dimensions.
  const spec = frameSpecOf(deviceFrame)
  const hasIsland = spec.hasIsland
  const bezel = fw * spec.screenInsetRatio
  const screenW = fw - bezel * 2
  const screenH = fh - bezel * 2
  const screenRx = Math.max(outerRx - bezel, 2)

  // Frame body with screen cutout via evenodd fill rule
  const outerD = rrPath(0, 0, fw, fh, outerRx)
  const innerD = rrPath(bezel, bezel, screenW, screenH, screenRx)
  const body = makePath(`${outerD} ${innerD}`, {
    left: fl,
    top: ft,
    fill: frameColor,
    fillRule: 'evenodd',
  })

  const paths: Path[] = [body]

  if (hasIsland) {
    // Dynamic Island: real iPhone 16 Pro has it at ~25% of screen width.
    // Was 0.30 which made the phone look toy-ish in reference comparisons.
    const islandH = fh * 0.028
    const islandW = screenW * 0.25
    const islandX = fl + bezel + (screenW - islandW) / 2
    const islandY = ft + bezel + fh * 0.012

    paths.push(
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
    const camY = ft + bezel / 2 - camD / 2

    paths.push(
      makePath(rrPath(0, 0, camD, camD, camD / 2), {
        left: camX,
        top: camY,
        fill: '#3a3a3a',
      }),
    )
  }

  return {
    paths,
    screen: {
      left: fl + bezel,
      top: ft + bezel,
      width: screenW,
      height: screenH,
      rx: screenRx,
    },
  }
}
