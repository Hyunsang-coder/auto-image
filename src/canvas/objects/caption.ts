import { Textbox } from 'fabric'
import type { Caption } from '../../types/project'
import type { LayerName } from '../layerNames'

export interface CaptionOptions {
  left: number
  top: number
  width: number
  layerName: LayerName
}

export function renderCaption(
  caption: Caption,
  opts: CaptionOptions,
): Textbox {
  const { style } = caption
  const textAlign = style.textAlign ?? 'center'

  const obj = new Textbox(caption.text, {
    left: opts.left,
    top: opts.top,
    width: opts.width,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: String(style.fontWeight),
    fill: style.color,
    textAlign,
    charSpacing: (style.letterSpacing ?? 0) * 10,
    lineHeight: style.lineHeight ?? 1.2,
    originX: 'center',
    originY: 'top',
    splitByGrapheme: false,
    editable: true,
    selectable: true,
    hasControls: true,
  })
  ;(obj as Textbox & { layerName: string }).layerName = opts.layerName

  return obj
}
