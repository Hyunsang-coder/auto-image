import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SlideTemplate } from '../types/project'
import type { ThemePreset } from '../constants/defaults'
import { safeLocalStorage } from '../lib/safeStorage'

interface CustomState {
  presets: ThemePreset[]
  templates: SlideTemplate[]
  addPreset: (preset: ThemePreset) => void
  removePreset: (id: string) => void
  addTemplate: (template: SlideTemplate) => void
  removeTemplate: (id: string) => void
}

export const useCustomStore = create<CustomState>()(
  persist(
    (set) => ({
      presets: [],
      templates: [],

      addPreset: (preset) => set((s) => ({ presets: [...s.presets, preset] })),
      removePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      addTemplate: (template) =>
        set((s) => ({ templates: [...s.templates, template] })),
      removeTemplate: (id) =>
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
    }),
    {
      name: 'auto-image:custom',
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
)
