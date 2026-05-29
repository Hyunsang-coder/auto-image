import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Canvas, FabricImage, Line, Rect, Textbox } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Highlight, Slide } from '../../types/project'
import { applyTemplate } from '../../canvas/templateLayouts'
import { createImageUrlCache, type ImageUrlCache } from '../../lib/imageStore'
import { LAYER_NAMES } from '../../canvas/layerNames'
import { getOrnamentViewBox } from '../../canvas/objects/ornament'
import { newId } from '../../constants/defaults'
import { EDITOR_CANVAS_WIDTH, DEVICE_SPECS } from '../../constants/deviceSpecs'

const SEAM_LAYER = 'span-seam-guide'

function getEditorCanvasHeight(slide: Slide): number {
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  return Math.round((EDITOR_CANVAS_WIDTH / spec.exportWidth) * spec.exportHeight)
}

/**
 * Editor-only vertical dashed line marking the seam between the two halves of
 * a 2-page span. Non-selectable, non-evented, tagged with a distinct
 * layerName so sync code never mistakes it for content.
 */
function addSpanSeamGuide(canvas: Canvas, midX: number, height: number): void {
  const line = new Line([midX, 0, midX, height], {
    stroke: 'rgba(99, 102, 241, 0.6)',
    strokeWidth: 1,
    strokeDashArray: [6, 6],
    selectable: false,
    evented: false,
    hoverCursor: 'default',
    excludeFromExport: true,
  })
  ;(line as unknown as { layerName: string }).layerName = SEAM_LAYER
  canvas.add(line)
}

// Custom props we stash on the device-body Path so we can compute its offset
// from drag end position without re-deriving template anchors.
interface DeviceAnchorProps {
  _baseLeft?: number
  _baseTop?: number
}

export interface FabricCanvasHandle {
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  duplicateSelected: () => void
  discardSelection: () => void
  nudgeSelected: (dx: number, dy: number) => void
}

interface Props {
  activeSlide: Slide | null
  /**
   * True when the active slide is part of a 2-page span group. Doubles the
   * canvas width and overlays a seam guide. `activeSlide` is expected to be
   * the *leader* — EditorLayout resolves it.
   */
  isGrouped?: boolean
  onSlideChange: (patch: Partial<Slide>) => void
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void
}

const HISTORY_LIMIT = 50
// Custom per-object props that must survive a history snapshot → loadFromJSON
// round-trip, otherwise restored objects lose their identity and syncToZustand
// can't map them back to the store (positions would silently un-revert).
const HISTORY_PROPS = ['layerName', 'badgeId', 'ornamentId', 'highlightId', '_baseLeft', '_baseTop']

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export const FabricCanvas = forwardRef<FabricCanvasHandle, Props>(
  function FabricCanvas({ activeSlide, isGrouped = false, onSlideChange, onHistoryChange }, ref) {
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<Canvas | null>(null)
    // History stacks store canvas object snapshots (with custom props).
    // `baselineRef` is the present state; undo/redo move it between the stacks.
    const undoStack = useRef<object[]>([])
    const redoStack = useRef<object[]>([])
    const baselineRef = useRef<object | null>(null)
    const isApplyingHistory = useRef(false)
    const prevSlideId = useRef<string | null>(null)
    // One blob URL per image for the current slide's lifetime — reused across
    // the many re-renders an editing session triggers, revoked on slide switch
    // and canvas dispose so screenshots don't leak memory until a tab crash.
    const urlCacheRef = useRef<ImageUrlCache>(createImageUrlCache())
    const onSlideChangeRef = useRef(onSlideChange)
    const activeSlideRef = useRef(activeSlide)
    const onHistoryChangeRef = useRef(onHistoryChange)

    useEffect(() => {
      onSlideChangeRef.current = onSlideChange
    })
    useEffect(() => {
      activeSlideRef.current = activeSlide
    })
    useEffect(() => {
      onHistoryChangeRef.current = onHistoryChange
    })

    function notifyHistory() {
      onHistoryChangeRef.current?.({
        canUndo: undoStack.current.length > 0,
        canRedo: redoStack.current.length > 0,
      })
    }

    function takeSnapshot(canvas: Canvas): object {
      return canvas.toObject(HISTORY_PROPS)
    }

    function pushHistory(canvas: Canvas) {
      if (isApplyingHistory.current) return
      // object:modified fires AFTER the change, so the canvas is already the new
      // state. Push the previous baseline (the pre-change state) onto undo, then
      // adopt the new state as the baseline.
      if (baselineRef.current) {
        undoStack.current.push(baselineRef.current)
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      }
      baselineRef.current = takeSnapshot(canvas)
      redoStack.current = []
      notifyHistory()
    }

    function findDeviceBody(canvas: Canvas): (FabricObject & DeviceAnchorProps) | null {
      // The selectable body path is the first device-frame object we tagged with
      // _baseLeft/_baseTop in templateLayouts.
      for (const obj of canvas.getObjects()) {
        const o = obj as FabricObject & DeviceAnchorProps & { layerName?: string }
        if (o.layerName === LAYER_NAMES.DEVICE_FRAME && typeof o._baseLeft === 'number') {
          return o
        }
      }
      return null
    }

    function syncToZustand(canvas: Canvas, movedTarget?: FabricObject) {
      const slide = activeSlideRef.current
      if (!slide) return

      const objects = canvas.getObjects()
      const slidePatch: Partial<Slide> = {}
      const cw = canvas.width ?? 1
      const ch = canvas.height ?? 1

      for (const obj of objects) {
        const ln = (obj as Textbox & { layerName?: string }).layerName
        if (ln === LAYER_NAMES.HEADLINE || ln === LAYER_NAMES.SUBHEADLINE) {
          const itext = obj as Textbox
          const captionKey = ln === LAYER_NAMES.HEADLINE ? 'headline' : 'subheadline'
          const existing = slide[captionKey]
          slidePatch[captionKey] = {
            ...existing,
            text: itext.text ?? existing.text,
            style: {
              ...existing.style,
              fontSize: itext.fontSize ?? existing.style.fontSize,
              color: typeof itext.fill === 'string' ? itext.fill : existing.style.color,
              textAlign: (itext.textAlign as 'left' | 'center' | 'right') ?? existing.style.textAlign,
            },
          }
          // Persist position only when the user actually dragged THIS caption.
          // Capturing it on every sync would pin text that's still meant to
          // follow the template (e.g. after a device move or template switch).
          if (obj === movedTarget) {
            const c = itext.getCenterPoint()
            slidePatch[captionKey] = {
              ...slidePatch[captionKey]!,
              pos: { x: c.x / cw, y: (itext.top ?? 0) / ch },
            }
          }
        }
      }

      const body = findDeviceBody(canvas)
      if (body && body._baseLeft !== undefined && body._baseTop !== undefined) {
        // Uniform scale only — lockUniScaling guarantees scaleX === scaleY.
        // With centeredScaling, Fabric shifts body.left/top by -deltaW/2/-deltaH/2
        // so the visual *center* stays fixed during a resize. That shift is
        // NOT a user translation — it's a side-effect of growing the box. Add
        // deltaW/2 / deltaH/2 back so offset captures only the user's drag.
        const scaleX = body.scaleX ?? 1
        const baseW = body.width ?? 0
        const baseH = body.height ?? 0
        const deltaW = baseW * (scaleX - 1)
        const deltaH = baseH * (scaleX - 1)
        const nextOffsetX = Math.round((body.left ?? 0) - body._baseLeft + deltaW / 2)
        const nextOffsetY = Math.round((body.top ?? 0) - body._baseTop + deltaH / 2)
        const curScale = slide.deviceFrame.scale ?? 1
        const proposedScale = curScale * scaleX
        // Keep the device within a sane range so users can't accidentally
        // make it vanish or overflow the canvas during a wild drag.
        const nextScale = Math.round(Math.max(0.3, Math.min(2.0, proposedScale)) * 100) / 100

        const curX = slide.deviceFrame.offsetX ?? 0
        const curY = slide.deviceFrame.offsetY ?? 0
        const scaleChanged = Math.abs(nextScale - curScale) > 0.001
        if (nextOffsetX !== curX || nextOffsetY !== curY || scaleChanged) {
          slidePatch.deviceFrame = {
            ...slide.deviceFrame,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY,
            scale: nextScale,
          }
        }
      }

      // Sync badge positions/scale. Group's originX:'center', originY:'top' means
      // group.left = center X, group.top = top edge of world bbox. We bake any
      // user scale into fontSize/padding so the next render starts fresh.
      const badgesOnCanvas = objects.filter(
        (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.BADGE,
      )
      if (badgesOnCanvas.length > 0 && slide.badges?.length) {
        const w = canvas.width ?? 1
        const h = canvas.height ?? 1
        let dirty = false
        const next = slide.badges.map((badge) => {
          const fab = badgesOnCanvas.find(
            (o) => (o as FabricObject & { badgeId?: string }).badgeId === badge.id,
          )
          if (!fab) return badge
          const scaleX = fab.scaleX ?? 1
          const newLeft = (fab.left ?? 0) / w
          const newTop = (fab.top ?? 0) / h
          const curLeft = badge.left ?? 0.5
          const styleScale = Math.max(0.4, Math.min(3.0, scaleX))
          const scaleChanged = Math.abs(styleScale - 1) > 0.01
          if (
            Math.abs(newLeft - curLeft) > 0.001 ||
            Math.abs(newTop - badge.top) > 0.001 ||
            scaleChanged
          ) {
            dirty = true
            return {
              ...badge,
              left: newLeft,
              top: newTop,
              style: scaleChanged
                ? {
                    ...badge.style,
                    fontSize: Math.round(badge.style.fontSize * styleScale),
                    paddingX: Math.round(badge.style.paddingX * styleScale),
                    paddingY: Math.round(badge.style.paddingY * styleScale),
                    borderRadius: Math.round(badge.style.borderRadius * styleScale),
                  }
                : badge.style,
            }
          }
          return badge
        })
        if (dirty) slidePatch.badges = next
      }

      // Sync highlight source rect + popup positions/sizes. Each highlight has
      // up to two canvas objects (source rect + popup image) tagged with
      // highlightId. We rebuild the slide.highlights array by reading current
      // positions back out and normalizing to fractions.
      const hlSourceObjs = objects.filter(
        (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.HIGHLIGHT_SOURCE,
      )
      const hlPopupObjs = objects.filter(
        (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.HIGHLIGHT_POPUP,
      )
      if ((hlSourceObjs.length > 0 || hlPopupObjs.length > 0) && slide.highlights) {
        // Find screen bounds by inspecting the screenshot's clipPath (it tracks
        // the visible window). Falls back to canvas if no screenshot.
        const shotObj = objects.find(
          (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.SCREENSHOT,
        ) as (FabricImage & { clipPath?: Rect }) | undefined
        const clip = shotObj?.clipPath
        const cw = canvas.width ?? 1
        const ch = canvas.height ?? 1
        const sb = clip
          ? {
              left: clip.left ?? 0,
              top: clip.top ?? 0,
              width: (clip.width ?? cw) * (clip.scaleX ?? 1),
              height: (clip.height ?? ch) * (clip.scaleY ?? 1),
            }
          : { left: 0, top: 0, width: cw, height: ch }

        let dirty = false
        const next: Highlight[] = slide.highlights.map((h) => {
          let n: Highlight = h
          const src = hlSourceObjs.find(
            (o) => (o as FabricObject & { highlightId?: string }).highlightId === h.id,
          )
          if (src) {
            const sLeft = src.left ?? 0
            const sTop = src.top ?? 0
            const sW = (src.width ?? 0) * (src.scaleX ?? 1)
            const sH = (src.height ?? 0) * (src.scaleY ?? 1)
            const nx = clamp01((sLeft - sb.left) / sb.width)
            const ny = clamp01((sTop - sb.top) / sb.height)
            const nw = clamp01(sW / sb.width)
            const nh = clamp01(sH / sb.height)
            const sr = h.sourceRegion
            if (
              Math.abs(nx - sr.x) > 0.001 ||
              Math.abs(ny - sr.y) > 0.001 ||
              Math.abs(nw - sr.w) > 0.001 ||
              Math.abs(nh - sr.h) > 0.001
            ) {
              n = { ...n, sourceRegion: { x: nx, y: ny, w: nw, h: nh } }
              dirty = true
            }
          }
          const pop = hlPopupObjs.find(
            (o) => (o as FabricObject & { highlightId?: string }).highlightId === h.id,
          )
          if (pop) {
            const pW = (pop.width ?? 0) * (pop.scaleX ?? 1)
            const pH = (pop.height ?? 0) * (pop.scaleY ?? 1)
            const pCx = (pop.left ?? 0) + pW / 2
            const pCy = (pop.top ?? 0) + pH / 2
            const nx = clamp01(pCx / cw)
            const ny = clamp01(pCy / ch)
            const nWidth = clamp01(pW / cw)
            if (
              Math.abs(nx - h.popup.x) > 0.001 ||
              Math.abs(ny - h.popup.y) > 0.001 ||
              Math.abs(nWidth - h.popup.width) > 0.002
            ) {
              n = { ...n, popup: { ...n.popup, x: nx, y: ny, width: nWidth } }
              dirty = true
            }
          }
          return n
        })
        if (dirty) slidePatch.highlights = next
      }

      // Sync ornament positions/rotations after drag/scale/rotate.
      const ornamentsOnCanvas = objects.filter(
        (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.ORNAMENT,
      )
      if (ornamentsOnCanvas.length > 0 && slide.ornaments) {
        const w = canvas.width ?? 1
        const h = canvas.height ?? 1
        let dirty = false
        const next = slide.ornaments.map((orn) => {
          const fab = ornamentsOnCanvas.find(
            (o) => (o as FabricObject & { ornamentId?: string }).ornamentId === orn.id,
          )
          if (!fab) return orn
          const left = fab.left ?? 0
          const top = fab.top ?? 0
          const newX = left / w
          const newY = top / h
          const newRot = Math.round(fab.angle ?? 0)
          // Size: fabric scaleX × shape viewBox / canvasW = ratio
          const scaleX = fab.scaleX ?? 1
          const newSize = (getOrnamentViewBox(orn.shape) * scaleX) / w
          if (
            Math.abs(newX - orn.x) > 0.001 ||
            Math.abs(newY - orn.y) > 0.001 ||
            newRot !== orn.rotation ||
            Math.abs(newSize - orn.size) > 0.002
          ) {
            dirty = true
            return { ...orn, x: newX, y: newY, rotation: newRot, size: newSize }
          }
          return orn
        })
        if (dirty) slidePatch.ornaments = next
      }

      if (Object.keys(slidePatch).length > 0) {
        onSlideChangeRef.current(slidePatch)
      }
    }

    // Track last body position while dragging so we can translate the rest of
    // the device (decorative paths + screenshot + clip) along with it without
    // having to re-render the whole template every mousemove.
    const lastBodyPos = useRef<{ left: number; top: number } | null>(null)

    function handleDeviceMove(canvas: Canvas, body: FabricObject) {
      const last = lastBodyPos.current
      if (!last) {
        lastBodyPos.current = { left: body.left ?? 0, top: body.top ?? 0 }
        return
      }
      const dx = (body.left ?? 0) - last.left
      const dy = (body.top ?? 0) - last.top
      if (dx === 0 && dy === 0) return
      for (const obj of canvas.getObjects()) {
        if (obj === body) continue
        const ln = (obj as FabricObject & { layerName?: string }).layerName
        if (ln !== LAYER_NAMES.DEVICE_FRAME && ln !== LAYER_NAMES.SCREENSHOT) continue
        obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy })
        const clip = (obj as FabricObject & { clipPath?: FabricObject }).clipPath
        if (clip) {
          clip.set({ left: (clip.left ?? 0) + dx, top: (clip.top ?? 0) + dy })
        }
        obj.setCoords()
      }
      lastBodyPos.current = { left: body.left ?? 0, top: body.top ?? 0 }
    }

    useImperativeHandle(ref, () => ({
      undo() {
        const canvas = fabricRef.current
        if (!canvas || undoStack.current.length === 0) return
        isApplyingHistory.current = true

        if (baselineRef.current) redoStack.current.push(baselineRef.current)
        const prev = undoStack.current.pop()!
        baselineRef.current = prev
        canvas.loadFromJSON(prev).then(() => {
          canvas.renderAll()
          isApplyingHistory.current = false
          notifyHistory()
          syncToZustand(canvas)
        })
      },
      redo() {
        const canvas = fabricRef.current
        if (!canvas || redoStack.current.length === 0) return
        isApplyingHistory.current = true

        if (baselineRef.current) undoStack.current.push(baselineRef.current)
        const next = redoStack.current.pop()!
        baselineRef.current = next
        canvas.loadFromJSON(next).then(() => {
          canvas.renderAll()
          isApplyingHistory.current = false
          notifyHistory()
          syncToZustand(canvas)
        })
      },
      deleteSelected() {
        const canvas = fabricRef.current
        const slide = activeSlideRef.current
        if (!canvas || !slide) return
        const active = canvas.getActiveObject()
        if (!active || (active as Textbox).isEditing) return
        const ln = (active as FabricObject & { layerName?: string }).layerName

        // syncToZustand only reads back objects that still exist on the canvas,
        // so a delete has to remove the store entry directly — same path the
        // properties-panel delete buttons use. Only per-instance content layers
        // are deletable; text / device / background are structural.
        const a = active as FabricObject & {
          badgeId?: string
          ornamentId?: string
          highlightId?: string
        }
        let patch: Partial<Slide> | null = null
        if (ln === LAYER_NAMES.BADGE && a.badgeId) {
          patch = { badges: (slide.badges ?? []).filter((b) => b.id !== a.badgeId) }
        } else if (ln === LAYER_NAMES.ORNAMENT && a.ornamentId) {
          patch = { ornaments: (slide.ornaments ?? []).filter((o) => o.id !== a.ornamentId) }
        } else if (
          (ln === LAYER_NAMES.HIGHLIGHT_SOURCE || ln === LAYER_NAMES.HIGHLIGHT_POPUP) &&
          a.highlightId
        ) {
          patch = { highlights: (slide.highlights ?? []).filter((h) => h.id !== a.highlightId) }
        }
        if (!patch) return
        canvas.discardActiveObject()
        canvas.renderAll()
        onSlideChangeRef.current(patch)
      },
      duplicateSelected() {
        const canvas = fabricRef.current
        const slide = activeSlideRef.current
        if (!canvas || !slide) return
        const active = canvas.getActiveObject()
        if (!active || (active as Textbox).isEditing) return
        const ln = (active as FabricObject & { layerName?: string }).layerName
        const a = active as FabricObject & {
          badgeId?: string
          ornamentId?: string
          highlightId?: string
        }
        // Clone the store entry with a fresh id, offset slightly so the copy is
        // visible and not stacked exactly on the original.
        let patch: Partial<Slide> | null = null
        if (ln === LAYER_NAMES.BADGE && a.badgeId) {
          const src = (slide.badges ?? []).find((b) => b.id === a.badgeId)
          if (src)
            patch = {
              badges: [
                ...(slide.badges ?? []),
                { ...src, id: newId('badge'), translations: { ...src.translations }, top: Math.min(0.92, src.top + 0.05) },
              ],
            }
        } else if (ln === LAYER_NAMES.ORNAMENT && a.ornamentId) {
          const src = (slide.ornaments ?? []).find((o) => o.id === a.ornamentId)
          if (src)
            patch = {
              ornaments: [
                ...(slide.ornaments ?? []),
                { ...src, id: newId('orn'), x: clamp01(src.x + 0.03), y: clamp01(src.y + 0.03) },
              ],
            }
        } else if (
          (ln === LAYER_NAMES.HIGHLIGHT_SOURCE || ln === LAYER_NAMES.HIGHLIGHT_POPUP) &&
          a.highlightId
        ) {
          const src = (slide.highlights ?? []).find((h) => h.id === a.highlightId)
          if (src)
            patch = {
              highlights: [
                ...(slide.highlights ?? []),
                {
                  ...src,
                  id: newId('hl'),
                  sourceRegion: {
                    ...src.sourceRegion,
                    x: clamp01(src.sourceRegion.x + 0.03),
                    y: clamp01(src.sourceRegion.y + 0.03),
                  },
                  popup: { ...src.popup, x: clamp01(src.popup.x + 0.03), y: clamp01(src.popup.y + 0.03) },
                },
              ],
            }
        }
        if (!patch) return
        canvas.discardActiveObject()
        canvas.renderAll()
        onSlideChangeRef.current(patch)
      },
      discardSelection() {
        const canvas = fabricRef.current
        if (!canvas) return
        const active = canvas.getActiveObject()
        if (active && (active as Textbox).isEditing) {
          ;(active as Textbox).exitEditing()
        }
        canvas.discardActiveObject()
        canvas.renderAll()
      },
      nudgeSelected(dx, dy) {
        const canvas = fabricRef.current
        if (!canvas) return
        const active = canvas.getActiveObject()
        if (!active || (active as Textbox).isEditing) return
        const ln = (active as FabricObject & { layerName?: string }).layerName

        // Only layers whose position syncToZustand reads back can be nudged.
        // Caption text is template-positioned (its position is never synced, so
        // it would snap back) and the background isn't movable.
        const NUDGEABLE: string[] = [
          LAYER_NAMES.DEVICE_FRAME,
          LAYER_NAMES.BADGE,
          LAYER_NAMES.ORNAMENT,
          LAYER_NAMES.HIGHLIGHT_SOURCE,
          LAYER_NAMES.HIGHLIGHT_POPUP,
        ]
        if (!ln || !NUDGEABLE.includes(ln)) return

        if (ln === LAYER_NAMES.DEVICE_FRAME) {
          // Drag siblings (screenshot, decorative paths, clip) along with the
          // body, reusing the same delta logic as a pointer drag.
          lastBodyPos.current = { left: active.left ?? 0, top: active.top ?? 0 }
          active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy })
          handleDeviceMove(canvas, active)
        } else {
          active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy })
          const clip = (active as FabricObject & { clipPath?: FabricObject }).clipPath
          if (clip && (clip as FabricObject & { absolutePositioned?: boolean }).absolutePositioned) {
            clip.set({ left: (clip.left ?? 0) + dx, top: (clip.top ?? 0) + dy })
          }
        }
        active.setCoords()
        lastBodyPos.current = null
        canvas.renderAll()
        pushHistory(canvas)
        syncToZustand(canvas)
      },
    }))

    // Initialize Fabric canvas once
    useEffect(() => {
      const el = canvasElRef.current
      if (!el) return

      const urlCache = urlCacheRef.current
      const canvas = new Canvas(el, {
        selection: true,
        preserveObjectStacking: true,
      })
      fabricRef.current = canvas
      // Expose a small, stable inspection surface for automated browser tests
      // (Playwright / Claude-in-Chrome). Keep it tiny and read-only-shaped.
      ;(window as unknown as { __editor: object }).__editor = {
        canvas,
        getState: () => ({
          width: canvas.width,
          height: canvas.height,
          objects: canvas.getObjects().map((o) => {
            const ln = (o as FabricObject & { layerName?: string }).layerName
            const base = o as FabricObject & DeviceAnchorProps
            return {
              type: o.type,
              layerName: ln,
              left: o.left,
              top: o.top,
              width: o.width,
              height: o.height,
              text: (o as Textbox).text,
              selectable: o.selectable,
              evented: o.evented,
              baseLeft: base._baseLeft,
              baseTop: base._baseTop,
            }
          }),
        }),
        findByLayer: (name: string) =>
          canvas.getObjects().find(
            (o) => (o as FabricObject & { layerName?: string }).layerName === name,
          ) ?? null,
      }

      canvas.on('mouse:down', () => {
        lastBodyPos.current = null
      })

      canvas.on('object:moving', (e) => {
        const target = e.target
        if (!target) return
        const ln = (target as FabricObject & { layerName?: string }).layerName
        if (ln === LAYER_NAMES.DEVICE_FRAME) {
          handleDeviceMove(canvas, target)
        } else if (ln === LAYER_NAMES.HIGHLIGHT_POPUP) {
          // Popup uses an absolutely-positioned clipPath; keep it pinned to the
          // image's current position so the rounded mask doesn't lag behind
          // during the drag.
          const clip = (target as FabricObject & { clipPath?: Rect }).clipPath
          if (clip) {
            clip.set({ left: target.left ?? 0, top: target.top ?? 0 })
          }
        }
      })

      // Same clipPath fix as object:moving but for scale operations — the popup
      // mask needs to grow/shrink with the image.
      canvas.on('object:scaling', (e) => {
        const target = e.target
        if (!target) return
        const ln = (target as FabricObject & { layerName?: string }).layerName
        if (ln !== LAYER_NAMES.HIGHLIGHT_POPUP) return
        const clip = (target as FabricObject & { clipPath?: Rect }).clipPath
        if (!clip) return
        const w = (target.width ?? 0) * (target.scaleX ?? 1)
        const h = (target.height ?? 0) * (target.scaleY ?? 1)
        const r = Math.min(w, h) * 0.06
        clip.set({
          left: target.left ?? 0,
          top: target.top ?? 0,
          width: w,
          height: h,
          rx: r,
          ry: r,
          scaleX: 1,
          scaleY: 1,
        })
      })

      canvas.on('object:modified', (e) => {
        lastBodyPos.current = null
        // Inside an ActiveSelection, child left/top are relative to the group
        // center — syncToZustand reads them as absolute and would corrupt the
        // stored positions. Disbanding first bakes the group transform back
        // into each child so their coords are absolute again before we sync.
        if (canvas.getActiveObject()?.type === 'activeselection') {
          canvas.discardActiveObject()
        }
        pushHistory(canvas)
        syncToZustand(canvas, e.target)
      })

      // Sync text edits when editing exits
      canvas.on('text:editing:exited', () => {
        pushHistory(canvas)
        syncToZustand(canvas)
      })

      return () => {
        canvas.dispose()
        urlCache.revokeAll()
        fabricRef.current = null
        // Reset render-state refs so a fresh canvas (e.g. StrictMode remount)
        // doesn't bail out of the apply effect because the refs still match.
        prevSlideId.current = null
        prevSlideDataRef.current = ''
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Single source of truth for re-rendering the canvas.
    // Re-applies the template whenever the slide id changes OR when any
    // rendered-into-canvas field changes for the same slide. The two used to
    // be separate effects with the same [activeSlide] dependency, which raced
    // and produced ghosted/double renders.
    const prevSlideDataRef = useRef<string>('')
    const prevGroupedRef = useRef<boolean>(false)
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas || !activeSlide) return

      const serialized = JSON.stringify({
        background: activeSlide.background,
        template: activeSlide.template,
        headline: activeSlide.headline,
        subheadline: activeSlide.subheadline,
        deviceFrame: activeSlide.deviceFrame,
        screenshotKey: activeSlide.screenshot?.imageKey ?? null,
        screenshotStyle: activeSlide.screenshotStyle,
        badges: activeSlide.badges,
        ornaments: activeSlide.ornaments,
        highlights: activeSlide.highlights,
        // Include grouped state in the cache key so toggling link/unlink
        // forces a re-render even when the slide data didn't change.
        isGrouped,
      })

      const slideChanged = prevSlideId.current !== activeSlide.id
      const dataChanged = prevSlideDataRef.current !== serialized
      const groupedChanged = prevGroupedRef.current !== isGrouped
      if (!slideChanged && !dataChanged && !groupedChanged) return

      const freshLoad = slideChanged || groupedChanged
      if (freshLoad) {
        undoStack.current = []
        redoStack.current = []
        baselineRef.current = null
        notifyHistory()
        // History (which embeds these blob URLs in its snapshots) is gone, so
        // the cached URLs from the previous slide/grouping are now unreachable.
        urlCacheRef.current.revokeAll()
      }
      prevSlideId.current = activeSlide.id
      prevSlideDataRef.current = serialized
      prevGroupedRef.current = isGrouped

      ;(async () => {
        // Span groups: render leader's data onto a 2× wide canvas and lay a
        // dashed seam guide on top. Editor-only — export takes a different
        // code path that crops the wide render into L/R halves.
        const h = getEditorCanvasHeight(activeSlide!)
        const resolveUrl = urlCacheRef.current.get
        if (isGrouped) {
          const w = EDITOR_CANVAS_WIDTH * 2
          await applyTemplate(canvas, activeSlide!, { width: w, height: h }, { spanCentered: true, resolveUrl })
          addSpanSeamGuide(canvas, w / 2, h)
        } else {
          await applyTemplate(canvas, activeSlide!, undefined, { resolveUrl })
        }
        // The rendered canvas is the present state → adopt it as the undo
        // baseline on every render. Doing this only on fresh loads would leave
        // the baseline stale after store-driven changes (panel add/delete/edit),
        // so the next drag's undo would revert to a pre-add state and drop the
        // object. Stacks are still only cleared on a fresh load (above).
        baselineRef.current = takeSnapshot(canvas)
        notifyHistory()
      })()
    }, [activeSlide, isGrouped])

    return (
      <div className="relative flex items-start justify-center">
        <canvas ref={canvasElRef} />
      </div>
    )
  },
)
