import type { Caption, CaptionOverride, LocaleOverride, Slide } from '../types/project'

/**
 * One-time transform for the span text-ownership change (persist v4→v5,
 * custom-template store v2→v3): span captions move from wide-canvas (2×)
 * normalization on the leader to per-slide ownership. A leader caption sitting
 * on the right half becomes the follower's caption, and every x/boxWidth
 * fraction renormalizes from the full span width to the owning page's width
 * (×2). Pixel positions are preserved: wide x ≥ 0.5 → follower-local
 * (x−0.5)×2; wide x < 0.5 → leader-local x×2. Renormalized values may leave
 * [0,1] when a box crosses the seam — ownership is array membership, not
 * position, so that's allowed. Pos-less captions stay on the leader.
 */

type Side = 'leader' | 'follower'

function sideOf(c: Caption): Side {
  return c.pos && c.pos.x >= 0.5 ? 'follower' : 'leader'
}

function toPageSpace(c: Caption, side: Side): Caption {
  const next: Caption = { ...c }
  if (c.pos) next.pos = { x: c.pos.x * 2 - (side === 'follower' ? 1 : 0), y: c.pos.y }
  if (c.boxWidth != null) next.boxWidth = Math.min(c.boxWidth * 2, 1)
  return next
}

export interface SplitTextsResult {
  leaderTexts: Caption[]
  followerTexts: Caption[]
  /** moves[oldLeaderIndex] = new home, for re-keying index-based override maps. */
  moves: Array<{ side: Side; to: number }>
}

export function splitLeaderTexts(texts: Caption[]): SplitTextsResult {
  const leaderTexts: Caption[] = []
  const followerTexts: Caption[] = []
  const moves: SplitTextsResult['moves'] = []
  for (const c of texts) {
    const side = sideOf(c)
    const bucket = side === 'leader' ? leaderTexts : followerTexts
    moves.push({ side, to: bucket.length })
    bucket.push(toPageSpace(c, side))
  }
  return { leaderTexts, followerTexts, moves }
}

function toPageSpaceOverride(ov: CaptionOverride, side: Side): CaptionOverride {
  const next: CaptionOverride = { ...ov }
  if (ov.pos) next.pos = { x: ov.pos.x * 2 - (side === 'follower' ? 1 : 0), y: ov.pos.y }
  if (ov.boxWidth != null) next.boxWidth = Math.min(ov.boxWidth * 2, 1)
  return next
}

function migrateSpanPair(leader: Slide, follower: Slide): { leader: Slide; follower: Slide } {
  const { leaderTexts, followerTexts, moves } = splitLeaderTexts(leader.texts)

  // Re-key the leader's per-locale caption-override maps through the move map;
  // entries whose caption moved land on the follower. Override pos/boxWidth are
  // wide-normalized too, so they get the same renormalization as their caption.
  const leaderOv: Record<string, LocaleOverride> = {}
  const followerTextOv: Record<string, Record<number, CaptionOverride>> = {}
  for (const [locale, ov] of Object.entries(leader.localeOverrides ?? {})) {
    const kept: Record<number, CaptionOverride> = {}
    for (const [key, captionOv] of Object.entries(ov.texts ?? {})) {
      const move = moves[Number(key)]
      if (!move) continue // stale index — drop
      const transformed = toPageSpaceOverride(captionOv, move.side)
      if (move.side === 'leader') kept[move.to] = transformed
      else (followerTextOv[locale] ??= {})[move.to] = transformed
    }
    const next: LocaleOverride = { ...ov }
    if (Object.keys(kept).length) next.texts = kept
    else delete next.texts
    if (Object.keys(next).length) leaderOv[locale] = next
  }

  // The follower's dormant texts are replaced wholesale (they were invisible
  // while grouped), so its old text overrides are dropped with them; non-text
  // override fields are kept (still inert, but they're the user's data).
  const followerOv: Record<string, LocaleOverride> = {}
  for (const [locale, ov] of Object.entries(follower.localeOverrides ?? {})) {
    const next: LocaleOverride = { ...ov }
    delete next.texts
    if (Object.keys(next).length) followerOv[locale] = next
  }
  for (const [locale, texts] of Object.entries(followerTextOv)) {
    followerOv[locale] = { ...followerOv[locale], texts }
  }

  return {
    leader: {
      ...leader,
      texts: leaderTexts,
      localeOverrides: Object.keys(leaderOv).length ? leaderOv : undefined,
    },
    follower: {
      ...follower,
      texts: followerTexts,
      localeOverrides: Object.keys(followerOv).length ? followerOv : undefined,
    },
  }
}

/** Migrate every intact span pair in place; broken groups pass through untouched. */
export function migrateSpanSlides(slides: Slide[]): Slide[] {
  const replaced = new Map<string, Slide>()
  const seen = new Set<string>()
  for (const s of slides) {
    if (!s.spanGroupId || seen.has(s.spanGroupId)) continue
    seen.add(s.spanGroupId)
    const members = slides.filter((m) => m.spanGroupId === s.spanGroupId)
    const leader = members.find((m) => m.spanRole === 'leader')
    const follower = members.find((m) => m.spanRole === 'follower')
    if (members.length !== 2 || !leader || !follower) continue
    const next = migrateSpanPair(leader, follower)
    replaced.set(leader.id, next.leader)
    replaced.set(follower.id, next.follower)
  }
  return replaced.size ? slides.map((s) => replaced.get(s.id) ?? s) : slides
}
