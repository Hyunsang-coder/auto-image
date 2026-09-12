import { describe, it, expect } from 'vitest'
import { planThumbnailJobs, renderKey } from './thumbnailPlan'
import { makeSlide } from '../constants/defaults'

function pair() {
  const leader = { ...makeSlide(0), spanGroupId: 'g1', spanRole: 'leader' as const }
  const follower = { ...makeSlide(1), spanGroupId: 'g1', spanRole: 'follower' as const }
  return { leader, follower }
}

describe('planThumbnailJobs [H-V5]', () => {
  it('[H-V5] plans a single job for a span pair that fully missed', () => {
    const { leader, follower } = pair()
    const jobs = planThumbnailJobs([leader, follower], '', 220, () => false)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].follower?.id).toBe(follower.id)
    expect(jobs[0].single).toBeUndefined()
    expect(new Set(jobs[0].slideIds)).toEqual(new Set([leader.id, follower.id]))
  })

  it('[H-V5] plans nothing when both halves hit the cache', () => {
    const { leader, follower } = pair()
    const jobs = planThumbnailJobs([leader, follower], '', 220, () => true)
    expect(jobs).toHaveLength(0)
  })

  it('[H-V5] still renders once when only one half missed', () => {
    const { leader, follower } = pair()
    const slides = [leader, follower]
    const leaderKey = renderKey(leader, slides, '', 220)
    const jobs = planThumbnailJobs(slides, '', 220, (k) => k === leaderKey)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].slideIds).toEqual([follower.id])
  })

  it('[H-V5] plans one job per uncached plain slide and skips cached ones', () => {
    const a = makeSlide(0)
    const b = makeSlide(1)
    const cached = new Set<string>()
    const first = planThumbnailJobs([a, b], '', 220, (k) => cached.has(k))
    expect(first).toHaveLength(2)
    expect(first[0].single?.id).toBe(a.id)
    // Cache the first slide's key only.
    cached.add(first[0].singleKey!)
    const second = planThumbnailJobs([a, b], '', 220, (k) => cached.has(k))
    expect(second).toHaveLength(1)
    expect(second[0].single?.id).toBe(b.id)
  })

  it('[H-V5] skips a broken span pair instead of planning a half render', () => {
    const { leader } = pair()
    const jobs = planThumbnailJobs([leader], '', 220, () => false)
    expect(jobs).toHaveLength(0)
  })
})
