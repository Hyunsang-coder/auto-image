import { Path } from 'fabric'
import type { Ornament } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

// 모든 SVG 경로는 100x100 박스 기준으로 그려져 있고, 렌더 시 size + canvas 폭으로 스케일된다.
const SVG_PATHS: Record<Ornament['shape'], { d: string; viewBox: number }> = {
  // 5점 star (단일 패스, 윗점부터 시계방향)
  star: {
    viewBox: 100,
    d:
      'M50 5 L61 38 L96 38 L67 58 L78 92 L50 71 L22 92 L33 58 L4 38 L39 38 Z',
  },
  // 4점 sparkle (다이아몬드 + 가는 십자)
  sparkle: {
    viewBox: 100,
    d:
      'M50 5 ' +
      'C 53 35, 65 47, 95 50 ' +
      'C 65 53, 53 65, 50 95 ' +
      'C 47 65, 35 53, 5 50 ' +
      'C 35 47, 47 35, 50 5 Z',
  },
  // 강아지 발자국: 큰 발바닥 + 네 개의 작은 발가락 (한 패스, even-odd 안씀)
  paw: {
    viewBox: 100,
    d:
      // 발바닥 (둥근 사각)
      'M50 95 C 28 95, 18 80, 22 65 C 26 53, 38 47, 50 47 C 62 47, 74 53, 78 65 C 82 80, 72 95, 50 95 Z ' +
      // 왼쪽 외측 발가락
      'M14 60 C 10 50, 14 40, 22 38 C 30 36, 36 44, 34 54 C 32 62, 22 66, 14 60 Z ' +
      // 왼쪽 내측 발가락
      'M30 30 C 26 20, 32 10, 40 10 C 48 10, 52 20, 48 28 C 44 36, 36 36, 30 30 Z ' +
      // 오른쪽 내측 발가락
      'M70 30 C 74 20, 68 10, 60 10 C 52 10, 48 20, 52 28 C 56 36, 64 36, 70 30 Z ' +
      // 오른쪽 외측 발가락
      'M86 60 C 90 50, 86 40, 78 38 C 70 36, 64 44, 66 54 C 68 62, 78 66, 86 60 Z',
  },
  // 5장 꽃잎의 데이지
  flower: {
    viewBox: 100,
    d:
      // 꽃잎 5개 (50,50 중심으로 별 배치)
      'M50 8  C 60 8, 62 30, 50 42  C 38 30, 40 8, 50 8 Z ' +
      'M88 32 C 92 41, 76 56, 60 50  C 64 34, 78 23, 88 32 Z ' +
      'M76 88 C 66 92, 50 76, 56 60  C 70 64, 80 78, 76 88 Z ' +
      'M24 88 C 14 84, 20 64, 34 60  C 40 76, 24 88, 24 88 Z ' +
      'M12 32 C 22 23, 36 34, 40 50  C 24 56, 8 41, 12 32 Z ' +
      'M50 38 C 58 38, 62 46, 58 54 C 54 60, 46 60, 42 54 C 38 46, 42 38, 50 38 Z',
  },
  // 왼쪽 반월 월계관 — 큰 아몬드 잎이 줄기 바깥쪽으로 휘어져 나가는 형태.
  // 줄기는 viewBox의 오른쪽 가장자리(x≈90)에 두고 잎이 왼쪽으로 뻗어나가도록 디자인.
  'laurel-left': {
    viewBox: 100,
    d:
      // 줄기 (얇은 곡선)
      'M88 6 C 76 28, 76 72, 88 94 L 90 94 C 78 72, 78 28, 90 6 Z ' +
      // 5개의 큰 잎 — 각 잎이 위→아래로 회전하면서 줄기에서 갈라져 나간다.
      // 잎 1 (가장 위, 거의 수평)
      'M86 14 C 60 10, 28 14, 8 24 C 24 30, 50 32, 70 28 C 80 24, 86 18, 86 14 Z ' +
      // 잎 2
      'M86 30 C 56 28, 18 32, 4 44 C 22 48, 48 48, 68 44 C 80 38, 86 32, 86 30 Z ' +
      // 잎 3 (가운데, 가장 큼)
      'M88 48 C 56 48, 14 52, 2 64 C 22 68, 48 68, 70 62 C 82 56, 88 50, 88 48 Z ' +
      // 잎 4
      'M88 66 C 60 68, 22 70, 10 80 C 26 84, 52 82, 72 76 C 84 72, 88 68, 88 66 Z ' +
      // 잎 5 (가장 아래)
      'M88 84 C 64 86, 38 88, 22 92 C 36 96, 60 94, 78 90 C 86 88, 88 86, 88 84 Z',
  },
  'laurel-right': {
    viewBox: 100,
    d:
      // 줄기 (오른쪽 미러)
      'M12 6 C 24 28, 24 72, 12 94 L 10 94 C 22 72, 22 28, 10 6 Z ' +
      'M14 14 C 40 10, 72 14, 92 24 C 76 30, 50 32, 30 28 C 20 24, 14 18, 14 14 Z ' +
      'M14 30 C 44 28, 82 32, 96 44 C 78 48, 52 48, 32 44 C 20 38, 14 32, 14 30 Z ' +
      'M12 48 C 44 48, 86 52, 98 64 C 78 68, 52 68, 30 62 C 18 56, 12 50, 12 48 Z ' +
      'M12 66 C 40 68, 78 70, 90 80 C 74 84, 48 82, 28 76 C 16 72, 12 68, 12 66 Z ' +
      'M12 84 C 36 86, 62 88, 78 92 C 64 96, 40 94, 22 90 C 14 88, 12 86, 12 84 Z',
  },
  // 도트 그리드 (4x4)
  'dot-grid': {
    viewBox: 100,
    d: dotGridPath(7, 7, 3),
  },
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

export function renderOrnament(orn: Ornament, ctx: OrnamentRenderCtx): Path {
  const def = SVG_PATHS[orn.shape]
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
    fill: orn.color,
    stroke: undefined,
    strokeWidth: 0,
    angle: orn.rotation,
    opacity: orn.opacity,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: false,
    lockScalingX: false,
    lockScalingY: false,
    borderColor: '#6366F1',
    cornerColor: '#6366F1',
    hoverCursor: 'move',
  })
  ;(path as Path & { layerName: string; ornamentId: string }).layerName =
    LAYER_NAMES.ORNAMENT
  ;(path as Path & { ornamentId: string }).ornamentId = orn.id
  return path
}
