import { Text, Textbox } from 'fabric'
import type { Caption } from '../../types/project'
import type { LayerName } from '../layerNames'
import { scriptFallback } from '../../lib/fonts'

export interface CaptionOptions {
  left: number
  top: number
  width: number
  layerName: LayerName
  /** Index of this block within slide.texts; tagged onto the object so sync can
   * map it back to the right entry. */
  textIndex?: number
  // Canvas/font scale relative to the editor (1 in the editor, ~3 at export
  // resolution). Absolute floors must scale with it so the fit-to-box result is
  // identical in proportion at every resolution.
  scale?: number
}

// Shrink-only fit policy: the base (design) size is the ceiling, so a short
// locale keeps the intended size while text wider than the box is reduced just
// enough to fit (floored at 10). `widest` is the widest unbreakable token (word)
// measured at `baseFontSize`. Pure so the policy is testable without a Fabric probe.
export function fitFontSize(
  baseFontSize: number,
  widest: number,
  boxWidth: number,
  minFontSize = 10,
): number {
  if (widest <= 0) return baseFontSize
  return Math.max(minFontSize, baseFontSize * Math.min(1, boxWidth / widest))
}

// Largest font size — capped at `baseFontSize` — at which `text` fits `boxWidth`
// once wrapped. A Textbox wraps at word boundaries, so the only thing that can't
// fit is a single word wider than the box: we measure the widest WORD (not the
// whole line) and shrink just enough for it. The text then wraps to multiple
// lines near the design size instead of being crushed to cram a whole line onto
// one row — the standard shrink-to-fit-after-wrap behavior. CJK text (no spaces,
// which Fabric won't wrap) is one token, so it still shrinks to fit the width.
function fitFontToBox(
  text: string,
  baseFontSize: number,
  fontFamily: string,
  fontWeight: string,
  charSpacing: number,
  boxWidth: number,
  minFontSize: number,
): number {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return baseFontSize
  let widest = 0
  for (const word of words) {
    const probe = new Text(word, { fontFamily, fontSize: baseFontSize, fontWeight, charSpacing })
    widest = Math.max(widest, probe.width ?? 0)
  }
  return fitFontSize(baseFontSize, widest, boxWidth, minFontSize)
}

export function renderCaption(
  caption: Caption,
  opts: CaptionOptions,
): Textbox {
  const { style } = caption
  const textAlign = style.textAlign ?? 'center'
  // Lead the fallback with the font matching this caption's script so non-Latin
  // text (Japanese/Chinese/Thai) renders the right glyphs instead of tofu.
  const fontFamily = `${style.fontFamily}, ${scriptFallback(caption.text)}`
  const charSpacing = (style.letterSpacing ?? 0) * 10
  const minFontSize = 10 * (opts.scale ?? 1)
  const fontSize = style.fitToBox
    ? fitFontToBox(caption.text, style.fontSize, fontFamily, String(style.fontWeight), charSpacing, opts.width, minFontSize)
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
  ;(obj as Textbox & { textIndex?: number }).textIndex = opts.textIndex

  return obj
}
