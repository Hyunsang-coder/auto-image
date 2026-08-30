import { describe, it, expect } from 'vitest'
import { renderKey } from './useSlideThumbnails'
import { makeSlide } from '../../constants/defaults'

function pair() {
  const leader = { ...makeSlide(0), spanGroupId: 'g1', spanRole: 'leader' as const }
  const follower = { ...makeSlide(1), spanGroupId: 'g1', spanRole: 'follower' as const }
  return [leader, follower]
}

describe('renderKey — preview cache identity', () => {
  it('changes when the slide’s rendered content changes', () => {
    const a = makeSlide(0)
    const b = { ...a, texts: [{ ...a.texts[0], text: 'edited' }] }
    expect(renderKey(b, [b], '')).not.toBe(renderKey(a, [a], ''))
  })

  it('separates locales and render widths', () => {
    const s = makeSlide(0)
    expect(renderKey(s, [s], 'ja')).not.toBe(renderKey(s, [s], ''))
    // The tray renders at 220px and the export preview at full resolution;
    // sharing a key between them would show one at the other's scale.
    expect(renderKey(s, [s], '', 220)).not.toBe(renderKey(s, [s], ''))
  })

  it('invalidates the leader’s half when only the follower changed', () => {
    const [leader, follower] = pair()
    const editedFollower = { ...follower, texts: [{ ...follower.texts[0], text: 'right page' }] }
    // One wide render produces both halves, so a follower-only edit has to
    // invalidate the leader's cached half too — its own data didn't change.
    expect(renderKey(leader, [leader, editedFollower], '')).not.toBe(
      renderKey(leader, [leader, follower], ''),
    )
  })

  it('gives the two halves of one group different keys', () => {
    const [leader, follower] = pair()
    expect(renderKey(leader, [leader, follower], '')).not.toBe(
      renderKey(follower, [leader, follower], ''),
    )
  })
})
