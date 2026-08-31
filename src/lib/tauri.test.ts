import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

import {
  blobToBase64,
  isTauri,
  writeFileToDir,
  sanitizePathSegment,
  getBridgeStatus,
  setBridgeEnabled,
} from './tauri'

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(null)
})

describe('isTauri', () => {
  it('is false in a plain browser/jsdom context', () => {
    expect(isTauri()).toBe(false)
  })

  it('is true when the Tauri internals global is present', () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    try {
      expect(isTauri()).toBe(true)
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    }
  })
})

describe('sanitizePathSegment', () => {
  it('keeps a normal name intact', () => {
    expect(sanitizePathSegment('My App')).toBe('My App')
  })

  it('strips path separators so the name stays one segment', () => {
    expect(sanitizePathSegment('a/b\\c')).toBe('a-b-c')
    expect(sanitizePathSegment('../../etc')).toBe('..-..-etc') // no surviving separators → cannot traverse
  })

  it('collapses pure-dot names and empties to a fallback', () => {
    expect(sanitizePathSegment('..')).toBe('export')
    expect(sanitizePathSegment('.')).toBe('export')
    expect(sanitizePathSegment('   ')).toBe('export')
  })
})

describe('writeFileToDir', () => {
  it('base64-encodes string data and defaults executable to false', async () => {
    await writeFileToDir('/out', 'a/b.txt', 'hello')
    expect(invoke).toHaveBeenCalledWith('write_file', {
      dir: '/out',
      path: 'a/b.txt',
      dataBase64: 'aGVsbG8=', // base64("hello")
      executable: false,
    })
  })

  it('passes the executable flag through', async () => {
    await writeFileToDir('/out', 'upload.sh', 'hi', true)
    expect(invoke).toHaveBeenCalledWith('write_file', {
      dir: '/out',
      path: 'upload.sh',
      dataBase64: 'aGk=', // base64("hi")
      executable: true,
    })
  })

  it('base64-encodes Blob data', async () => {
    await writeFileToDir('/out', 'x.png', new Blob(['hi']))
    expect(invoke).toHaveBeenCalledWith(
      'write_file',
      expect.objectContaining({ dir: '/out', path: 'x.png', dataBase64: 'aGk=', executable: false }),
    )
  })
})

describe('blobToBase64', () => {
  it('round-trips arbitrary bytes, not just text', async () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i))
    const encoded = await blobToBase64(new Blob([bytes]))
    expect(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual(bytes)
  })

  // A screenshot is megabytes; spreading that into String.fromCharCode in one
  // go throws RangeError, so the chunking is load-bearing rather than tidy.
  it('handles a payload far past the argument limit', async () => {
    const big = new Uint8Array(300_000).fill(7)
    const encoded = await blobToBase64(new Blob([big]))
    expect(atob(encoded).length).toBe(big.length)
  })

  it('encodes an empty blob as an empty string', async () => {
    expect(await blobToBase64(new Blob([]))).toBe('')
  })
})

describe('bridge status', () => {
  function inTauri<T>(run: () => T): T {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    try {
      return run()
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    }
  }

  it('reports nothing in the web build instead of invoking', async () => {
    expect(await getBridgeStatus()).toBeNull()
    expect(await setBridgeEnabled(false)).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reads the status from Rust', async () => {
    const status = { running: true, enabled: true, socketPath: '/tmp/a.sock', error: null }
    invoke.mockResolvedValue(status)
    expect(await inTauri(() => getBridgeStatus())).toEqual(status)
    expect(invoke).toHaveBeenCalledWith('bridge_status')
  })

  it('passes the switch through and returns the resulting status', async () => {
    const status = { running: false, enabled: false, socketPath: '/tmp/a.sock', error: null }
    invoke.mockResolvedValue(status)
    expect(await inTauri(() => setBridgeEnabled(false))).toEqual(status)
    expect(invoke).toHaveBeenCalledWith('bridge_set_enabled', { enabled: false })
  })
})
