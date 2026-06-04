import { describe, it, expect } from 'vitest'
import { splitLeaderTexts, migrateSpanSlides } from './spanTextMigration'
import type { Caption, Slide } from '../types/project'

const STYLE = {
  fontFamily: 'Pretendard',
  fontSize: 35,
  fontWeight: 700,
  color: '#000',
  textAlign: 'left',
} as Caption['style']

function cap(over: Partial<Caption> = {}): Caption {
  return { text: 'head', translations: {}, style: STYLE, ...over }
}

function slide(over: Partial<Slide>): Slide {
  return {
    id: 'x',
    index: 0,
    texts: [],
    badges: [],
    highlights: [],
    ...over,
  } as unknown as Slide
}

describe('splitLeaderTexts', () => {
  it('keeps a left-half caption on the leader, renormalized ×2', () => {
    const { leaderTexts, followerTexts } = splitLeaderTexts([
      cap({ pos: { x: 0.2542, y: 0.1704 }, boxWidth: 0.4312 }),
    ])
    expect(followerTexts).toEqual([])
    expect(leaderTexts[0].pos).toEqual({ x: 0.5084, y: 0.1704 })
    expect(leaderTexts[0].boxWidth).toBeCloseTo(0.8624)
  })

  it('moves a right-half caption to the follower, renormalized to its page', () => {
    const { leaderTexts, followerTexts } = splitLeaderTexts([
      cap({ pos: { x: 0.7355, y: 0.8873 }, boxWidth: 0.4267 }),
    ])
    expect(leaderTexts).toEqual([])
    expect(followerTexts[0].pos!.x).toBeCloseTo(0.471)
    expect(followerTexts[0].pos!.y).toBe(0.8873)
    expect(followerTexts[0].boxWidth).toBeCloseTo(0.8534)
  })

  it('keeps a pos-less caption on the leader unchanged', () => {
    const c = cap()
    const { leaderTexts, followerTexts } = splitLeaderTexts([c])
    expect(leaderTexts).toEqual([c])
    expect(followerTexts).toEqual([])
  })

  it('clamps boxWidth at 1 (a box cannot exceed one page)', () => {
    const { leaderTexts } = splitLeaderTexts([cap({ pos: { x: 0.1, y: 0 }, boxWidth: 0.6 })])
    expect(leaderTexts[0].boxWidth).toBe(1)
  })

  it('rebuilds contiguous indices per side and reports the moves', () => {
    const { leaderTexts, followerTexts, moves } = splitLeaderTexts([
      cap({ text: 'L0', pos: { x: 0.2, y: 0 } }),
      cap({ text: 'F0', pos: { x: 0.7, y: 0 } }),
      cap({ text: 'L1', pos: { x: 0.3, y: 0 } }),
      cap({ text: 'F1', pos: { x: 0.9, y: 0 } }),
    ])
    expect(leaderTexts.map((c) => c.text)).toEqual(['L0', 'L1'])
    expect(followerTexts.map((c) => c.text)).toEqual(['F0', 'F1'])
    expect(moves).toEqual([
      { side: 'leader', to: 0 },
      { side: 'follower', to: 0 },
      { side: 'leader', to: 1 },
      { side: 'follower', to: 1 },
    ])
  })

  it('carries translations with the moving caption', () => {
    const { followerTexts } = splitLeaderTexts([
      cap({ pos: { x: 0.8, y: 0.5 }, translations: { ja: 'こんにちは' } }),
    ])
    expect(followerTexts[0].translations).toEqual({ ja: 'こんにちは' })
  })
})

describe('migrateSpanSlides', () => {
  const pair = () => [
    slide({
      id: 'lead',
      index: 0,
      spanGroupId: 'g1',
      spanRole: 'leader',
      texts: [
        cap({ text: 'left', pos: { x: 0.25, y: 0.2 } }),
        cap({ text: 'right', pos: { x: 0.75, y: 0.8 } }),
      ],
      localeOverrides: {
        ja: { texts: { 0: { boxWidth: 0.4 }, 1: { pos: { x: 0.7, y: 0.9 } } } },
      },
    }),
    slide({
      id: 'foll',
      index: 1,
      spanGroupId: 'g1',
      spanRole: 'follower',
      texts: [cap({ text: 'dormant' })],
      localeOverrides: { ja: { texts: { 0: { boxWidth: 0.3 } } } },
    }),
  ]

  it('splits the pair: leader keeps left, follower gets right (replacing dormant texts)', () => {
    const [lead, foll] = migrateSpanSlides(pair())
    expect(lead.texts.map((c) => c.text)).toEqual(['left'])
    expect(foll.texts.map((c) => c.text)).toEqual(['right'])
    expect(foll.texts[0].pos!.x).toBeCloseTo(0.5)
  })

  it('re-keys locale text overrides through the move and renormalizes them', () => {
    const [lead, foll] = migrateSpanSlides(pair())
    expect(lead.localeOverrides!.ja.texts).toEqual({ 0: { boxWidth: 0.8 } })
    // The right caption's override followed it to follower index 0; the
    // follower's old override (for its dormant text) is gone.
    expect(foll.localeOverrides!.ja.texts![0].pos!.x).toBeCloseTo(0.4)
  })

  it('leaves broken groups and ungrouped slides untouched', () => {
    const lone = slide({ id: 'a', spanGroupId: 'orphan', spanRole: 'leader' })
    const plain = slide({ id: 'b', texts: [cap({ pos: { x: 0.9, y: 0 } })] })
    const out = migrateSpanSlides([lone, plain])
    expect(out[0]).toBe(lone)
    expect(out[1]).toBe(plain)
  })
})
