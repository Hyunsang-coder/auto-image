import JSZip from 'jszip'
import type { Project } from '../types/project'
import { loadImageBlob, putImage } from './imageStore'
import { projectImageKeys } from './imageRefs'

const BUNDLE_VERSION = 1
const MANIFEST = 'project.json'

interface ProjectBundle {
  bundleVersion: number
  project: Project
  images: Record<string, string> // imageKey -> zip path
}

function extFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/webp') return 'webp'
  return 'bin'
}

/**
 * Pack the full project + its IndexedDB image blobs into one portable .zip so
 * work can be saved, moved, and reopened for later tweaking. The project JSON is
 * self-contained except for image blobs (referenced by `imageKey`), which ride
 * along under `images/`. Same image surface as the GC keep-set (`projectImageKeys`).
 */
export async function exportProjectBundle(project: Project): Promise<Blob> {
  const zip = new JSZip()
  const images: Record<string, string> = {}
  for (const key of [...new Set(projectImageKeys(project))]) {
    const blob = await loadImageBlob(key)
    if (!blob) continue // pointer stays in JSON; an already-missing blob just won't resolve
    const path = `images/${key.replace('img:', '')}.${extFor(blob.type)}`
    zip.file(path, blob)
    images[key] = path
  }
  const manifest: ProjectBundle = { bundleVersion: BUNDLE_VERSION, project, images }
  zip.file(MANIFEST, JSON.stringify(manifest, null, 2))
  return zip.generateAsync({ type: 'blob' })
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
  for (const [key, path] of Object.entries(manifest.images ?? {})) {
    const entry = zip.file(path)
    if (!entry) continue
    await putImage(key, await entry.async('blob'))
  }
  return manifest.project
}
