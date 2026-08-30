/**
 * localStorage wrapper for Zustand's persist middleware. A write that exceeds
 * the browser quota throws synchronously; the default storage lets that crash
 * the action that triggered it. We instead swallow the throw and broadcast an
 * `app:storage-error` event so the UI can warn the user their latest change
 * may not be saved. Reads/removes are left untouched.
 *
 * That warning only ever arrives after the first lost write, so this also
 * tracks how full the namespace is and broadcasts `app:storage-pressure`
 * while it is close to the cap — early enough for the user to free space
 * before anything is dropped.
 */
export const STORAGE_ERROR_EVENT = 'app:storage-error'
export const STORAGE_PRESSURE_EVENT = 'app:storage-pressure'

/** Every key this app persists; nothing else is counted toward the budget. */
const NAMESPACE = 'auto-image:'

/**
 * Browsers cap localStorage per origin at about 5 MB and measure it in UTF-16
 * code units, so roughly 2.5M characters across all our keys. The active
 * project, every library snapshot and every saved template are whole projects,
 * so a handful of saved projects can approach this.
 */
const BUDGET_CHARS = 2_500_000
const WARN_AT = 0.8

// Per-key sizes, so the budget check costs nothing per write. Seeded once by a
// full scan; a scan on every write would double the cost of persisting, and
// persist already runs on every edit.
const sizes = new Map<string, number>()
let seeded = false
let overBudget = false

function seed(): void {
  if (seeded) return
  seeded = true
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(NAMESPACE)) continue
    sizes.set(key, key.length + (localStorage.getItem(key)?.length ?? 0))
  }
}

/** Fraction of the character budget the app's own keys currently occupy. */
export function storageUsage(): number {
  seed()
  let total = 0
  for (const n of sizes.values()) total += n
  return total / BUDGET_CHARS
}

// Only the crossings are announced, in both directions: persist writes on every
// edit, and re-firing on each of them would rerender the banner continuously.
function checkPressure(): void {
  const ratio = storageUsage()
  const over = ratio >= WARN_AT
  if (over === overBudget) return
  overBudget = over
  window.dispatchEvent(
    new CustomEvent(STORAGE_PRESSURE_EVENT, { detail: { ratio, over } }),
  )
}

/** Test seam: forget the seeded scan and the last announced state. */
export function resetStorageTracking(): void {
  sizes.clear()
  seeded = false
  overBudget = false
}

export const safeLocalStorage = {
  getItem: (name: string): string | null => localStorage.getItem(name),
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value)
      seed()
      sizes.set(name, name.length + value.length)
      checkPressure()
    } catch (err) {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: err }))
    }
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name)
    if (sizes.delete(name)) checkPressure()
  },
}
