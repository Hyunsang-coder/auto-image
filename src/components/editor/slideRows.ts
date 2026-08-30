import type { Slide } from '../../types/project'

export interface RowItem {
  kind: 'single' | 'span'
  /** For 'span', exactly two entries (leader, follower). For 'single', one. */
  slides: Slide[]
  /** Group id when kind === 'span'. */
  groupId?: string
}

/**
 * Group slides into display rows, folding a span pair into one entry. Shared by
 * the slide tray and the canvas board so the two can never disagree about which
 * slides belong together.
 */
export function buildRows(slides: Slide[]): RowItem[] {
  const rows: RowItem[] = []
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    if (s.spanGroupId && s.spanRole === 'leader' && slides[i + 1]?.spanGroupId === s.spanGroupId) {
      rows.push({ kind: 'span', slides: [s, slides[i + 1]], groupId: s.spanGroupId })
      i++
    } else {
      // A stray follower without its leader renders as a single, defensively.
      rows.push({ kind: 'single', slides: [s] })
    }
  }
  return rows
}
