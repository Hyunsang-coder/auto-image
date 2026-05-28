import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ApiConfig, TranslationAPI } from '../types/project'

interface ApiKeyState {
  keys: ApiConfig
  setKey: (api: TranslationAPI, apiKey: string) => void
  clearKey: (api: TranslationAPI) => void
  clearAll: () => void
}

export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set, get) => ({
      keys: {},
      setKey: (api, apiKey) => {
        const trimmed = apiKey.trim()
        if (!trimmed) {
          get().clearKey(api)
          return
        }
        set({ keys: { ...get().keys, [api]: { apiKey: trimmed } } })
      },
      clearKey: (api) => {
        const next = { ...get().keys }
        delete next[api]
        set({ keys: next })
      },
      clearAll: () => set({ keys: {} }),
    }),
    {
      name: 'auto-image:api-keys',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
