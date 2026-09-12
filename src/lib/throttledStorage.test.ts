import { afterEach, describe, it, expect, vi } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { throttledStorage } from './throttledStorage'

function memoryStorage(): StateStorage & { writes: Array<[string, string]> } {
  const map = new Map<string, string>()
  const writes: Array<[string, string]> = []
  return {
    writes,
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      writes.push([name, value])
      map.set(name, value)
    },
    removeItem: (name) => {
      map.delete(name)
    },
  }
}

describe('throttledStorage [H-V9]', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('[H-V9] coalesces a burst of writes into one, keeping the last value', () => {
    vi.useFakeTimers()
    const inner = memoryStorage()
    const storage = throttledStorage(inner, 500)
    try {
      storage.setItem('k', 'v1')
      storage.setItem('k', 'v2')
      storage.setItem('k', 'v3')
      expect(inner.writes).toHaveLength(0)
      vi.advanceTimersByTime(500)
      expect(inner.writes).toHaveLength(1)
      expect(inner.writes[0]).toEqual(['k', 'v3'])
      expect(inner.getItem('k')).toBe('v3')
    } finally {
      storage.dispose()
    }
  })

  it('[H-V9] flush() forces the trailing write out immediately', () => {
    vi.useFakeTimers()
    const inner = memoryStorage()
    const storage = throttledStorage(inner, 500)
    try {
      storage.setItem('k', 'v1')
      storage.flush()
      expect(inner.writes).toEqual([['k', 'v1']])
      vi.advanceTimersByTime(1000)
      expect(inner.writes).toHaveLength(1)
    } finally {
      storage.dispose()
    }
  })

  it('[H-V9] delegates reads and removals without delay', () => {
    vi.useFakeTimers()
    const inner = memoryStorage()
    inner.setItem('k', 'v0')
    const storage = throttledStorage(inner, 500)
    try {
      expect(storage.getItem('k')).toBe('v0')
      storage.removeItem('k')
      expect(inner.getItem('k')).toBeNull()
    } finally {
      storage.dispose()
    }
  })
})
