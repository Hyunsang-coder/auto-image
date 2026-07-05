/**
 * Translation-safe partial emphasis: `==word==` markers inside caption text
 * (base or any translation) mark ranges the renderer paints with
 * `TextStyle.emphasis`. Markers live in the text strings themselves, so they
 * survive the localize CSV/JSON round-trip and per-locale translations — char
 * indexes wouldn't.
 */
export interface EmphasisParse {
  /** Text with the `==` markers removed. */
  plain: string
  /** Emphasized [start, end) ranges, indexed into `plain`. */
  ranges: { start: number; end: number }[]
}

export function parseEmphasis(text: string): EmphasisParse {
  const ranges: EmphasisParse['ranges'] = []
  let plain = ''
  let open = -1
  let i = 0
  while (i < text.length) {
    if (text.startsWith('==', i)) {
      if (open === -1) {
        open = plain.length
      } else {
        if (plain.length > open) ranges.push({ start: open, end: plain.length })
        open = -1
      }
      i += 2
    } else {
      plain += text[i]
      i += 1
    }
  }
  // Unmatched opener renders literally.
  if (open !== -1) plain = `${plain.slice(0, open)}==${plain.slice(open)}`
  return { plain, ranges }
}
