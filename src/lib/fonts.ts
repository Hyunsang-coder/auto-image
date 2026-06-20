import type { Slide } from '../types/project'

// Load script-specific Noto fonts on demand. Pretendard covers Korean + Latin;
// Japanese and Thai need explicit canvas font requests for consistent export.
const NOTO_JP = { family: 'Noto Sans JP', param: 'Noto+Sans+JP' }
const NOTO_THAI = { family: 'Noto Sans Thai', param: 'Noto+Sans+Thai' }
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

let jpLink: Promise<void> | null = null
let thaiLink: Promise<void> | null = null

function loadNotoJp(): Promise<void> {
  if (jpLink) return jpLink
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${NOTO_JP.param}:wght@400;500;700;900&display=swap`
  // Resolve on error too — a font-CDN hiccup must not stall an export.
  jpLink = new Promise<void>((resolve) => {
    link.onload = () => resolve()
    link.onerror = () => resolve()
  })
  document.head.appendChild(link)
  return jpLink
}

function loadNotoThai(): Promise<void> {
  if (thaiLink) return thaiLink
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${NOTO_THAI.param}:wght@400;500;700;900&display=swap`
  thaiLink = new Promise<void>((resolve) => {
    link.onload = () => resolve()
    link.onerror = () => resolve()
  })
  document.head.appendChild(link)
  return thaiLink
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
// non-Latin exports look different per machine. We inject the needed Noto
// stylesheets, then explicitly load each (weight, family-chain, glyphs).
export async function awaitSlideFonts(slide: Slide): Promise<void> {
  const reqs = slideFontRequests(slide)
  if (reqs.some((r) => KANA.test(r.text))) await loadNotoJp()
  if (reqs.some((r) => THAI.test(r.text))) await loadNotoThai()
  await document.fonts.ready
  await Promise.all(reqs.map((r) => document.fonts.load(r.font, r.text).catch(() => {})))
}
