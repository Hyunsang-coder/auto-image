import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

import { isTauri, writeFileToDir, keychainStorage, sanitizePathSegment } from './tauri'

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

describe('keychainStorage', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('getItem reads via keychain_get', () => {
    keychainStorage.getItem('auto-image:api-keys')
    expect(invoke).toHaveBeenCalledWith('keychain_get', { name: 'auto-image:api-keys' })
  })

  it('coalesces a burst of setItem into a single trailing write', () => {
    keychainStorage.setItem('k', 'a')
    keychainStorage.setItem('k', 'ab')
    keychainStorage.setItem('k', 'abc')
    // Nothing written until the debounce window elapses.
    expect(invoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('keychain_set', { name: 'k', value: 'abc' })
  })

  it('removeItem cancels a pending write and deletes', () => {
    keychainStorage.setItem('k', 'pending')
    keychainStorage.removeItem('k')
    vi.advanceTimersByTime(400)
    // The pending keychain_set was cancelled; only the delete ran.
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('keychain_delete', { name: 'k' })
  })
})
