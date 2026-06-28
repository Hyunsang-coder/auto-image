import type { Background, Project } from '../types/project'
import { useProjectStore } from '../store/useProjectStore'
import { useLibraryStore } from '../store/useLibraryStore'
import { useCustomStore } from '../store/useCustomStore'
import { pruneOrphanImages } from './imageStore'

function bgImageKey(bg: Background): string | undefined {
  return bg.type === 'image' ? bg.imageKey : undefined
}

export function projectImageKeys(p: Project): string[] {
  return p.slides
    .flatMap((s) => [
      s.screenshot?.imageKey,
      ...Object.values(s.screenshot?.localeOverrides ?? {}).map((o) => o.imageKey),
      bgImageKey(s.background),
      ...(s.externalImages ?? []).map((img) => img.imageKey),
    ])
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
  const { presets, projectTemplates } = useCustomStore.getState()
  for (const pr of presets) {
    const k = bgImageKey(pr.background)
    if (k) keys.add(k)
  }
  for (const t of projectTemplates) {
    const tk = bgImageKey(t.themeBackground)
    if (tk) keys.add(tk)
    for (const sl of t.slides) {
      const k = bgImageKey(sl.background)
      if (k) keys.add(k)
      for (const img of sl.externalImages ?? []) keys.add(img.imageKey)
    }
  }
  return keys
}

/**
 * Reference-checked image cleanup: sweep every IndexedDB blob no longer
 * referenced by ANY store. Call this AFTER a state mutation (slide/screenshot
 * removal, project reset, load) instead of deleting specific keys directly —
 * a key shared with a saved project, preset, or sibling slide must survive.
 * Fire-and-forget; a failed sweep is harmless (re-runs on next startup).
 */
export function gcImages(): void {
  void pruneOrphanImages(allReferencedImageKeys())
}
