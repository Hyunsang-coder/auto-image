import { Path } from 'fabric'
import type { Ornament, OrnamentShape } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

interface ShapeDef {
  d: string
  /** Coordinate box the path is drawn in; render scales `size`×canvasW to it. */
  viewBox: number
  /** Stroke line-art (Lucide) vs solid fill (dot texture). */
  fill: boolean
}

// Lucide 아이콘(MIT)의 path 데이터를 그대로 사용한다 — 24×24 박스, 2px stroke 라인아트.
// circle/line 요소는 Fabric Path가 못 받으므로 arc/line 커맨드로 합쳐 단일 d로 만든다.
const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`

const SVG_PATHS: Record<OrnamentShape, ShapeDef> = {
  star: {
    viewBox: 24,
    fill: false,
    d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  },
  sparkles: {
    viewBox: 24,
    fill: false,
    d:
      'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z ' +
      'M20 2v4 M22 4h-4 ' +
      circle(4, 20, 2),
  },
  heart: {
    viewBox: 24,
    fill: false,
    d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
  },
  flower: {
    viewBox: 24,
    fill: false,
    d:
      circle(12, 12, 3) +
      ' M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5 ' +
      'M12 7.5V9 M7.5 12H9 M16.5 12H15 M12 16.5V15 ' +
      'm8 8 1.88 1.88 M14.12 9.88 16 8 m8 16 1.88-1.88 M14.12 14.12 16 16',
  },
  leaf: {
    viewBox: 24,
    fill: false,
    d:
      'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z ' +
      'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  },
  paw: {
    viewBox: 24,
    fill: false,
    d:
      circle(11, 4, 2) +
      ' ' +
      circle(18, 8, 2) +
      ' ' +
      circle(20, 16, 2) +
      ' M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z',
  },
  // 도트 그리드 (7x7) — 유일한 fill 텍스처.
  'dot-grid': {
    viewBox: 100,
    fill: true,
    d: dotGridPath(7, 7, 3),
  },
}

/** Inverse of the render scale: lets the canvas sync recover `size` from scaleX. */
export function getOrnamentViewBox(shape: OrnamentShape): number {
  return SVG_PATHS[shape]?.viewBox ?? 24
}

function dotGridPath(cols: number, rows: number, r: number): string {
  const gapX = 100 / (cols + 1)
  const gapY = 100 / (rows + 1)
  const segments: string[] = []
  for (let c = 1; c <= cols; c++) {
    for (let row = 1; row <= rows; row++) {
      const cx = c * gapX
      const cy = row * gapY
      segments.push(
        `M ${cx - r} ${cy} ` +
          `A ${r} ${r} 0 1 0 ${cx + r} ${cy} ` +
          `A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`,
      )
    }
  }
  return segments.join(' ')
}

export interface OrnamentRenderCtx {
  canvasWidth: number
  canvasHeight: number
}

export function renderOrnament(orn: Ornament, ctx: OrnamentRenderCtx): Path | null {
  const def = SVG_PATHS[orn.shape]
  // 영속화된 옛 프로젝트가 제거된 shape(월계관 등)를 들고 있을 수 있다 — 조용히 건너뛴다.
  if (!def) return null
  const targetW = ctx.canvasWidth * orn.size
  const scale = targetW / def.viewBox

  // SVG 경로는 좌상단 0,0 기준. 우리는 (x,y)를 도형 중심으로 쓰고 싶으므로
  // 원점을 'center'로 설정해 회전이 도형 중심에서 일어나게 한다.
  const path = new Path(def.d, {
    left: ctx.canvasWidth * orn.x,
    top: ctx.canvasHeight * orn.y,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
    // 라인아트 도형은 외곽선만 그리지만, filled가 켜지면 외곽선은 유지한 채 내부도 채운다.
    fill: def.fill || orn.filled ? orn.color : '',
    stroke: def.fill ? undefined : orn.color,
    // 2px(=Lucide 기준) 선폭. scaleX와 함께 스케일되어 아이콘 크기에 비례한다.
    strokeWidth: def.fill ? 0 : 2,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    angle: orn.rotation,
    opacity: orn.opacity,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: false,
    lockScalingX: false,
    lockScalingY: false,
    borderColor: '#0D99FF',
    cornerColor: '#0D99FF',
    hoverCursor: 'move',
  })
  ;(path as Path & { layerName: string; ornamentId: string }).layerName =
    LAYER_NAMES.ORNAMENT
  ;(path as Path & { ornamentId: string }).ornamentId = orn.id
  return path
}
