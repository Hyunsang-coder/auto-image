import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ThemePreset } from '../constants/defaults'
import type { ProjectTemplate } from '../constants/projectTemplates'
import { safeLocalStorage } from '../lib/safeStorage'

interface CustomState {
  presets: ThemePreset[]
  projectTemplates: ProjectTemplate[]
  addPreset: (preset: ThemePreset) => void
  removePreset: (id: string) => void
  addProjectTemplate: (template: ProjectTemplate) => void
  removeProjectTemplate: (id: string) => void
}

export const useCustomStore = create<CustomState>()(
  persist(
    (set) => ({
      presets: [],
      projectTemplates: [],

      addPreset: (preset) => set((s) => ({ presets: [...s.presets, preset] })),
      removePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      addProjectTemplate: (template) =>
        set((s) => ({ projectTemplates: [...s.projectTemplates, template] })),
      removeProjectTemplate: (id) =>
        set((s) => ({ projectTemplates: s.projectTemplates.filter((t) => t.id !== id) })),
    }),
    {
      name: 'auto-image:custom',
      storage: createJSONStorage(() => safeLocalStorage),
      // v1 stored single-slide `templates`; v2 replaces them with whole-project
      // `projectTemplates`. No back-compat for the old shape — reset that slice.
      version: 2,
      migrate: () => ({ presets: [], projectTemplates: [] }),
    },
  ),
)
