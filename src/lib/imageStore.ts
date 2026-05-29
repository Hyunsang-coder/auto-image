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
  const key = await saveImage(file)
  const dims = await readImageDimensions(file)
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
