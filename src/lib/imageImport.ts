// Parse a bulk-import image filename into a slide target. Convention:
//   "{n}[-desc].{ext}"          -> base screenshot for that 1-based slide n
//   "{n}[-desc].{locale}.{ext}" -> per-locale override for that slide
// The slide number is the leading digits of the name, so a descriptive suffix
// is allowed (e.g. "01-home.png", "02-add-pdf.de.png"). Locale codes use
// hyphens (zh-Hans, pt-BR), never dots, so the first dot after the slide token
// separates it from the locale.

export interface ParsedImageName {
  /** 1-based slide number as written in the filename. */
  slide: number
  /** Locale code when present; absent means the base screenshot. */
  locale?: string
}

export function parseImageName(
  filename: string,
  knownLocales: Set<string>,
): ParsedImageName | { error: string } {
  const name = (filename.split('/').pop() ?? filename).replace(/\.[^.]+$/, '')
  const dot = name.indexOf('.')
  const head = dot < 0 ? name : name.slice(0, dot)
  const locale = dot < 0 ? undefined : name.slice(dot + 1)
  // Leading digits only — a descriptive suffix like "01-home" is allowed.
  const slide = Number(head.match(/^\d+/)?.[0])
  if (!Number.isInteger(slide) || slide < 1) {
    return { error: `슬라이드 번호를 읽을 수 없음: "${filename}"` }
  }
  if (locale !== undefined && !knownLocales.has(locale)) {
    return { error: `지원하지 않는 언어 "${locale}": "${filename}"` }
  }
  return { slide, locale }
}
