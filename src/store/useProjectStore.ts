import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Project, Slide, Step, ScreenshotImage } from '../types/project'
import { makeProject, makeSlide } from '../constants/defaults'
import { deleteImage, loadImageBlob, saveImage } from '../lib/imageStore'
import { safeLocalStorage } from '../lib/safeStorage'

function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Find the leader / follower of a slide's span group. Returns nulls if the
 * slide isn't grouped or the partner is missing (shouldn't happen — caller
 * should treat that as a corrupted state and rebuild from scratch).
 */
export function findSpanPartner(
  slides: Slide[],
  slide: Slide,
): { leader: Slide; follower: Slide } | null {
  if (!slide.spanGroupId) return null
  const groupId = slide.spanGroupId
  const a = slides.find((s) => s.id === slide.id)
  const b = slides.find((s) => s.spanGroupId === groupId && s.id !== slide.id)
  if (!a || !b) return null
  return a.spanRole === 'leader'
    ? { leader: a, follower: b }
    : { leader: b, follower: a }
}

/**
 * Resolve which slide owns the layer data for whichever slide the user is
 * currently looking at. For non-grouped slides, the slide owns its own layers.
 * For grouped slides, the leader owns; follower is a pointer.
 */
export function spanLeaderOf(slides: Slide[], slide: Slide | null): Slide | null {
  if (!slide) return null
  if (!slide.spanGroupId) return slide
  const pair = findSpanPartner(slides, slide)
  return pair?.leader ?? slide
}

async function duplicateScreenshot(
  src: ScreenshotImage | null,
): Promise<ScreenshotImage | null> {
  if (!src) return null
  const blob = await loadImageBlob(src.imageKey)
  if (!blob) return null
  const newKey = await saveImage(blob)
  return {
    id: newId('shot'),
    imageKey: newKey,
    originalWidth: src.originalWidth,
    originalHeight: src.originalHeight,
  }
}

/**
 * Clone every visual field from `leader` onto `follower`, giving it brand new
 * IDs for IDed sub-objects and a duplicated screenshot blob so the two slides
 * become fully independent. Identity (id/index) and span markers are reset.
 */
async function buildIndependentFromLeader(
  leader: Slide,
  follower: Slide,
): Promise<Slide> {
  const screenshot = await duplicateScreenshot(leader.screenshot)
  const highlights = leader.highlights.map((h) => ({ ...h, id: newId('hl') }))
  const ornaments = leader.ornaments?.map((o) => ({ ...o, id: newId('orn') }))
  const badge = leader.badge ? { ...leader.badge, id: newId('badge') } : null
  return {
    id: follower.id,
    index: follower.index,
    template: leader.template,
    background: leader.background,
    deviceFrame: { ...leader.deviceFrame },
    screenshot,
    headline: {
      ...leader.headline,
      style: { ...leader.headline.style },
      translations: { ...leader.headline.translations },
    },
    subheadline: {
      ...leader.subheadline,
      style: { ...leader.subheadline.style },
      translations: { ...leader.subheadline.translations },
    },
    badge,
    highlights,
    ornaments,
    screenshotStyle: leader.screenshotStyle ? { ...leader.screenshotStyle } : undefined,
    spanGroupId: undefined,
    spanRole: undefined,
  }
}

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
  removeSlide: (slideId: string) => Promise<void>
  reorderSlides: (orderedIds: string[]) => void

  /**
   * Link `slideId` with the next adjacent slide into a 2-page span group.
   * Both slides must share a deviceFrame.model and neither may be already
   * grouped. Returns null on success or a reason string on failure.
   */
  linkSpanWithNext: (slideId: string) => string | null
  /**
   * Dissolve a span group. Clones leader's full layout onto follower (with a
   * duplicated screenshot blob and fresh IDs), then clears spanGroupId/Role on
   * both slides. Async because of the IndexedDB image duplication.
   */
  unlinkSpan: (groupId: string) => Promise<void>
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

      removeSlide: async (slideId) => {
        const cur = get().project
        if (!cur) return
        if (cur.slides.length <= 1) return
        const removed = cur.slides.find((s) => s.id === slideId)
        if (!removed) return

        // If the slide being removed is part of a span group, dissolve the
        // group first so the survivor inherits leader's layout (and gets its
        // own duplicated image). Then we proceed with the normal remove.
        if (removed.spanGroupId) {
          await get().unlinkSpan(removed.spanGroupId)
        }

        // Re-read after potential dissolve.
        const after = get().project
        if (!after) return
        const target = after.slides.find((s) => s.id === slideId)
        if (target?.screenshot?.imageKey) deleteImage(target.screenshot.imageKey)
        const filtered = after.slides
          .filter((s) => s.id !== slideId)
          .map((s, i) => ({ ...s, index: i }))
        const wasActive = get().activeSlideId === slideId
        set({
          project: touch({
            ...after,
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
        // Any span group whose leader/follower are no longer adjacent (in that
        // order) gets its span markers stripped — we intentionally lose the
        // group rather than silently keeping a broken pair. (No image dup
        // here; the caller is reorganizing, not splitting.)
        const groupIds = new Set(
          next.filter((s) => s.spanGroupId).map((s) => s.spanGroupId!),
        )
        const broken = new Set<string>()
        for (const gid of groupIds) {
          const members = next.filter((s) => s.spanGroupId === gid)
          if (members.length !== 2) {
            broken.add(gid)
            continue
          }
          const leader = members.find((s) => s.spanRole === 'leader')
          const follower = members.find((s) => s.spanRole === 'follower')
          if (!leader || !follower || follower.index !== leader.index + 1) {
            broken.add(gid)
          }
        }
        const cleaned = broken.size
          ? next.map((s) =>
              s.spanGroupId && broken.has(s.spanGroupId)
                ? { ...s, spanGroupId: undefined, spanRole: undefined }
                : s,
            )
          : next
        set({ project: touch({ ...cur, slides: cleaned }) })
      },

      linkSpanWithNext: (slideId) => {
        const cur = get().project
        if (!cur) return 'no project'
        const idx = cur.slides.findIndex((s) => s.id === slideId)
        if (idx < 0) return 'slide not found'
        if (idx >= cur.slides.length - 1) return '다음 슬라이드가 없습니다'
        const leader = cur.slides[idx]
        const follower = cur.slides[idx + 1]
        if (leader.spanGroupId || follower.spanGroupId)
          return '이미 그룹에 속한 슬라이드입니다'
        if (leader.deviceFrame.model !== follower.deviceFrame.model)
          return '디바이스 모델이 달라 묶을 수 없습니다'
        const groupId = newId('span')
        set({
          project: touch({
            ...cur,
            slides: cur.slides.map((s) => {
              if (s.id === leader.id)
                return { ...s, spanGroupId: groupId, spanRole: 'leader' }
              if (s.id === follower.id)
                return { ...s, spanGroupId: groupId, spanRole: 'follower' }
              return s
            }),
          }),
          // Focus the leader so the editor swaps to grouped 2× canvas.
          activeSlideId: leader.id,
        })
        return null
      },

      unlinkSpan: async (groupId) => {
        const cur = get().project
        if (!cur) return
        const members = cur.slides.filter((s) => s.spanGroupId === groupId)
        if (members.length !== 2) return
        const leader = members.find((s) => s.spanRole === 'leader')
        const follower = members.find((s) => s.spanRole === 'follower')
        if (!leader || !follower) return
        // Duplicate leader's IndexedDB image and clone all visual fields onto
        // follower so both slides are fully independent after this returns.
        const newFollower = await buildIndependentFromLeader(leader, follower)
        const after = get().project
        if (!after) return
        set({
          project: touch({
            ...after,
            slides: after.slides.map((s) => {
              if (s.id === leader.id)
                return { ...s, spanGroupId: undefined, spanRole: undefined }
              if (s.id === follower.id) return newFollower
              return s
            }),
          }),
        })
      },
    }),
    {
      name: 'auto-image:project',
      storage: createJSONStorage(() => safeLocalStorage),
      version: 1,
      partialize: (state) => ({
        project: state.project,
        step: state.step,
        activeSlideId: state.activeSlideId,
      }),
    },
  ),
)

