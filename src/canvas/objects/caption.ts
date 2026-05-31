import { Text, Textbox } from 'fabric'
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

// Shrink-only fit policy: the base (design) size is the ceiling, so a short
// locale keeps the intended size while text wider than the box is reduced just
// enough to fit (floored at 10). `widest` is the widest unwrapped line measured
// at `baseFontSize`. Pure so the policy is testable without a Fabric probe.
export function fitFontSize(baseFontSize: number, widest: number, boxWidth: number): number {
  if (widest <= 0) return baseFontSize
  return Math.max(10, baseFontSize * Math.min(1, boxWidth / widest))
}

// Largest font size — capped at `baseFontSize` — at which every existing line of
// `text` fits within `boxWidth`. Measured per line with an unwrapped Text probe;
// single-pass is exact because each line then fits.
function fitFontToBox(
  text: string,
  baseFontSize: number,
  fontFamily: string,
  fontWeight: string,
  charSpacing: number,
  boxWidth: number,
): number {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return baseFontSize
  let widest = 0
  for (const line of lines) {
    const probe = new Text(line, { fontFamily, fontSize: baseFontSize, fontWeight, charSpacing })
    widest = Math.max(widest, probe.width ?? 0)
  }
  return fitFontSize(baseFontSize, widest, boxWidth)
}

export function renderCaption(
  caption: Caption,
  opts: CaptionOptions,
): Textbox {
  const { style } = caption
  const textAlign = style.textAlign ?? 'center'
  const fontFamily = `${style.fontFamily}, ${SCRIPT_FALLBACK}`
  const charSpacing = (style.letterSpacing ?? 0) * 10
  const fontSize = style.fitToBox
    ? fitFontToBox(caption.text, style.fontSize, fontFamily, String(style.fontWeight), charSpacing, opts.width)
    : style.fontSize

  const obj = new Textbox(caption.text, {
    left: opts.left,
    top: opts.top,
    width: opts.width,
    fontFamily,
    fontSize,
    fontWeight: String(style.fontWeight),
    fill: style.color,
    textAlign,
    charSpacing,
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
