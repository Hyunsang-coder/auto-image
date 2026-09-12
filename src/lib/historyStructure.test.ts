import { describe, it, expect } from 'vitest'
import { structuralSignature, spanStructuralSignature } from './historyStructure'
import { makeSlide } from '../constants/defaults'

describe('structuralSignature [H-V7]', () => {
  it('[H-V7] is stable across content edits (drag/retype must keep history)', () => {
    const a = makeSlide(0)
    const moved = { ...a, texts: [{ ...a.texts[0], text: 'changed', pos: { x: 0.1, y: 0.2 } }] }
    expect(structuralSignature(moved)).toBe(structuralSignature(a))
  })

  it('[H-V7] changes when a caption is added or removed', () => {
    const a = makeSlide(0)
    const added = { ...a, texts: [...a.texts, { ...a.texts[0] }] }
    const removed = { ...a, texts: [] }
    expect(structuralSignature(added)).not.toBe(structuralSignature(a))
    expect(structuralSignature(removed)).not.toBe(structuralSignature(a))
  })

  it('[H-V7] changes when a badge/ornament/shape/image/highlight id set changes', () => {
    const a = makeSlide(0)
    const badge = { id: 'b1', text: 'x', translations: {}, style: {} as never, top: 0.1 }
    expect(structuralSignature({ ...a, badges: [badge] })).not.toBe(structuralSignature(a))
    // Same length but different identity (preset swap) also invalidates.
    const rebased = { ...a, badges: [{ ...badge, id: 'b2' }] }
    expect(structuralSignature(rebased)).not.toBe(structuralSignature({ ...a, badges: [badge] }))
  })

  it('[H-V7] span signature covers both halves', () => {
    const leader = { ...makeSlide(0), spanGroupId: 'g', spanRole: 'leader' as const }
    const follower = { ...makeSlide(1), spanGroupId: 'g', spanRole: 'follower' as const }
    const base = spanStructuralSignature(leader, follower)
    const followerChanged = { ...follower, texts: [] }
    expect(spanStructuralSignature(leader, followerChanged)).not.toBe(base)
    expect(spanStructuralSignature(leader)).not.toBe(base)
  })
})
