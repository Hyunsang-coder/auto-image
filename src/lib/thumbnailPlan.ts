import type { Slide } from '../types/project'

export function spanMemberOf(
  slide: Slide,
  slides: Slide[],
  role: 'leader' | 'follower',
): Slide | undefined {
  if (slide.spanRole === role) return slide
  return slides.find((s) => s.spanGroupId === slide.spanGroupId && s.spanRole === role)
}

// Cache identity for one rendered slide. A stale key means the preview shows
// pixels that no longer match the project. For span members the pixels come
// from one shared wide render (leader's layers + both slides' texts), so fold
// both members' content (and which half) into the key instead of just the
// slide's own data.
export function renderKey(slide: Slide, slides: Slide[], locale: string, width?: number): string {
  if (slide.spanGroupId) {
    const leader = spanMemberOf(slide, slides, 'leader')
    const follower = spanMemberOf(slide, slides, 'follower')
    return JSON.stringify({
      locale,
      width,
      role: slide.spanRole,
      leader: leader ?? null,
      follower: follower ?? null,
    })
  }
  return JSON.stringify({ locale, width, slide })
}

export interface ThumbnailJob {
  /** Span pair: one wide render covers both halves. Plain slide: single render. */
  leader: Slide
  follower?: Slide
  single?: Slide
  /** Cache key per half; a half whose key already hit is carried over, not re-rendered. */
  leaderKey?: string
  followerKey?: string
  singleKey?: string
  /** Slide ids this job's render commits to (only the halves that missed). */
  slideIds: string[]
}

/**
 * Plan thumbnail renders so a span group costs ONE wide render even though its
 * leader and follower carry different cache keys (the role is folded into the
 * key). Plain slides plan one job each. Jobs are emitted only for halves that
 * missed the cache; a pair that fully hit plans nothing.
 */
export function planThumbnailJobs(
  slides: Slide[],
  locale: string,
  width: number | undefined,
  isCached: (key: string) => boolean,
): ThumbnailJob[] {
  const jobs: ThumbnailJob[] = []
  const seenGroups = new Set<string>()
  // Keys are computed once per slide here; the run loop reuses the job instead
  // of re-stringifying every slide a second time.
  for (const slide of slides) {
    if (slide.spanGroupId) {
      if (seenGroups.has(slide.spanGroupId)) continue
      seenGroups.add(slide.spanGroupId)
      const leader = spanMemberOf(slide, slides, 'leader')
      const follower = spanMemberOf(slide, slides, 'follower')
      if (!leader || !follower) continue
      const leaderKey = renderKey(leader, slides, locale, width)
      const followerKey = renderKey(follower, slides, locale, width)
      const wantLeader = !isCached(leaderKey)
      const wantFollower = !isCached(followerKey)
      if (!wantLeader && !wantFollower) continue
      const slideIds: string[] = []
      if (wantLeader) slideIds.push(leader.id)
      if (wantFollower) slideIds.push(follower.id)
      jobs.push({ leader, follower, leaderKey, followerKey, slideIds })
    } else {
      const key = renderKey(slide, slides, locale, width)
      if (isCached(key)) continue
      jobs.push({ leader: slide, single: slide, singleKey: key, slideIds: [slide.id] })
    }
  }
  return jobs
}
