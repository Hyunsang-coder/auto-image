import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Project, Slide, Step } from '../types/project'
import { makeProject, makeSlide } from '../constants/defaults'
import { deleteImage } from '../lib/imageStore'

interface ProjectState {
  project: Project | null
  step: Step
  activeSlideId: string | null

  createProject: (input: {
    name: string
    devices: Project['devices']
    screenshotCount: number
    themeColor: string
  }) => void
  resetProject: () => void
  updateProject: (patch: Partial<Project>) => void

  setStep: (step: Step) => void
  setActiveSlide: (slideId: string) => void

  updateSlide: (slideId: string, patch: Partial<Slide>) => void
  replaceSlide: (slideId: string, slide: Slide) => void
  addSlide: () => void
  removeSlide: (slideId: string) => void
  reorderSlides: (orderedIds: string[]) => void
}

function touch(project: Project | null): Project | null {
  if (!project) return project
  return { ...project, updatedAt: new Date().toISOString() }
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      project: null,
      step: 1,
      activeSlideId: null,

      createProject: (input) => {
        const project = makeProject(input)
        set({
          project,
          step: 2,
          activeSlideId: project.slides[0]?.id ?? null,
        })
      },

      resetProject: () => {
        const cur = get().project
        if (cur) {
          cur.slides.forEach(s => {
            if (s.screenshot?.imageKey) deleteImage(s.screenshot.imageKey)
          })
        }
        set({ project: null, step: 1, activeSlideId: null })
      },

      updateProject: (patch) => {
        const cur = get().project
        if (!cur) return
        set({ project: touch({ ...cur, ...patch }) })
      },

      setStep: (step) => set({ step }),

      setActiveSlide: (slideId) => set({ activeSlideId: slideId }),

      updateSlide: (slideId, patch) => {
        const cur = get().project
        if (!cur) return
        set({
          project: touch({
            ...cur,
            slides: cur.slides.map((s) =>
              s.id === slideId ? { ...s, ...patch } : s,
            ),
          }),
        })
      },

      replaceSlide: (slideId, slide) => {
        const cur = get().project
        if (!cur) return
        set({
          project: touch({
            ...cur,
            slides: cur.slides.map((s) => (s.id === slideId ? slide : s)),
          }),
        })
      },

      addSlide: () => {
        const cur = get().project
        if (!cur) return
        if (cur.slides.length >= 10) return
        const newSlide = makeSlide(cur.slides.length, cur.themeColor, cur.devices[0])
        set({
          project: touch({
            ...cur,
            screenshotCount: cur.slides.length + 1,
            slides: [...cur.slides, newSlide],
          }),
          activeSlideId: newSlide.id,
        })
      },

      removeSlide: (slideId) => {
        const cur = get().project
        if (!cur) return
        if (cur.slides.length <= 1) return
        const removed = cur.slides.find(s => s.id === slideId)
        if (removed?.screenshot?.imageKey) deleteImage(removed.screenshot.imageKey)
        const filtered = cur.slides
          .filter((s) => s.id !== slideId)
          .map((s, i) => ({ ...s, index: i }))
        const wasActive = get().activeSlideId === slideId
        set({
          project: touch({
            ...cur,
            slides: filtered,
            screenshotCount: filtered.length,
          }),
          activeSlideId: wasActive
            ? (filtered[0]?.id ?? null)
            : get().activeSlideId,
        })
      },

      reorderSlides: (orderedIds) => {
        const cur = get().project
        if (!cur) return
        const map = new Map(cur.slides.map((s) => [s.id, s]))
        const next = orderedIds
          .map((id, i) => {
            const s = map.get(id)
            return s ? { ...s, index: i } : null
          })
          .filter((s): s is Slide => s !== null)
        if (next.length !== cur.slides.length) return
        set({ project: touch({ ...cur, slides: next }) })
      },
    }),
    {
      name: 'auto-image:project',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        project: state.project,
        step: state.step,
        activeSlideId: state.activeSlideId,
      }),
    },
  ),
)

