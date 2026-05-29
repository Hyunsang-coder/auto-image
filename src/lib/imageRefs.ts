import type { Background, Project } from '../types/project'
import { useProjectStore } from '../store/useProjectStore'
import { useLibraryStore } from '../store/useLibraryStore'
import { useCustomStore } from '../store/useCustomStore'

function bgImageKey(bg: Background): string | undefined {
  return bg.type === 'image' ? bg.imageKey : undefined
}

function projectImageKeys(p: Project): string[] {
  return p.slides
    .flatMap((s) => [s.screenshot?.imageKey, bgImageKey(s.background)])
    .filter((k): k is string => !!k)
}

/**
 * Every IndexedDB image key still referenced anywhere — the active project,
 * any saved project in the library, and custom presets/templates. Used both as
 * the keep-set for the startup orphan sweep and after deletions, so saving
 * multiple projects (or image-backed presets) doesn't get its blobs pruned.
 */
export function allReferencedImageKeys(): Set<string> {
  const keys = new Set<string>()
  const active = useProjectStore.getState().project
  if (active) projectImageKeys(active).forEach((k) => keys.add(k))
  for (const p of useLibraryStore.getState().projects) {
    projectImageKeys(p).forEach((k) => keys.add(k))
  }
  const { presets, templates } = useCustomStore.getState()
  for (const pr of presets) {
    const k = bgImageKey(pr.background)
    if (k) keys.add(k)
  }
  for (const t of templates) {
    const k = bgImageKey(t.background)
    if (k) keys.add(k)
  }
  return keys
}
