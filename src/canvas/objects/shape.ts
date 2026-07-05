import { Ellipse, Polygon, Rect } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Shape } from '../../types/project'
import { LAYER_NAMES } from '../layerNames'

export interface ShapeRenderCtx {
  canvasWidth: number
  canvasHeight: number
}

// Arrow proportions within the shape's w×h box: the head spans the full box
// height, the shaft a fraction of it. h is the head size knob; w the length.
const ARROW_SHAFT_RATIO = 0.45

function arrowPoints(w: number, h: number): { x: number; y: number }[] {
  const shaft = h * ARROW_SHAFT_RATIO
  const head = Math.min(w * 0.4, h * 1.1)
  return [
    { x: 0, y: (h - shaft) / 2 },
    { x: w - head, y: (h - shaft) / 2 },
    { x: w - head, y: 0 },
    { x: w, y: h / 2 },
    { x: w - head, y: h },
    { x: w - head, y: (h + shaft) / 2 },
    { x: 0, y: (h + shaft) / 2 },
  ]
}

export function renderShape(shape: Shape, ctx: ShapeRenderCtx): FabricObject {
  const w = ctx.canvasWidth * shape.width
  const h = ctx.canvasHeight * shape.height
  const fill = shape.fill === 'none' ? '' : shape.fill
  const strokeProps = shape.stroke
    ? { stroke: shape.stroke.color, strokeWidth: ctx.canvasWidth * shape.stroke.width, strokeUniform: true }
    : {}

  let obj: FabricObject
  if (shape.kind === 'ellipse') {
    obj = new Ellipse({ rx: w / 2, ry: h / 2, fill, ...strokeProps })
  } else if (shape.kind === 'arrow') {
    obj = new Polygon(arrowPoints(w, h), { fill, ...strokeProps })
  } else {
    // rect + line (a line is a thin rect with fully rounded caps)
    const r = shape.kind === 'line' ? h / 2 : Math.min(w, h) * (shape.cornerRadiusRatio ?? 0)
    obj = new Rect({ width: w, height: h, rx: r, ry: r, fill, ...strokeProps })
  }

  obj.set({
    left: ctx.canvasWidth * shape.x,
    top: ctx.canvasHeight * shape.y,
    originX: 'center',
    originY: 'center',
    angle: shape.rotation,
    opacity: shape.opacity,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    borderColor: '#0D99FF',
    cornerColor: '#0D99FF',
    hoverCursor: 'move',
  })
  ;(obj as FabricObject & { layerName: string; shapeId: string }).layerName = LAYER_NAMES.SHAPE
  ;(obj as FabricObject & { shapeId: string }).shapeId = shape.id
  return obj
}
