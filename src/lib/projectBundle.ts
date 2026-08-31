import JSZip from 'jszip'
import type { Project } from '../types/project'
import { loadImageBlob, putImage } from './imageStore'
import { projectImageKeys } from './imageRefs'
import { PROJECT_SCHEMA_VERSION, migrateProject } from './projectMigrate'

const BUNDLE_VERSION = 1
const MANIFEST = 'project.json'

interface ProjectBundle {
  /** Envelope format version (the zip layout), independent of the project schema. */
  bundleVersion: number
  /** Project-schema version the `project` was written under (absent in v1
   *  bundles, predating per-slide span texts → treated as schema v4). */
  schemaVersion?: number
  project: Project
  images: Record<string, string> // imageKey -> zip path
}

export function extFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/webp') return 'webp'
  return 'bin'
}

export interface BundleExport {
  blob: Blob
  /**
   * References whose blob was gone from IndexedDB, so the zip could not carry
   * them. Reported rather than swallowed: this is the one shape in which a save
   * that says it succeeded still loses pixels, and only the caller can decide
   * whether to keep the file or go find the missing images first.
   */
  missingImageKeys: string[]
}

/**
 * Pack the full project + its IndexedDB image blobs into one portable .zip so
 * work can be saved, moved, and reopened for later tweaking. The project JSON is
 * self-contained except for image blobs (referenced by `imageKey`), which ride
 * along under `images/`. Same image surface as the GC keep-set (`projectImageKeys`).
 */
export async function exportProjectBundle(project: Project): Promise<BundleExport> {
  const zip = new JSZip()
  const images: Record<string, string> = {}
  const missingImageKeys: string[] = []
  for (const key of [...new Set(projectImageKeys(project))]) {
    const blob = await loadImageBlob(key)
    if (!blob) {
      // The pointer stays in the JSON so reopening elsewhere degrades the same
      // way it does here, rather than silently dropping the reference too.
      missingImageKeys.push(key)
      continue
    }
    const path = `images/${key.replace('img:', '')}.${extFor(blob.type)}`
    zip.file(path, blob)
    images[key] = path
  }
  const manifest: ProjectBundle = {
    bundleVersion: BUNDLE_VERSION,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project,
    images,
  }
  zip.file(MANIFEST, JSON.stringify(manifest, null, 2))
  return { blob: await zip.generateAsync({ type: 'blob' }), missingImageKeys }
}

/**
 * Unpack a bundle: restore image blobs to IndexedDB under their original keys
 * (UUIDs, so no remap needed) and return the uncommitted project. The caller
 * commits via `loadProject`; blobs written for a load the user declines are
 * swept by `gcImages`. Throws on a malformed or non-bundle zip.
 */
export async function importProjectBundle(file: Blob): Promise<Project> {
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file(MANIFEST)
  if (!manifestFile) throw new Error('not a project bundle: missing project.json')
  const manifest = JSON.parse(await manifestFile.async('string')) as ProjectBundle
  if (manifest.bundleVersion !== BUNDLE_VERSION || !manifest.project) {
    throw new Error('unsupported or malformed project bundle')
  }
  // Bring an older-schema bundle up to the current schema before it's loaded —
  // loadProject doesn't run the persist migrations. A v1 bundle predates the
  // schemaVersion stamp and the per-slide span split, so it's schema v4.
  const project = migrateProject(manifest.project, manifest.schemaVersion ?? 4)
  if (!project) throw new Error('project bundle is too old to open')
  for (const [key, path] of Object.entries(manifest.images ?? {})) {
    const entry = zip.file(path)
    if (!entry) continue
    await putImage(key, await entry.async('blob'))
  }
  return project
}
