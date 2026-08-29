// Client for the desktop app's agent bridge: newline-delimited JSON over a unix
// domain socket. The app half is src-tauri/src/bridge.rs; rationale for the
// transport choice is in docs/adr.md.

import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Tauri's app_config_dir() on macOS, for the identifier in tauri.conf.json.
export const BRIDGE_SOCKET = join(
  homedir(),
  'Library',
  'Application Support',
  'com.hyunsang.screenshotstudio',
  'agent-bridge.sock',
)

const NOT_RUNNING =
  'Screenshot Studio is not running. Open the desktop app (npm run tauri:dev, or the built .app), ' +
  'or use the file-based tools (inspect_bundle / patch_bundle / render) instead.'

/**
 * Send one call and resolve its response envelope: `{ ok, result }` on success,
 * `{ ok: false, error }` when the app refused. Rejects only when the app could
 * not be reached at all.
 */
export function callBridge(method, params = {}, { timeoutMs = 130_000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ path: BRIDGE_SOCKET })
    let buffer = ''
    let settled = false

    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      fn(arg)
    }

    // Slightly longer than the app's own 120s call timeout, so a wedged render
    // surfaces as the app's specific error rather than a blank socket timeout.
    const timer = setTimeout(() => finish(reject, new Error(`bridge call "${method}" timed out`)), timeoutMs)

    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, method, params })}\n`))

    socket.on('data', (chunk) => {
      buffer += chunk
      const nl = buffer.indexOf('\n')
      if (nl < 0) return // a full-resolution PNG arrives over several chunks
      try {
        finish(resolve, JSON.parse(buffer.slice(0, nl)))
      } catch (e) {
        finish(reject, new Error(`malformed bridge response: ${e.message}`))
      }
    })

    socket.on('error', (e) => {
      const notRunning = e.code === 'ENOENT' || e.code === 'ECONNREFUSED'
      finish(reject, new Error(notRunning ? NOT_RUNNING : `bridge socket error: ${e.message}`))
    })

    socket.on('end', () => finish(reject, new Error('the app closed the bridge connection')))
  })
}
