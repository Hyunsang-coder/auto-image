import { del, get, keys, set } from 'idb-keyval'

const PREFIX = 'img:'

export async function saveImage(blob: Blob): Promise<string> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `img-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const key = `${PREFIX}${id}`
  await set(key, blob)
  return key
}

export async function loadImageBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key)
}

export async function loadImageObjectUrl(
  key: string,
): Promise<string | undefined> {
  const blob = await loadImageBlob(key)
  return blob ? URL.createObjectURL(blob) : undefined
}

export type ImageUrlResolver = (key: string) => Promise<string | undefined>

export interface ImageUrlCache {
  get: ImageUrlResolver
  revokeAll: () => void
}

/**
 * A scoped object-URL cache. Each distinct image key maps to a single
 * `blob:` URL that is reused for the cache's lifetime, so re-rendering the
 * same slide many times allocates one URL per image instead of one per
 * render (the canvas editor re-renders on every edit). Call `revokeAll` when
 * the scope ends — slide switch in the editor, after dispose in export — to
 * free the underlying blobs. Reusing one stable URL also keeps undo/redo
 * snapshots (which embed the image `src`) valid for the slide's lifetime.
 */
export function createImageUrlCache(): ImageUrlCache {
  const cache = new Map<string, string>()
  return {
    async get(key) {
      const cached = cache.get(key)
      if (cached) return cached
      const url = await loadImageObjectUrl(key)
      if (url) cache.set(key, url)
      return url
    },
    revokeAll() {
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    },
  }
}

export async function deleteImage(key: string): Promise<void> {
  // Callers fire-and-forget this; a failed delete is non-critical (the blob is
  // already unreferenced and pruneOrphanImages will sweep it on next startup),
  // so swallow rather than surface an unhandled rejection.
  try {
    await del(key)
  } catch {
    /* ignore */
  }
}

async function listImageKeys(): Promise<string[]> {
  const all = await keys()
  return all.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(PREFIX),
  )
}

/**
 * Delete every stored image blob not present in `referenced`. Sweeps blobs
 * orphaned by interrupted operations (a crash between saveImage and the
 * localStorage pointer write, an aborted span unlink, etc.). Returns the
 * number of blobs removed. Caller must pass the full set of keys still in use.
 */
export async function pruneOrphanImages(
  referenced: Iterable<string>,
): Promise<number> {
  const keep = new Set(referenced)
  const stored = await listImageKeys()
  const orphans = stored.filter((k) => !keep.has(k))
  await Promise.all(orphans.map((k) => deleteImage(k)))
  return orphans.length
}

export async function fileToImageKey(file: File): Promise<{
  key: string
  width: number
  height: number
}> {
  // Decode first so an undecodable file (HEIC, corrupt, mis-typed) rejects
  // before we persist anything — otherwise a failed upload would leave an
  // orphan blob in IndexedDB.
  const dims = await readImageDimensions(file)
  const key = await saveImage(file)
  return { key, ...dims }
}

function readImageDimensions(
  file: Blob,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      URL.revokeObjectURL(url)
      resolve({ width: w, height: h })
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}
