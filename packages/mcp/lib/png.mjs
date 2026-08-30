// Turning a full-resolution export into something an agent can actually look at
// inside a tool result. Shared by the published package (live_view) and the
// repo's full server (view_output).

import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const tmp = () => mkdtemp(join(tmpdir(), 'studio-mcp-'))

/** Exit code only — the one thing the downscale below needs to know. */
function exitCode(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args)
    child.on('error', () => resolve(127))
    child.on('close', (code) => resolve(code ?? 0))
  })
}

/**
 * Downscale a PNG for inline viewing. `sips` ships with macOS and is instant;
 * elsewhere fall back to the original bytes when they're small enough.
 */
export async function pngForViewing(path, maxDim) {
  const dest = join(await tmp(), 'view.png')
  const code = await exitCode('sips', ['-Z', String(maxDim), path, '--out', dest])
  const src = code === 0 ? dest : path
  const buf = await readFile(src)
  if (code !== 0 && buf.length > 2_000_000) {
    throw new Error(`${path} is ${(buf.length / 1e6).toFixed(1)}MB and sips is unavailable to downscale it`)
  }
  return buf
}
