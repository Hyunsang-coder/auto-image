import { Textbox } from 'fabric'
import type { Caption } from '../../types/project'
import type { LayerName } from '../layerNames'

export interface CaptionOptions {
  left: number
  top: number
  width: number
  layerName: LayerName
}

// The display fonts (Inter/Montserrat/Poppins) only cover Latin, so non-Latin
// locales (Thai, Traditional Chinese, Japanese, …) render tofu on export unless
// the family ends in a fallback chain. Names not installed/loaded are skipped;
// the trailing sans-serif lets the browser's per-glyph system fallback cover the
// rest. Pretendard handles Korean + Vietnamese-diacritic Latin.
const SCRIPT_FALLBACK =
  "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans Thai', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans', sans-serif"

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
    fontFamily: `${style.fontFamily}, ${SCRIPT_FALLBACK}`,
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
