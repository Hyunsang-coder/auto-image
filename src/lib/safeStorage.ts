/**
 * localStorage wrapper for Zustand's persist middleware. A write that exceeds
 * the browser quota throws synchronously; the default storage lets that crash
 * the action that triggered it. We instead swallow the throw and broadcast an
 * `app:storage-error` event so the UI can warn the user their latest change
 * may not be saved. Reads/removes are left untouched.
 */
export const STORAGE_ERROR_EVENT = 'app:storage-error'

export const safeLocalStorage = {
  getItem: (name: string): string | null => localStorage.getItem(name),
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value)
    } catch (err) {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: err }))
    }
  },
  removeItem: (name: string): void => localStorage.removeItem(name),
}
