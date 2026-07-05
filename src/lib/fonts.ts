import type { Slide } from '../types/project'
import { FONT_OPTIONS } from '../constants/defaults'

// Load script-specific Noto fonts on demand. Pretendard covers Korean + Latin;
// Japanese and Thai need explicit canvas font requests for consistent export.
const NOTO_JP = { family: 'Noto Sans JP', param: 'Noto+Sans+JP:wght@400;500;700;900' }
const NOTO_THAI = { family: 'Noto Sans Thai', param: 'Noto+Sans+Thai:wght@400;500;700;900' }
const KANA = /[぀-ヿ]/ // Hiragana + Katakana ⇒ Japanese
const THAI = /[\u0E00-\u0E7F]/

// Fallback chain appended after a caption/badge's own family. Leads with a
// script-specific family when needed; the trailing sans-serif lets the browser's
// per-glyph fallback cover anything else.
export function scriptFallback(text: string): string {
  const lead = [
    KANA.test(text) ? `'${NOTO_JP.family}'` : '',
    THAI.test(text) ? `'${NOTO_THAI.family}'` : '',
  ].filter(Boolean)
  return `${lead.length ? `${lead.join(', ')}, ` : ''}'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans JP', 'Noto Sans Thai', sans-serif`
}

const sheets = new Map<string, Promise<void>>()

// Inject a Google css2 stylesheet once per family param. Resolve on error too —
// a font-CDN hiccup must not stall an export.
function loadSheet(param: string): Promise<void> {
  const existing = sheets.get(param)
  if (existing) return existing
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${param}&display=swap`
  const p = new Promise<void>((resolve) => {
    link.onload = () => resolve()
    link.onerror = () => resolve()
  })
  document.head.appendChild(link)
  sheets.set(param, p)
  return p
}

// Inject the stylesheet for an on-demand FONT_OPTIONS family. Eagerly-loaded
// families (no `google` param) resolve immediately.
export function ensureFontFamily(family: string): Promise<void> {
  const google = FONT_OPTIONS.find((f) => f.family === family)?.google
  return google ? loadSheet(google) : Promise.resolve()
}

/** Inject every on-demand font stylesheet so the font dropdown previews render
 * in their own faces. Binaries still download lazily per glyph use. */
export function preloadFontOptions(): void {
  for (const f of FONT_OPTIONS) if (f.google) void loadSheet(f.google)
}

// Every text a slide renders, paired with the exact CSS font shorthand it will
// use — so document.fonts.load() requests precisely what fillText needs.
function slideFontRequests(slide: Slide): { text: string; font: string }[] {
  const reqs: { text: string; font: string }[] = []
  for (const c of slide.texts) {
    if (c.text.trim()) {
      reqs.push({ text: c.text, font: `${c.style.fontWeight} 16px ${c.style.fontFamily}, ${scriptFallback(c.text)}` })
    }
  }
  for (const b of slide.badges ?? []) {
    if (b.text.trim()) {
      reqs.push({ text: b.text, font: `${b.style.fontWeight} 16px Inter, ${scriptFallback(b.text)}` })
    }
  }
  return reqs
}

// Guarantee every font a slide needs is loaded before it renders to canvas.
// `document.fonts.ready` alone is insufficient: a font referenced only from
// canvas (never the DOM) isn't lazily requested, so the promise can resolve
// before it loads and fillText silently falls back to a system font — making
// non-Latin exports look different per machine. We inject the needed Noto +
// on-demand family stylesheets, then explicitly load each (weight,
// family-chain, glyphs).
export async function awaitSlideFonts(slide: Slide): Promise<void> {
  const reqs = slideFontRequests(slide)
  const families = new Set(slide.texts.map((c) => c.style.fontFamily))
  await Promise.all([...families].map(ensureFontFamily))
  if (reqs.some((r) => KANA.test(r.text))) await loadSheet(NOTO_JP.param)
  if (reqs.some((r) => THAI.test(r.text))) await loadSheet(NOTO_THAI.param)
  await document.fonts.ready
  await Promise.all(reqs.map((r) => document.fonts.load(r.font, r.text).catch(() => {})))
}
