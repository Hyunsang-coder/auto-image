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

export function blobToBase64(blob: Blob): Promise<string> {
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

export interface BridgeStatus {
  /** A socket is bound and accepting. */
  running: boolean
  /** The user's switch, persisted across launches. */
  enabled: boolean
  socketPath: string
  /** Why nothing is listening while the switch is on. */
  error: string | null
}

/** Null in the web build — there is no bridge there to report on. */
export async function getBridgeStatus(): Promise<BridgeStatus | null> {
  if (!isTauri()) return null
  return await invoke<BridgeStatus>('bridge_status')
}

/** Flip the switch and get the resulting state back in one round trip. */
export async function setBridgeEnabled(enabled: boolean): Promise<BridgeStatus | null> {
  if (!isTauri()) return null
  return await invoke<BridgeStatus>('bridge_set_enabled', { enabled })
}

export interface UpdateCheck {
  current: string
  latest: string
  newer: boolean
  url: string
}

/** Ask GitHub whether a newer release exists. Null in the web build. */
export async function checkForUpdate(): Promise<UpdateCheck | null> {
  if (!isTauri()) return null
  return await invoke<UpdateCheck>('check_for_update')
}
