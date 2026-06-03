import type { Slide } from '../types/project'

// Japanese is the only non-Latin script in the supported locale set (Korean is
// covered by Pretendard, the rest are Latin), so Noto Sans JP is the single
// Noto webfont we load — on demand, because it's multi-MB and most projects are
// Korean/Latin only. Chinese/Thai are intentionally out of scope.
const NOTO_JP = { family: 'Noto Sans JP', param: 'Noto+Sans+JP' }
const KANA = /[぀-ヿ]/ // Hiragana + Katakana ⇒ Japanese

// Fallback chain appended after a caption/badge's own family. Leads with Noto
// Sans JP when the text is Japanese so kanji/kana render instead of tofu; the
// trailing sans-serif lets the browser's per-glyph fallback cover anything else.
export function scriptFallback(text: string): string {
  const lead = KANA.test(text) ? `'${NOTO_JP.family}', ` : ''
  return `${lead}'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans JP', sans-serif`
}

let jpLink: Promise<void> | null = null

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
  await document.fonts.ready
  await Promise.all(reqs.map((r) => document.fonts.load(r.font, r.text).catch(() => {})))
}
