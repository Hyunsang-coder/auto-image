import { useEffect, useRef, useState } from 'react'
import type { Slide } from '../../types/project'
import { renderSlide, renderSpanGroup } from '../../lib/renderSlide'
import { planThumbnailJobs, renderKey } from '../../lib/thumbnailPlan'

// renderKey lives in lib/thumbnailPlan (pure, unit-tested); re-exported so
// existing importers don't move.
export { renderKey }

const DEBOUNCE_MS = 300

/** Rendered width of the slide-tray / canvas-board thumbnails, in px. */
export const THUMB_WIDTH = 220

/**
 * Live-rendered previews of every slide for the given locale ('' = base), one
 * PNG each. Renders are debounced and cached by a content hash, so editing one
 * slide only re-renders that slide; unchanged images are reused. Each finished
 * render commits on its own, so a run cut short by an edit still leaves every
 * image it had already produced on screen.
 *
 * `width` is the rendered pixel width; omit it for full export resolution
 * (byte-identical to the exported PNG — absolute-pixel constants like the
 * fit-to-box floor otherwise diverge between preview and export scale).
 *
 * Returns a slideId → object-URL map (undefined while an image has never been
 * rendered) plus whether a render is still outstanding.
 */
export function useSlideThumbnails(
  slides: Slide[],
  locale: string,
  width?: number,
): { thumbs: Record<string, string | undefined>; rendering: boolean } {
  const [thumbs, setThumbs] = useState<Record<string, string | undefined>>({})
  const [rendering, setRendering] = useState(false)
  // key → object URL, kept across renders; entries are revoked when their key
  // is no longer referenced by any slide.
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Mirror of `thumbs` so a run can carry over previous URLs (avoids a
  // placeholder flash on the edited slide) without depending on state.
  const thumbsRef = useRef(thumbs)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(run, DEBOUNCE_MS)

    function commit(next: Record<string, string | undefined>) {
      thumbsRef.current = next
      setThumbs(next)
    }

    async function run() {
      const cache = cacheRef.current
      const renderLocale = locale || null
      const usedKeys = new Set<string>()
      // Carry over the previous render's URLs so unchanged slides — and an
      // edited slide whose new image isn't ready yet — keep showing.
      const next: Record<string, string | undefined> = {}
      for (const slide of slides) next[slide.id] = thumbsRef.current[slide.id]
      // One job per missed slide, one wide render per span group (both halves
      // commit off it). Keys are computed once inside the planner.
      const jobs = planThumbnailJobs(slides, locale, width, (key) => {
        usedKeys.add(key)
        return cache.has(key)
      })
      if (cancelled) return
      commit({ ...next })
      setRendering(jobs.length > 0)

      try {
        for (const job of jobs) {
          if (cancelled) return
          try {
            if (job.single && job.singleKey) {
              const blob = await renderSlide(job.single, renderLocale, width)
              if (cancelled) return
              const url = URL.createObjectURL(blob)
              cache.set(job.singleKey, url)
              next[job.single.id] = url
              commit({ ...next })
            } else if (job.follower && job.leaderKey && job.followerKey) {
              const halves = await renderSpanGroup(job.leader, job.follower, renderLocale, width)
              if (cancelled) return
              if (job.slideIds.includes(job.leader.id)) {
                const url = URL.createObjectURL(halves.leader)
                cache.set(job.leaderKey, url)
                next[job.leader.id] = url
              }
              if (job.slideIds.includes(job.follower.id)) {
                const url = URL.createObjectURL(halves.follower)
                cache.set(job.followerKey, url)
                next[job.follower.id] = url
              }
              commit({ ...next })
            }
          } catch {
            // Leave the carried-over (or undefined) image in place.
          }
        }
      } finally {
        // A superseded run returns above without clearing this; the run that
        // superseded it owns the flag from its own setRendering(true).
        if (!cancelled) setRendering(false)
      }

      // Drop + revoke cache entries no slide references anymore.
      for (const [k, url] of cache) {
        if (!usedKeys.has(k)) {
          URL.revokeObjectURL(url)
          cache.delete(k)
        }
      }
    }

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slides, locale, width])

  // Revoke everything on unmount.
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  return { thumbs, rendering }
}
