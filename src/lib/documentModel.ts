// Pure rules of the document model: what "the same as saved" means, what a
// project is called on disk, and what the recents list holds.
//
// Nothing here touches Tauri or the store, so every rule below is unit-tested
// rather than eyeballed in a running app. The IO that uses them is in
// `documentIO.ts`.

import type { Project } from '../types/project'

/** The one file extension. CLI, MCP and headless all already speak it. */
export const DOC_EXT = '.studio.zip'

/**
 * Content hash of a project, ignoring `updatedAt`.
 *
 * Dirty is a comparison, not a flag: a flag has to be cleared by every path
 * that could restore the saved state, and undo, the agent bridge and bulk edits
 * each found a way past that. Comparing hashes means undoing back to the last
 * save clears dirty on its own.
 *
 * `updatedAt` is excluded because it is a timestamp of the *edit*, not of the
 * content: every store write stamps a new one, so leaving it in would make
 * undo-to-saved report dirty forever — the exact case this design exists for.
 *
 * FNV-1a, ten lines, no dependency. Collisions would show as a save the app
 * thinks is unnecessary; at 32 bits over a project-sized string that is rare
 * enough to accept, and the mirror covers the loss either way.
 */
export function hashProject(project: Project): string {
  const content: Partial<Project> = { ...project }
  delete content.updatedAt
  const json = JSON.stringify(content)
  let hash = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    // ×16777619 in 32-bit arithmetic, spelled out because Math.imul is the
    // only way to keep the product from going through a double.
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Whether the in-memory project differs from what the file holds. */
export function isDirty(project: Project | null, savedHash: string | null): boolean {
  if (!project) return false
  if (!savedHash) return true
  return hashProject(project) !== savedHash
}

/** Last path segment, separator-agnostic. */
export function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

export function dirname(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut > 0 ? path.slice(0, cut) : '/'
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`
}

/**
 * The document's display name: the file name without the extension. Premise 5 —
 * the file name IS the document name, so this is what the header and the window
 * title show.
 */
export function docNameFromPath(path: string): string {
  const name = basename(path)
  if (name.toLowerCase().endsWith(DOC_EXT)) return name.slice(0, -DOC_EXT.length)
  return name.replace(/\.zip$/i, '')
}

/**
 * Force the double extension back on. macOS's save panel treats `.studio.zip`
 * as the single unknown extension "studio.zip" and does not always append it,
 * so whatever the panel returns is normalized here rather than trusted — the
 * name has to round-trip through the CLI, MCP and headless paths that all match
 * on `.studio.zip`.
 */
export function ensureDocExt(path: string): string {
  if (path.toLowerCase().endsWith(DOC_EXT)) return path
  return `${path.replace(/\.zip$/i, '')}${DOC_EXT}`
}

/**
 * Turn a project name into something that can be a file name: no separators, no
 * leading dot (which would hide it), no trailing dots or spaces (which macOS
 * strips anyway, silently changing the name the app then remembers).
 */
export function sanitizeFileBase(name: string, fallback: string): string {
  const cleaned = name
    // Separators, the colon Finder still renders as "/", and the control
    // characters a pasted name can smuggle in.
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, 60)
    .trim()
  return cleaned || fallback
}

/**
 * A base name that does not collide with anything already in the folder.
 * Finder's own convention: "Memento", then "Memento 2", "Memento 3".
 *
 * `taken` is the folder's file names, passed in rather than read here so the
 * rule stays pure — the one place that knows how a new project gets its name.
 */
export function uniqueDocBase(base: string, taken: Iterable<string>): string {
  const used = new Set<string>()
  for (const name of taken) used.add(name.toLowerCase())
  if (!used.has(`${base}${DOC_EXT}`.toLowerCase())) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}`
    if (!used.has(`${candidate}${DOC_EXT}`.toLowerCase())) return candidate
  }
  return `${base} ${Date.now()}`
}

export interface RecentEntry {
  path: string
  name: string
  /** ISO timestamp of the last open or save. */
  lastOpened: string
  slideCount: number
  /** Base64 PNG of slide 1, ~320px wide. Absent until the first save. */
  preview?: string
  /** Set when the file was not on disk the last time the list was drawn. */
  missing?: boolean
}

export const RECENTS_LIMIT = 10

/**
 * Put `entry` at the front, deduped by path, capped at `limit`.
 *
 * The preview is carried over when the new entry has none: a bare open should
 * not blank the thumbnail a previous save produced.
 */
export function addRecent(
  list: RecentEntry[],
  entry: RecentEntry,
  limit = RECENTS_LIMIT,
): RecentEntry[] {
  const previous = list.find((r) => r.path === entry.path)
  const merged: RecentEntry = {
    ...entry,
    preview: entry.preview ?? previous?.preview,
    missing: undefined,
  }
  return [merged, ...list.filter((r) => r.path !== entry.path)].slice(0, limit)
}

export function dropRecent(list: RecentEntry[], path: string): RecentEntry[] {
  return list.filter((r) => r.path !== path)
}

/** Flag the entries whose file is gone, without removing them — the user may
 *  have the disk unmounted, and a list that silently shortens is worse than one
 *  that says why. */
export function markMissing(list: RecentEntry[], present: (path: string) => boolean): RecentEntry[] {
  return list.map((r) => (present(r.path) ? { ...r, missing: undefined } : { ...r, missing: true }))
}

/**
 * Read the recents file defensively: it is a plain JSON file in the config
 * directory, so it can be hand-edited, half-written by an older build, or
 * absent. Anything unrecognisable degrades to an empty list rather than
 * stopping the app from opening.
 */
export function parseRecents(json: string | null | undefined): RecentEntry[] {
  if (!json) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: RecentEntry[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Partial<RecentEntry>
    if (typeof entry.path !== 'string' || !entry.path) continue
    out.push({
      path: entry.path,
      name: typeof entry.name === 'string' && entry.name ? entry.name : docNameFromPath(entry.path),
      lastOpened: typeof entry.lastOpened === 'string' ? entry.lastOpened : '',
      slideCount: typeof entry.slideCount === 'number' ? entry.slideCount : 0,
      preview: typeof entry.preview === 'string' ? entry.preview : undefined,
      missing: entry.missing === true ? true : undefined,
    })
  }
  return out.slice(0, RECENTS_LIMIT)
}

/**
 * A file-name-safe timestamp for a rotated backup. ISO order so a plain
 * lexicographic sort is chronological (which is how the Rust side prunes), with
 * the colons out because they are not allowed in a path segment.
 */
export function backupStamp(at: Date): string {
  return at.toISOString().replace(/[:.]/g, '-').replace(/-\d+Z$/, 'Z')
}
