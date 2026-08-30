// Project-schema migrations, extracted from the persist `migrate` closure so the
// exact same transforms run on any path that revives a project from JSON — not
// just localStorage rehydration but also a saved `.studio.zip` bundle (which
// stamps the schema version it was written under). Pure: no store/React/idb.

import type { Project } from '../types/project'
import { migrateSpanSlides } from './spanTextMigration'

/** The schema version current projects are written under. Bumped in lockstep
 *  with the persist store `version` and the bundle envelope's `schemaVersion`. */
export const PROJECT_SCHEMA_VERSION = 5

/**
 * A stamp can lie. Persist writes the *current* version on every save, so a
 * project revived through a path that skipped migration (the library store used
 * to be one) gets stamped current while its slides still carry the pre-v4 fixed
 * `headline`/`subheadline` instead of `texts[]`. Every predicate that walks
 * `slide.texts` throws on those — during App's render that is a white screen the
 * user cannot get out of, because the bad value reloads with them. So trust the
 * shape, not the number.
 */
export function isRevivableProject(project: Project): boolean {
  return project.slides.every((slide) => Array.isArray(slide.texts))
}

/**
 * Bring a project authored under an older schema up to the current one, or
 * return null if it predates the earliest recoverable version.
 * - `< 4`: fixed `headline`/`subheadline` predate `texts[]` — unrecoverable.
 * - `< 5`: span captions move from wide-canvas normalization on the leader to
 *   per-slide ownership (`migrateSpanSlides`).
 */
export function migrateProject(project: Project, fromVersion: number): Project | null {
  if (!isRevivableProject(project)) return null
  if (fromVersion < 4) return null
  if (fromVersion < 5) return { ...project, slides: migrateSpanSlides(project.slides) }
  return project
}

/**
 * Library snapshots are whole Projects, so they need the same transforms as
 * rehydration and bundle-open. Snapshots written before the library store
 * recorded a version report `fromVersion === 0`; their real schema is
 * unknowable, and v4→v5 is not idempotent (it re-homes right-half span captions
 * by position), so re-running it on already-current data would move captions to
 * the wrong slide. Those are passed through and stamped instead.
 */
export function migrateLibraryProjects(projects: Project[], fromVersion: number): Project[] {
  const from = fromVersion === 0 ? PROJECT_SCHEMA_VERSION : fromVersion
  return projects
    .map((p) => migrateProject(p, from))
    .filter((p): p is Project => p !== null)
}
