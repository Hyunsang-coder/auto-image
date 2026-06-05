import { Rect, Shadow, Text, Textbox } from 'fabric'
import type { Caption, TextShadow } from '../../types/project'
import type { LayerName } from '../layerNames'
import { LAYER_NAMES } from '../layerNames'
import { scriptFallback } from '../../lib/fonts'
import { hexToRgb } from '../../constants/defaults'

function captionShadow(s: TextShadow): Shadow {
  const { r, g, b } = hexToRgb(s.color)
  return new Shadow({
    color: `rgba(${r}, ${g}, ${b}, ${s.opacity})`,
    blur: s.blur,
    offsetX: s.offsetX,
    offsetY: s.offsetY,
    affectStroke: true,
  })
}

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

// Width-dependent caption layout: the fitted font size and the grapheme-wrap
// mode are both functions of the box width. Exported so the editor can
// recompute them live while a side handle drags the width — the drag preview
// then matches what the post-release re-render produces.
export function fitCaption(
  caption: Caption,
  width: number,
  scale = 1,
): { fontSize: number; splitByGrapheme: boolean; fontFamily: string; charSpacing: number } {
  const { style } = caption
  // Lead the fallback with the font matching this caption's script so non-Latin
  // text (Japanese/Chinese/Thai) renders the right glyphs instead of tofu.
  const fontFamily = `${style.fontFamily}, ${scriptFallback(caption.text)}`
  const charSpacing = (style.letterSpacing ?? 0) * 10
  const cjk = containsCJK(caption.text)
  const widest = (cjk || style.fitToBox)
    ? widestTokenWidth(caption.text, style.fontSize, fontFamily, String(style.fontWeight), charSpacing)
    : 0
  // CJK with an over-wide token breaks per-grapheme at the design size; word
  // wrapping (and the fit-to-box word shrink) stays in effect otherwise.
  const splitByGrapheme = cjk && widest > width
  const fontSize = style.fitToBox && !splitByGrapheme
    ? fitFontSize(style.fontSize, widest, width, 10 * scale)
    : style.fontSize
  return { fontSize, splitByGrapheme, fontFamily, charSpacing }
}

export function renderCaption(
  caption: Caption,
  opts: CaptionOptions,
): Textbox {
  const { style } = caption
  const textAlign = style.textAlign ?? 'center'
  const { fontSize, splitByGrapheme, fontFamily, charSpacing } = fitCaption(caption, opts.width, opts.scale ?? 1)

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
    // strokeWidth folds into getCenterPoint()'s dimension box (Fabric defaults
    // to 1 even with no stroke painted) — the position sync reads the geometric
    // center directly (readPlacement in FabricCanvas) so an outline doesn't
    // creep left/right-aligned captions. Default stays 0: no outline, no stroke.
    stroke: style.outline?.color,
    strokeWidth: style.outline?.width ?? 0,
    // Outline behind the fill (PPT-style) so thick strokes don't eat the glyphs.
    paintFirst: 'stroke',
    strokeLineJoin: 'round',
    shadow: style.shadow ? captionShadow(style.shadow) : undefined,
    splitByGrapheme,
    editable: true,
    selectable: true,
    hasControls: true,
  })
  ;(obj as Textbox & { layerName: string }).layerName = opts.layerName
  ;(obj as Textbox & { textIndex?: number }).textIndex = opts.textIndex
  ;(obj as Textbox & { owner?: 'leader' | 'follower' }).owner = opts.owner ?? 'leader'

  return obj
}

// Padding stashed on the underlay so a gesture tick can re-place it from the
// textbox geometry alone. Survives undo snapshots via HISTORY_PROPS.
export interface CaptionBoxProps {
  _padX?: number
  _padY?: number
}

/**
 * Glue the box underlay to its caption: textbox bounding box + padding. Called
 * at render time and re-run every move/scale/typing tick so the box never lags
 * the text (same pattern as the highlight popup's absolutely-positioned clip).
 */
export function placeCaptionBoxUnderlay(rect: Rect, text: Textbox): void {
  const { _padX = 0, _padY = 0 } = rect as Rect & CaptionBoxProps
  const w = (text.width ?? 0) * (text.scaleX ?? 1)
  const h = (text.height ?? 0) * (text.scaleY ?? 1)
  const left = text.left ?? 0
  const bboxLeft = text.originX === 'right' ? left - w
    : text.originX === 'center' ? left - w / 2
    : left
  rect.set({
    left: bboxLeft - _padX,
    top: (text.top ?? 0) - _padY,
    width: w + _padX * 2,
    height: h + _padY * 2,
  })
  rect.setCoords()
}

/**
 * Non-evented Rect underlay carrying the caption's box background. Derived
 * entirely from the caption (sync never reads it back); NOT grouped with the
 * Textbox — a Group would break inline editing, side-handle width drag, and
 * fit-to-box.
 */
export function renderCaptionBox(caption: Caption, text: Textbox): Rect | null {
  const box = caption.style.box
  if (!box) return null
  const { r, g, b } = hexToRgb(box.fill)
  const rect = new Rect({
    fill: `rgba(${r}, ${g}, ${b}, ${box.opacity})`,
    rx: box.borderRadius,
    ry: box.borderRadius,
    stroke: box.border?.color,
    strokeWidth: box.border?.width ?? 0,
    shadow: box.shadow ? captionShadow(box.shadow) : undefined,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  Object.assign(rect, {
    layerName: LAYER_NAMES.TEXT_BOX,
    textIndex: (text as Textbox & { textIndex?: number }).textIndex,
    owner: (text as Textbox & { owner?: 'leader' | 'follower' }).owner,
    _padX: box.paddingX,
    _padY: box.paddingY,
  })
  placeCaptionBoxUnderlay(rect, text)
  return rect
}
