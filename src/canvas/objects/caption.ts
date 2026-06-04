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
  /** Which span half owns this block. On a 2-page span the leader's and the
   * follower's texts share one wide canvas, so textIndex alone isn't unique —
   * sync routes by (owner, textIndex). Absent = leader (single-slide render). */
  owner?: 'leader' | 'follower'
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

// Hangul syllables/jamo, kana, and CJK ideographs — scripts whose typography
// permits a line break between any two characters. A token in these scripts
// that's wider than the box wraps per-grapheme instead of overflowing (no fit)
// or being crushed onto one line (fit-to-box).
const CJK = /[가-힣ㄱ-ㅎㅏ-ㅣ぀-ヿ㐀-䶿一-鿿]/
export function containsCJK(text: string): boolean {
  return CJK.test(text)
}

// Width of the widest unbreakable token (word) at `fontSize`. A Textbox wraps
// at word boundaries, so this is the narrowest a line can be forced to.
function widestTokenWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  charSpacing: number,
): number {
  let widest = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const probe = new Text(word, { fontFamily, fontSize, fontWeight, charSpacing })
    widest = Math.max(widest, probe.width ?? 0)
  }
  return widest
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
  const cjk = containsCJK(caption.text)
  const widest = (cjk || style.fitToBox)
    ? widestTokenWidth(caption.text, style.fontSize, fontFamily, String(style.fontWeight), charSpacing)
    : 0
  // CJK with an over-wide token breaks per-grapheme at the design size; word
  // wrapping (and the fit-to-box word shrink) stays in effect otherwise.
  const graphemeWrap = cjk && widest > opts.width
  const fontSize = style.fitToBox && !graphemeWrap
    ? fitFontSize(style.fontSize, widest, opts.width, minFontSize)
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
    splitByGrapheme: graphemeWrap,
    editable: true,
    selectable: true,
    hasControls: true,
  })
  ;(obj as Textbox & { layerName: string }).layerName = opts.layerName
  ;(obj as Textbox & { textIndex?: number }).textIndex = opts.textIndex
  ;(obj as Textbox & { owner?: 'leader' | 'follower' }).owner = opts.owner ?? 'leader'

  return obj
}
