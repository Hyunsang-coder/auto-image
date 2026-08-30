import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  STORAGE_ERROR_EVENT,
  STORAGE_PRESSURE_EVENT,
  resetStorageTracking,
  safeLocalStorage,
  storageUsage,
} from './safeStorage'

const KEY = 'auto-image:project'
const OTHER = 'auto-image:library'
// 80% of the 2.5M-character budget.
const WARN_CHARS = 2_000_000

function events(): { over: boolean; ratio: number }[] {
  const seen: { over: boolean; ratio: number }[] = []
  window.addEventListener(STORAGE_PRESSURE_EVENT, (e) => {
    seen.push((e as CustomEvent).detail)
  })
  return seen
}

beforeEach(() => {
  localStorage.clear()
  resetStorageTracking()
})
afterEach(() => {
  localStorage.clear()
  resetStorageTracking()
})

describe('safeLocalStorage — storage pressure', () => {
  it('stays quiet well under the budget', () => {
    const seen = events()
    safeLocalStorage.setItem(KEY, 'x'.repeat(1000))
    expect(seen).toEqual([])
    expect(storageUsage()).toBeLessThan(0.01)
  })

  it('announces once when the namespace crosses the threshold, not on every write', () => {
    const seen = events()
    safeLocalStorage.setItem(KEY, 'x'.repeat(WARN_CHARS))
    expect(seen).toHaveLength(1)
    expect(seen[0].over).toBe(true)
    expect(seen[0].ratio).toBeGreaterThanOrEqual(0.8)

    // Persist writes on every edit; re-announcing on each would rerender the
    // banner continuously.
    safeLocalStorage.setItem(KEY, 'x'.repeat(WARN_CHARS + 10))
    expect(seen).toHaveLength(1)
  })

  it('sums every key in the namespace, so saved projects count too', () => {
    const seen = events()
    const half = 'x'.repeat(WARN_CHARS / 2)
    safeLocalStorage.setItem(KEY, half)
    expect(seen).toHaveLength(0)
    safeLocalStorage.setItem(OTHER, half)
    expect(seen).toHaveLength(1)
    expect(seen[0].over).toBe(true)
  })

  it('announces the way back down when space is freed', () => {
    const seen = events()
    safeLocalStorage.setItem(KEY, 'x'.repeat(WARN_CHARS))
    safeLocalStorage.setItem(KEY, 'x'.repeat(10))
    expect(seen.map((e) => e.over)).toEqual([true, false])

    safeLocalStorage.setItem(OTHER, 'x'.repeat(WARN_CHARS))
    safeLocalStorage.removeItem(OTHER)
    expect(seen.map((e) => e.over)).toEqual([true, false, true, false])
  })

  it('ignores keys outside the app namespace', () => {
    localStorage.setItem('someone-elses-key', 'x'.repeat(WARN_CHARS))
    const seen = events()
    safeLocalStorage.setItem(KEY, 'x'.repeat(100))
    expect(seen).toEqual([])
  })

  it('reports a failed write instead of throwing', () => {
    const errors: unknown[] = []
    window.addEventListener(STORAGE_ERROR_EVENT, (e) => errors.push((e as CustomEvent).detail))
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    try {
      expect(() => safeLocalStorage.setItem(KEY, 'x')).not.toThrow()
    } finally {
      Storage.prototype.setItem = real
    }
    expect(errors).toHaveLength(1)
  })
})
