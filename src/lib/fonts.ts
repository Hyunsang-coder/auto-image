import type { Slide } from '../types/project'

// Per-script Noto webfont served by Google Fonts. Loaded on demand (only the
// scripts a project actually uses) because each CJK file is multi-MB — the
// reason Pretendard, not Noto, is the default for the common Korean+Latin case.
type ScriptKey = 'jp' | 'sc' | 'thai'
const NOTO: Record<ScriptKey, { family: string; param: string }> = {
  jp: { family: 'Noto Sans JP', param: 'Noto+Sans+JP' },
  sc: { family: 'Noto Sans SC', param: 'Noto+Sans+SC' },
  thai: { family: 'Noto Sans Thai', param: 'Noto+Sans+Thai' },
}

const KANA = /[぀-ヿ]/ // Hiragana + Katakana ⇒ Japanese
const THAI = /[฀-๿]/
const HAN = /[㐀-鿿]/ // CJK ideographs, shared by zh/ja

// Which Noto script a string most needs. Kana ⇒ Japanese; Han without kana ⇒
// Chinese (Simplified glyphs — Traditional would need the locale code, which
// canvas text doesn't carry). Latin/Korean return null (Pretendard + the OS
// cover them, so no multi-MB download is triggered).
function scriptOf(text: string): ScriptKey | null {
  if (KANA.test(text)) return 'jp'
  if (THAI.test(text)) return 'thai'
  if (HAN.test(text)) return 'sc'
  return null
}

// Fallback chain appended after a caption/badge's own family. Leads with the
// font matching the text's dominant script so shared CJK glyphs render in the
// right regional shape; the rest stays for mixed-script safety, and the trailing
// sans-serif lets the browser's per-glyph fallback cover anything unloaded.
export function scriptFallback(text: string): string {
  const s = scriptOf(text)
  const lead = s ? `'${NOTO[s].family}', ` : ''
  return `${lead}'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans Thai', sans-serif`
}

const injected = new Map<ScriptKey, Promise<void>>()

function loadNoto(s: ScriptKey): Promise<void> {
  const existing = injected.get(s)
  if (existing) return existing
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${NOTO[s].param}:wght@400;500;700;900&display=swap`
  // Resolve on error too — a font-CDN hiccup must not stall an export.
  const p = new Promise<void>((resolve) => {
    link.onload = () => resolve()
    link.onerror = () => resolve()
  })
  document.head.appendChild(link)
  injected.set(s, p)
  return p
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
  const scripts = new Set<ScriptKey>()
  for (const r of reqs) {
    const s = scriptOf(r.text)
    if (s) scripts.add(s)
  }
  await Promise.all([...scripts].map(loadNoto))
  await document.fonts.ready
  await Promise.all(reqs.map((r) => document.fonts.load(r.font, r.text).catch(() => {})))
}
