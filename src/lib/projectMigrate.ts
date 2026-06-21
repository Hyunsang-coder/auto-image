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
 * Bring a project authored under an older schema up to the current one, or
 * return null if it predates the earliest recoverable version.
 * - `< 4`: fixed `headline`/`subheadline` predate `texts[]` — unrecoverable.
 * - `< 5`: span captions move from wide-canvas normalization on the leader to
 *   per-slide ownership (`migrateSpanSlides`).
 */
export function migrateProject(project: Project, fromVersion: number): Project | null {
  if (fromVersion < 4) return null
  if (fromVersion < 5) return { ...project, slides: migrateSpanSlides(project.slides) }
  return project
}
