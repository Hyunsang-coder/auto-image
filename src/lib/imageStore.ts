import { del, get, set } from 'idb-keyval'

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
  await del(key)
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
