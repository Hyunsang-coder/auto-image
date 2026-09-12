import type { StateStorage } from 'zustand/middleware'

// Trailing-edge coalescing wrapper for a persist StateStorage. The project
// store writes on every keystroke and persist serializes the whole project per
// write; collapsing a burst into one write keeps typing latency off the
// localStorage bill. Reads/removals delegate straight through. flush() forces
// the pending write out (pagehide + tests); dispose() removes the listener.
export interface FlushableStorage extends StateStorage {
  flush: () => void
  dispose: () => void
}

export function throttledStorage(inner: StateStorage, waitMs = 500): FlushableStorage {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { name: string; value: string } | null = null

  const write = () => {
    timer = null
    if (!pending) return
    const { name, value } = pending
    pending = null
    inner.setItem(name, value)
  }

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    write()
  }

  const onHide = () => flush()
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', onHide)
  }

  return {
    getItem: (name) => inner.getItem(name),
    setItem: (name, value) => {
      pending = { name, value }
      if (!timer) timer = setTimeout(write, waitMs)
    },
    removeItem: (name) => inner.removeItem(name),
    flush,
    dispose: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('pagehide', onHide)
      }
    },
  }
}
