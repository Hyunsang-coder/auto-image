import { invoke } from '@tauri-apps/api/core'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Write one file under `dir` via the native Rust command (creates parent dirs). */
export async function writeFileToDir(dir: string, path: string, data: Blob | string): Promise<void> {
  const dataBase64 =
    typeof data === 'string'
      ? btoa(unescape(encodeURIComponent(data)))
      : await blobToBase64(data)
  await invoke('write_file', { dir, path, dataBase64 })
}
