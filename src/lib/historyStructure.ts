import type { Slide } from '../types/project'

// Canvas undo snapshots are raw object states addressed by index/id. A store
// edit that changes the *structure* (caption add/remove, badge/ornament/shape/
// image/highlight add/remove/re-id) makes every older snapshot stale: syncing
// one back would write text to the wrong index or resurrect deleted objects.
// Content edits (drag, retype, recolor) keep the structure and must NOT clear
// history. This signature is the cheap comparator the reseed effect uses to
// tell the two apart.
function idsOf(arr: Array<{ id: string }> | undefined): string {
  return (arr ?? []).map((o) => o.id).join(',')
}

export function structuralSignature(slide: Slide): string {
  return [
    slide.texts.length,
    idsOf(slide.badges),
    idsOf(slide.ornaments),
    idsOf(slide.shapes),
    idsOf(slide.externalImages),
    idsOf(slide.highlights),
  ].join('|')
}

/** Leader + follower: either half restructuring invalidates the span snapshots. */
export function spanStructuralSignature(leader: Slide, follower?: Slide | null): string {
  return follower
    ? `${structuralSignature(leader)}#${structuralSignature(follower)}`
    : structuralSignature(leader)
}
