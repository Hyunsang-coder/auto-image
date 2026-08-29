import { describe, it, expect } from 'vitest'
import { migrateLibraryProjects, migrateProject } from './projectMigrate'
import type { Caption, Project, Slide } from '../types/project'

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
  return { id: 'x', index: 0, texts: [], badges: [], highlights: [], ...over } as unknown as Slide
}

function project(slides: Slide[]): Project {
  return { id: 'p', name: 'P', slides } as unknown as Project
}

// A v4 span pair: the leader owns all captions in wide-canvas coords, including
// a right-half one that v5 moves onto the follower.
const v4Pair = () =>
  project([
    slide({
      id: 'lead',
      index: 0,
      spanGroupId: 'g1',
      spanRole: 'leader',
      texts: [cap({ text: 'left', pos: { x: 0.25, y: 0.2 } }), cap({ text: 'right', pos: { x: 0.75, y: 0.8 } })],
    }),
    slide({ id: 'foll', index: 1, spanGroupId: 'g1', spanRole: 'follower', texts: [cap({ text: 'dormant' })] }),
  ])

describe('migrateProject', () => {
  it('drops a pre-v4 project (unrecoverable schema)', () => {
    expect(migrateProject(v4Pair(), 3)).toBeNull()
  })

  it('splits v4 span captions onto the follower (v4→v5)', () => {
    const migrated = migrateProject(v4Pair(), 4)!
    const [lead, foll] = migrated.slides
    expect(lead.texts.map((c) => c.text)).toEqual(['left'])
    expect(foll.texts.map((c) => c.text)).toEqual(['right'])
    expect(foll.texts[0].pos!.x).toBeCloseTo(0.5)
  })

  it('returns a current-schema project unchanged (same reference)', () => {
    const p = v4Pair()
    expect(migrateProject(p, 5)).toBe(p)
  })
})

describe('migrateLibraryProjects', () => {
  it('runs the v4→v5 span split on snapshots that recorded their version', () => {
    const [p] = migrateLibraryProjects([v4Pair()], 4)
    expect(p.slides[0].texts.map((c) => c.text)).toEqual(['left'])
    expect(p.slides[1].texts.map((c) => c.text)).toEqual(['right'])
  })

  it('passes unversioned snapshots through — v4→v5 would re-home their captions', () => {
    // Snapshots saved before the store recorded a version report 0. Running the
    // non-idempotent span split on already-current data would move a leader's
    // legitimate right-of-page caption onto the follower.
    const current = project([
      slide({ id: 'lead', index: 0, spanGroupId: 'g1', spanRole: 'leader', texts: [cap({ text: 'right-of-page', pos: { x: 0.75, y: 0.2 } })] }),
      slide({ id: 'foll', index: 1, spanGroupId: 'g1', spanRole: 'follower', texts: [cap({ text: 'own' })] }),
    ])
    const [p] = migrateLibraryProjects([current], 0)
    expect(p.slides[0].texts.map((c) => c.text)).toEqual(['right-of-page'])
    expect(p.slides[1].texts.map((c) => c.text)).toEqual(['own'])
  })

  it('drops unrecoverable snapshots instead of failing the whole library', () => {
    expect(migrateLibraryProjects([v4Pair(), v4Pair()], 3)).toEqual([])
  })
})
