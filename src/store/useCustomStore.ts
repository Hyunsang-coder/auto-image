import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ThemePreset } from '../constants/defaults'
import { migrateTemplateSpanTexts, type ProjectTemplate } from '../constants/projectTemplates'
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
      // `projectTemplates` (no back-compat for the old shape — reset). v2→v3:
      // span texts moved to per-slide ownership — right-half captions migrate
      // from the leader onto the follower slide.
      version: 3,
      migrate: (persisted, version) => {
        if (version < 2) return { presets: [], projectTemplates: [] }
        const state = persisted as Pick<CustomState, 'presets' | 'projectTemplates'>
        return { ...state, projectTemplates: state.projectTemplates.map(migrateTemplateSpanTexts) }
      },
    },
  ),
)
