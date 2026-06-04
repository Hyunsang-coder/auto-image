import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Project, Slide, Step, ScreenshotImage, Background, DeviceType, DeviceModel, LocaleOverride } from '../types/project'
import { makeProject, makeSlide, relocalizePlaceholder, DEFAULT_BACKGROUND } from '../constants/defaults'
import { typeOfModel } from '../constants/deviceSpecs'
import { loadImageBlob, saveImage } from '../lib/imageStore'
import { gcImages } from '../lib/imageRefs'
import { safeLocalStorage } from '../lib/safeStorage'
import { migrateSpanSlides } from '../lib/spanTextMigration'

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

/**
 * Deep-clone a slide as a standalone copy: fresh IDs for the slide and every
 * IDed sub-object, span markers cleared. Image blobs are *shared* (the imageKey
 * strings are copied, not the IndexedDB blobs) — replacing a screenshot always
 * mints a new key, so the copies diverge cleanly and the GC keep-set counts both
 * references.
 */
function cloneSlideStandalone(src: Slide): Slide {
  const c = structuredClone(src)
  c.id = newId('slide')
  if (c.screenshot) c.screenshot.id = newId('shot')
  c.badges = c.badges.map((b) => ({ ...b, id: newId('badge') }))
  c.highlights = c.highlights.map((h) => ({ ...h, id: newId('hl') }))
  c.ornaments = c.ornaments?.map((o) => ({ ...o, id: newId('orn') }))
  c.spanGroupId = undefined
  c.spanRole = undefined
  return c
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
 * Clone the shared look from `leader` onto `follower`, giving it brand new IDs
 * for IDed sub-objects and a duplicated screenshot blob so the two slides
 * become fully independent. Texts are NOT cloned — the follower owned the
 * right page's captions while grouped and keeps them (with the text portion of
 * its locale overrides). Identity (id/index) and span markers are reset.
 */
async function buildIndependentFromLeader(
  leader: Slide,
  follower: Slide,
): Promise<Slide> {
  const screenshot = await duplicateScreenshot(leader.screenshot)
  const highlights = leader.highlights.map((h) => ({ ...h, id: newId('hl') }))
  const ornaments = leader.ornaments?.map((o) => ({ ...o, id: newId('orn') }))
  const badges = leader.badges.map((b) => ({ ...b, id: newId('badge') }))
  // Look overrides referenced the follower's pre-link look, which the leader
  // clone replaces — keep only the caption overrides that belong to its texts.
  let localeOverrides: Record<string, LocaleOverride> | undefined
  for (const [locale, ov] of Object.entries(follower.localeOverrides ?? {})) {
    if (ov.texts && Object.keys(ov.texts).length) {
      ;(localeOverrides ??= {})[locale] = { texts: ov.texts }
    }
  }
  return {
    id: follower.id,
    index: follower.index,
    template: leader.template,
    background: leader.background,
    deviceFrame: { ...leader.deviceFrame },
    screenshot,
    texts: follower.texts,
    badges,
    highlights,
    ornaments,
    screenshotStyle: leader.screenshotStyle ? { ...leader.screenshotStyle } : undefined,
    spanGroupId: undefined,
    spanRole: undefined,
    localeOverrides,
  }
}

interface ProjectState {
  project: Project | null
  step: Step
  activeSlideId: string | null

  createProject: (input: {
    name: string
    devices: Project['devices']
    deviceModels?: Project['deviceModels']
    screenshotCount: number
    themeBackground: Background
  }) => void
  resetProject: () => void
  /** Replace the active project with a saved one (deep-cloned), jump to editor. */
  loadProject: (project: Project) => void
  updateProject: (patch: Partial<Project>) => void
  /**
   * Set the App Store export size for a device type, remapping every slide of
   * that type to the new model in one write. The type↔slide partition is by the
   * slide's current model's type, so iPhone and iPad sizes change independently.
   */
  setDeviceSize: (type: DeviceType, model: DeviceModel) => void
  /** Change sourceLocale and swap base ↔ translation for all slides atomically. */
  changeSourceLocale: (next: string) => void

  setStep: (step: Step) => void
  setActiveSlide: (slideId: string) => void

  updateSlide: (slideId: string, patch: Partial<Slide>) => void
  /**
   * Apply a per-slide patch map in a single write (one history/persist entry).
   * Each slide gets its OWN derived patch (keyed by id) — used by bulk "apply
   * style to all/selected" where the preset/template is recomputed per target.
   */
  updateSlides: (patches: Record<string, Partial<Slide>>) => void
  replaceSlide: (slideId: string, slide: Slide) => void
  addSlide: () => void
  /** Insert a standalone copy of `slideId` right after it (fresh IDs, shared
   *  image blobs, span markers cleared). */
  duplicateSlide: (slideId: string) => void
  removeSlide: (slideId: string) => Promise<void>
  /**
   * Remove several slides in one go. Iterates the existing single-remove logic
   * sequentially (so span dissolve, reindex, and GC all run per slide) while
   * guarding the "never delete the last slide" rule across the whole batch.
   */
  removeSlides: (ids: string[]) => Promise<void>
  reorderSlides: (orderedIds: string[]) => void

  /**
   * Link `slideId` with the next adjacent slide into a 2-page span group.
   * Both slides must share a deviceFrame.model and neither may be already
   * grouped. Returns null on success or a reason string on failure.
   */
  linkSpanWithNext: (slideId: string) => string | null
  /**
   * Dissolve a span group. Clones leader's shared look onto follower (with a
   * duplicated screenshot blob and fresh IDs) while the follower keeps its own
   * texts, then clears spanGroupId/Role on both slides. Async because of the
   * IndexedDB image duplication.
   */
  unlinkSpan: (groupId: string) => Promise<void>
}

function touch(project: Project | null): Project | null {
  if (!project) return project
  return { ...project, updatedAt: new Date().toISOString() }
}

/**
 * Back-compat: projects created before the theme became a full Background only
 * carried a `themeColor` string. Fill `themeBackground` with the default so the
 * setup screen and new-slide defaults don't break when such a project loads
 * (from the library or rehydrated from localStorage).
 */
function ensureThemeBackground(project: Project): Project {
  if (project.themeBackground) return project
  return { ...project, themeBackground: structuredClone(DEFAULT_BACKGROUND) }
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
        set({ project: null, step: 1, activeSlideId: null })
        // Reference-checked: only sweep blobs no saved project/preset/template
        // still points at (the cleared project may have shared keys with them).
        gcImages()
      },

      loadProject: (project) => {
        const clone = ensureThemeBackground(structuredClone(project))
        set({
          project: clone,
          step: 2,
          activeSlideId: clone.slides[0]?.id ?? null,
        })
      },

      updateProject: (patch) => {
        const cur = get().project
        if (!cur) return
        set({ project: touch({ ...cur, ...patch }) })
      },

      changeSourceLocale: (next) => {
        const cur = get().project
        if (!cur || cur.sourceLocale === next) return
        const prev = cur.sourceLocale
        const slides = cur.slides.map((s) => ({
          ...s,
          texts: s.texts.map((c) => {
            const { [next]: promoted, ...rest } = c.translations
            return {
              ...c,
              text: promoted ?? relocalizePlaceholder(c.text, prev, next),
              translations: { ...rest, [prev]: c.text },
            }
          }),
          badges: s.badges.map((b) => {
            const { [next]: promoted, ...rest } = b.translations
            return {
              ...b,
              text: promoted ?? relocalizePlaceholder(b.text, prev, next),
              translations: { ...rest, [prev]: b.text },
            }
          }),
        }))
        // Only add prev to targetLocales if there were already targets — a
        // project with no targets is in single-locale mode and should stay that way.
        const prevTargets = cur.targetLocales.filter((l) => l !== next)
        const nextTargets = cur.targetLocales.length > 0 ? [...prevTargets, prev] : prevTargets
        set({
          project: touch({
            ...cur,
            slides,
            sourceLocale: next,
            targetLocales: nextTargets,
          }),
        })
      },

      setDeviceSize: (type, model) => {
        const cur = get().project
        if (!cur) return
        set({
          project: touch({
            ...cur,
            deviceModels: { ...cur.deviceModels, [type]: model },
            slides: cur.slides.map((s) =>
              typeOfModel(s.deviceFrame.model) === type
                ? { ...s, deviceFrame: { ...s.deviceFrame, model } }
                : s,
            ),
          }),
        })
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

      updateSlides: (patches) => {
        const cur = get().project
        if (!cur) return
        set({
          project: touch({
            ...cur,
            slides: cur.slides.map((s) =>
              patches[s.id] ? { ...s, ...patches[s.id] } : s,
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
        const type = cur.devices[0]
        const newSlide = makeSlide(cur.slides.length, type, undefined, cur.sourceLocale)
        // Honor the project's chosen export size for this type (makeSlide seeds
        // the type's default model).
        const sized = cur.deviceModels?.[type]
        if (sized) newSlide.deviceFrame = { ...newSlide.deviceFrame, model: sized }
        set({
          project: touch({
            ...cur,
            screenshotCount: cur.slides.length + 1,
            slides: [...cur.slides, newSlide],
          }),
          activeSlideId: newSlide.id,
        })
      },

      duplicateSlide: (slideId) => {
        const cur = get().project
        if (!cur) return
        if (cur.slides.length >= 10) return
        const srcIdx = cur.slides.findIndex((s) => s.id === slideId)
        if (srcIdx < 0) return
        const copy = cloneSlideStandalone(cur.slides[srcIdx])
        const slides = [...cur.slides]
        slides.splice(srcIdx + 1, 0, copy)
        const reindexed = slides.map((s, i) => ({ ...s, index: i }))
        set({
          project: touch({
            ...cur,
            slides: reindexed,
            screenshotCount: reindexed.length,
          }),
          activeSlideId: copy.id,
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
        // Sweep the removed slide's blobs only if nothing else references them
        // (a saved project, preset, template, or sibling slide may share keys).
        gcImages()
      },

      removeSlides: async (ids) => {
        // Delegate to removeSlide one id at a time; it re-reads project state,
        // dissolves spans, reindexes, and GCs on each call. Stop before the
        // project would be emptied — removeSlide already no-ops at length 1,
        // but checking here keeps the loop from churning needlessly and leaves
        // the last requested slide intact rather than silently kept.
        for (const id of ids) {
          const cur = get().project
          if (!cur || cur.slides.length <= 1) break
          if (!cur.slides.some((s) => s.id === id)) continue
          await get().removeSlide(id)
        }
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
      version: 5,
      // v3→v4: fixed `slide.headline`/`slide.subheadline` became `slide.texts[]`.
      // No back-compat: any pre-v4 persisted project is dropped to a clean slate.
      // v4→v5: span texts moved from wide-canvas normalization on the leader to
      // per-slide ownership — right-half captions migrate onto the follower.
      migrate: (_persisted, version) => {
        if (version < 4) return { project: null, step: 1, activeSlideId: null }
        const state = _persisted as { project: Project | null; step: Step; activeSlideId: string | null }
        if (version < 5 && state.project) {
          state.project = { ...state.project, slides: migrateSpanSlides(state.project.slides) }
        }
        return state
      },
      partialize: (state) => ({
        project: state.project,
        step: state.step,
        activeSlideId: state.activeSlideId,
      }),
    },
  ),
)

