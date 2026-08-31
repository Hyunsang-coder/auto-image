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

/**
 * Every byte that leaves the webview for the filesystem goes through here:
 * project saves, the crash mirror's images, the PNG export.
 *
 * `arrayBuffer()` rather than `FileReader`. WebKit throttles a window it
 * considers backgrounded, and a `FileReader` in that state fails outright with
 * "The I/O read operation failed" — observed as a save that a live agent could
 * not complete while the app sat behind another window. `arrayBuffer()` does
 * not go through that path, and it also drops the data-URL prefix parsing.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // Chunked: `String.fromCharCode(...bytes)` blows the argument limit on
  // anything the size of a screenshot.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
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
