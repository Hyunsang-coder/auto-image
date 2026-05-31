// Parse a bulk-import image filename into a slide + locale. Convention:
//   "{n}[-desc].{locale}.{ext}" -> that locale's screenshot for 1-based slide n
// Every file must carry a locale; which locale becomes the slide's base is
// decided by the project's sourceLocale setting at import time (not baked into
// the name). The slide number is the leading digits of the name, so a
// descriptive suffix is allowed (e.g. "01-home.en.png", "02-add-pdf.de.png").
// Locale codes use hyphens (zh-Hans, pt-BR), never dots, so the first dot after
// the slide token separates it from the locale.

export interface ParsedImageName {
  /** 1-based slide number as written in the filename. */
  slide: number
  /** Locale code — always present; routing to base/override is the caller's job. */
  locale: string
}

export function parseImageName(
  filename: string,
  knownLocales: Set<string>,
): ParsedImageName | { error: string } {
  const name = (filename.split('/').pop() ?? filename).replace(/\.[^.]+$/, '')
  const dot = name.indexOf('.')
  const head = dot < 0 ? name : name.slice(0, dot)
  // Leading digits only — a descriptive suffix like "01-home" is allowed.
  const slide = Number(head.match(/^\d+/)?.[0])
  if (!Number.isInteger(slide) || slide < 1) {
    return { error: `슬라이드 번호를 읽을 수 없음: "${filename}"` }
  }
  if (dot < 0) {
    return { error: `언어 접미사가 필요함 (예: 01.en.png): "${filename}"` }
  }
  const locale = name.slice(dot + 1)
  if (!knownLocales.has(locale)) {
    return { error: `지원하지 않는 언어 "${locale}": "${filename}"` }
  }
  return { slide, locale }
}
