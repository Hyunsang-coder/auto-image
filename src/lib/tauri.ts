import { invoke } from '@tauri-apps/api/core'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Collapse a string into a single safe path segment: no path separators and not
 * a pure-dot name, so it can never escape its parent directory when used as
 * `${dir}/${segment}`. Guards the export folder name against stray `/` or `..`.
 */
export function sanitizePathSegment(name: string): string {
  const cleaned = name.replace(/[/\\]/g, '-').replace(/^\.+$/, '').trim()
  return cleaned || 'export'
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
export async function writeFileToDir(
  dir: string,
  path: string,
  data: Blob | string,
  executable = false,
): Promise<void> {
  const dataBase64 =
    typeof data === 'string'
      ? btoa(unescape(encodeURIComponent(data)))
      : await blobToBase64(data)
  await invoke('write_file', { dir, path, dataBase64, executable })
}

// Persist fires setItem on every keystroke; a Keychain write is heavier than
// localStorage, so coalesce a burst into a single trailing write. Only one item
// name is ever in play (the api-keys blob), so a single pending slot suffices.
let pendingWrite: { name: string; value: string } | undefined
let writeTimer: ReturnType<typeof setTimeout> | undefined
function flushWrite() {
  writeTimer = undefined
  if (pendingWrite) {
    const w = pendingWrite
    pendingWrite = undefined
    void invoke('keychain_set', w)
  }
}

/** zustand-persist storage backed by the macOS Keychain (one entry per item name). */
export const keychainStorage = {
  getItem: (name: string) => invoke<string | null>('keychain_get', { name }),
  setItem: (name: string, value: string) => {
    pendingWrite = { name, value }
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrite, 400)
    return Promise.resolve()
  },
  removeItem: (name: string) => {
    pendingWrite = undefined
    if (writeTimer) clearTimeout(writeTimer)
    return invoke<void>('keychain_delete', { name })
  },
}
