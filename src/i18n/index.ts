import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '../lib/safeStorage'
import { en } from './en'

export type UiLocale = 'ko' | 'en'

interface I18nState {
  locale: UiLocale
  setLocale: (locale: UiLocale) => void
}

const browserDefault = (): UiLocale =>
  navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: browserDefault(),
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'ui-locale', storage: createJSONStorage(() => safeLocalStorage) },
  ),
)

/**
 * Translate a UI string. The Korean source text is the dictionary key, so a
 * missing entry falls back to Korean instead of a bare key. `{name}` tokens
 * are replaced from `params` after lookup.
 *
 * Non-reactive — safe in lib code and event handlers. Inside component render,
 * use `useT()` so a locale toggle re-renders.
 */
export function t(ko: string, params?: Record<string, string | number>): string {
  const locale = useI18nStore.getState().locale
  let s = locale === 'ko' ? ko : (en[ko] ?? ko)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      s = s.replaceAll(`{${key}}`, String(value))
    }
  }
  return s
}

export function useT() {
  useI18nStore((s) => s.locale)
  return t
}
