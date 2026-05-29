import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Project } from '../types/project'
import { safeLocalStorage } from '../lib/safeStorage'

interface LibraryState {
  projects: Project[]
  /** Upsert by id. Stores a deep clone so later edits to the active project
   *  don't mutate the saved snapshot through shared nested references. */
  saveProject: (project: Project) => void
  removeProject: (id: string) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      projects: [],

      saveProject: (project) => {
        const snapshot = structuredClone(project)
        set((s) => {
          const exists = s.projects.some((p) => p.id === snapshot.id)
          return {
            projects: exists
              ? s.projects.map((p) => (p.id === snapshot.id ? snapshot : p))
              : [...s.projects, snapshot],
          }
        })
      },

      removeProject: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
    }),
    {
      name: 'auto-image:library',
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
)
