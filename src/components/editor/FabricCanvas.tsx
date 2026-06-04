import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Canvas, FabricImage, Line, Rect, Textbox } from 'fabric'
import type { FabricObject } from 'fabric'
import type { Highlight, ScreenshotCrop, Slide } from '../../types/project'
import { applyTemplate, attachCropControls, DEFAULT_SHOT_STYLE, EMPTY_CROP } from '../../canvas/templateLayouts'
import { normalizeAngle, rotateAround } from '../../canvas/geometry'
import { canvasPointToRegionOrigin } from '../../canvas/objects/highlight'
import { awaitSlideFonts } from '../../lib/fonts'
import { createImageUrlCache, type ImageUrlCache } from '../../lib/imageStore'
import { LAYER_NAMES } from '../../canvas/layerNames'
import { computeSnap, type SnapBox } from '../../canvas/snapGuides'
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

const DRAG_GUIDE_LAYER = 'drag-guide'
const SNAP_PX = 6 // screen-px proximity at which an edge/center snaps to a guide
const GUIDE_PADDING_RATIO = 0.04 // safe-margin lines this far in from each edge

function clearDragGuides(canvas: Canvas): void {
  for (const o of canvas.getObjects()) {
    if ((o as FabricObject & { layerName?: string }).layerName === DRAG_GUIDE_LAYER) {
      canvas.remove(o)
    }
  }
}

function addGuideLine(canvas: Canvas, coords: [number, number, number, number]): void {
  const line = new Line(coords, {
    stroke: 'rgba(236, 72, 153, 0.85)',
    strokeWidth: 1,
    selectable: false,
    evented: false,
    hoverCursor: 'default',
    excludeFromExport: true,
  })
  ;(line as unknown as { layerName: string }).layerName = DRAG_GUIDE_LAYER
  canvas.add(line)
}

// Axis-aligned bbox in model (un-zoomed) coords. Center ± scaled size ignores
// rotation — fine for an alignment hint.
function boxOf(obj: FabricObject): SnapBox {
  const c = obj.getCenterPoint()
  const hw = obj.getScaledWidth() / 2
  const hh = obj.getScaledHeight() / 2
  return { left: c.x - hw, centerX: c.x, right: c.x + hw, top: c.y - hh, centerY: c.y, bottom: c.y + hh }
}

// Snap the dragged object to the nearest alignment guide — canvas center, safe
// margins, and every other object's edges/centers — then draw the coincident
// lines. Works in model coords (canvas.width is zoom-scaled, so divide by zoom)
// and snaps BEFORE the device/popup move math runs so siblings track the snap.
function applySnapGuides(canvas: Canvas, target: FabricObject, ln: string | undefined): void {
  clearDragGuides(canvas)
  const zoom = canvas.getZoom() || 1
  const w = (canvas.width ?? 0) / zoom
  const h = (canvas.height ?? 0) / zoom
  const pad = Math.round(w * GUIDE_PADDING_RATIO)
  const threshold = SNAP_PX / zoom

  const candX = [w / 2, pad, w - pad]
  const candY = [h / 2, pad, h - pad]
  const isDevice = ln === LAYER_NAMES.DEVICE_FRAME
  for (const o of canvas.getObjects()) {
    if (o === target) continue
    const oln = (o as FabricObject & { layerName?: string }).layerName
    if (!oln || oln === DRAG_GUIDE_LAYER || oln === SEAM_LAYER || oln === LAYER_NAMES.BACKGROUND) continue
    // The screenshot moves with the device — don't let the device snap to it.
    if (isDevice && oln === LAYER_NAMES.SCREENSHOT) continue
    const b = boxOf(o)
    candX.push(b.left, b.centerX, b.right)
    candY.push(b.top, b.centerY, b.bottom)
  }

  const r = computeSnap(boxOf(target), candX, candY, threshold)
  if (r.dx !== 0 || r.dy !== 0) {
    target.set({ left: (target.left ?? 0) + r.dx, top: (target.top ?? 0) + r.dy })
    target.setCoords()
  }
  for (const x of r.vLines) addGuideLine(canvas, [x, 0, x, h])
  for (const y of r.hLines) addGuideLine(canvas, [0, y, w, y])
}

// Custom props we stash on the device-body Path so we can compute its offset
// from drag end position without re-deriving template anchors. The raw (un-
// rotated) anchors + pivot let sync re-derive the base at whatever angle an
// mtr drag ends on; _crop carries the floating card's edge trim.
interface DeviceAnchorProps {
  _baseRawLeft?: number
  _baseRawTop?: number
  _basePivotX?: number
  _basePivotY?: number
  _crop?: ScreenshotCrop
  _fullW?: number
  _fullH?: number
}

// Identity used to re-find a selected object after undo/redo replaces every
// object via loadFromJSON. layerName alone identifies the structural singletons;
// per-instance content layers also need their id.
type ObjIdentity = {
  layerName?: string
  badgeId?: string
  ornamentId?: string
  highlightId?: string
}
type IdentifiedObject = FabricObject & ObjIdentity

function objIdentity(o: FabricObject): ObjIdentity {
  const x = o as IdentifiedObject
  return { layerName: x.layerName, badgeId: x.badgeId, ornamentId: x.ornamentId, highlightId: x.highlightId }
}

function findByIdentity(canvas: Canvas, id: ObjIdentity): FabricObject | null {
  if (!id.layerName) return null
  return (
    canvas.getObjects().find((o) => {
      const x = o as IdentifiedObject
      return (
        x.layerName === id.layerName &&
        x.badgeId === id.badgeId &&
        x.ornamentId === id.ornamentId &&
        x.highlightId === id.highlightId
      )
    }) ?? null
  )
}

// Single-object selection identity to carry across an undo/redo reload.
// Multi-selection (ActiveSelection) isn't restored: its children's coords are
// group-relative and re-grouping after loadFromJSON isn't worth the complexity.
function selectionIdentityToRestore(canvas: Canvas): ObjIdentity | null {
  const active = canvas.getActiveObject()
  if (!active || active.type === 'activeselection') return null
  return objIdentity(active)
}

function restoreSelection(canvas: Canvas, id: ObjIdentity | null): void {
  if (!id) return
  const obj = findByIdentity(canvas, id)
  if (obj && obj.selectable !== false) canvas.setActiveObject(obj)
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
  /**
   * Span only: the follower slide. Its texts render on the right page (it owns
   * them), and text edits with owner 'follower' sync back to it via the second
   * argument of onSlideChange. All other layers stay the leader's.
   */
  followerSlide?: Slide | null
  /**
   * Per-locale edit mode: lock the shared-layout elements (badges, ornaments,
   * highlights) so only captions and the device frame can be tweaked for this
   * locale. EditorLayout routes the resulting edits into that locale's
   * overrides; shared elements stay editable only in the base/shared view.
   */
  lockSharedLayout?: boolean
  /** View-only magnification of the editor canvas. 1 = base size. */
  zoom?: number
  /** Second argument carries span-follower text edits (one atomic emit per sync). */
  onSlideChange: (patch: Partial<Slide>, followerPatch?: Partial<Slide>) => void
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void
  /** Ctrl/Cmd + wheel (and trackpad pinch) asks the parent to change zoom. */
  onZoomChange?: (next: number) => void
  /** Double-click on an object surfaces its layer (and, for span texts, its
   * owning half) so the panel can open the right tab on the right slide. */
  onElementActivate?: (layerName: string | null, owner?: 'leader' | 'follower') => void
}

// Elements that belong to the shared base layout (not per-locale). Locked in
// locale edit mode so a locale tweak can't move content meant to stay common.
const SHARED_LAYER_NAMES = new Set<string>([
  LAYER_NAMES.BADGE,
  LAYER_NAMES.ORNAMENT,
  LAYER_NAMES.HIGHLIGHT_POPUP,
])

const HISTORY_LIMIT = 50
// Custom per-object props that must survive a history snapshot → loadFromJSON
// round-trip, otherwise restored objects lose their identity and syncToZustand
// can't map them back to the store (positions would silently un-revert).
const HISTORY_PROPS = [
  'layerName', 'badgeId', 'ornamentId', 'highlightId', 'textIndex', 'owner',
  '_baseRawLeft', '_baseRawTop', '_basePivotX', '_basePivotY',
  '_crop', '_fullW', '_fullH', '_screenBounds', '_renderRot',
]

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export const FabricCanvas = forwardRef<FabricCanvasHandle, Props>(
  function FabricCanvas({ activeSlide, isGrouped = false, followerSlide = null, lockSharedLayout = false, zoom = 1, onSlideChange, onHistoryChange, onZoomChange, onElementActivate }, ref) {
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<Canvas | null>(null)
    // Zoom is a pure view transform: the template always lays out at base dims,
    // then setZoom + setDimensions scale the rendered view (pointer mapping
    // stays correct, unlike a CSS transform on the canvas element).
    const zoomRef = useRef(zoom)
    const baseDimsRef = useRef<{ w: number; h: number } | null>(null)
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
    const followerSlideRef = useRef(followerSlide)
    const onHistoryChangeRef = useRef(onHistoryChange)
    const onZoomChangeRef = useRef(onZoomChange)
    const onElementActivateRef = useRef(onElementActivate)

    useEffect(() => {
      onElementActivateRef.current = onElementActivate
    })
    useEffect(() => {
      onSlideChangeRef.current = onSlideChange
    })
    useEffect(() => {
      activeSlideRef.current = activeSlide
    })
    useEffect(() => {
      followerSlideRef.current = followerSlide
    })
    useEffect(() => {
      onHistoryChangeRef.current = onHistoryChange
    })
    useEffect(() => {
      onZoomChangeRef.current = onZoomChange
    })

    // Scale the just-rendered (base-size) canvas to the current zoom.
    function applyZoom(canvas: Canvas, z: number) {
      const base = baseDimsRef.current
      if (!base) return
      canvas.setDimensions({ width: Math.round(base.w * z), height: Math.round(base.h * z) })
      canvas.setZoom(z)
      canvas.requestRenderAll()
    }

    // Re-apply when zoom changes on its own (no slide re-render).
    useEffect(() => {
      zoomRef.current = zoom
      const canvas = fabricRef.current
      if (canvas) applyZoom(canvas, zoom)
    }, [zoom])

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
      // raw anchors in templateLayouts.
      for (const obj of canvas.getObjects()) {
        const o = obj as FabricObject & DeviceAnchorProps & { layerName?: string }
        if (o.layerName === LAYER_NAMES.DEVICE_FRAME && typeof o._baseRawLeft === 'number') {
          return o
        }
      }
      return null
    }

    // loadFromJSON rebuilds objects without their controls — re-attach the
    // floating handle's crop controls (its _crop/_fullW/_fullH props DO survive
    // via HISTORY_PROPS).
    function restoreCropControls(canvas: Canvas): void {
      const body = findDeviceBody(canvas)
      if (body?._crop) attachCropControls(body)
    }

    function syncToZustand(canvas: Canvas, movedTarget?: FabricObject) {
      const slide = activeSlideRef.current
      if (!slide) return
      const followerSlide = followerSlideRef.current

      const objects = canvas.getObjects()
      const slidePatch: Partial<Slide> = {}
      const followerPatch: Partial<Slide> = {}
      // Object coords stay in base (unzoomed) layout space, but canvas.width is
      // scaled by the current zoom (applyZoom sets dimensions to base × zoom).
      // Normalize against the base dims — otherwise a drag while zoomed ≠ 100%
      // stores a wrong ratio (text jumps to the wrong spot and the box width
      // balloons past the slide on the next render).
      const zoom = canvas.getZoom() || 1
      const cw = (canvas.width ?? 1) / zoom
      const ch = (canvas.height ?? 1) / zoom
      // On a span canvas each slide's text fractions normalize to its own page
      // (half the wide canvas), matching applyTemplate's per-page layout.
      const halfW = followerSlide ? cw / 2 : cw

      for (const obj of objects) {
        const ln = (obj as Textbox & { layerName?: string }).layerName
        if (ln === LAYER_NAMES.TEXT) {
          const itext = obj as Textbox & { textIndex?: number; owner?: 'leader' | 'follower' }
          const i = itext.textIndex ?? 0
          // Route by the owner tag: follower texts live on the follower slide.
          const isFollower = itext.owner === 'follower' && !!followerSlide
          const ownerSlide = isFollower ? followerSlide! : slide
          const ownerPatch = isFollower ? followerPatch : slidePatch
          const existing = ownerSlide.texts[i]
          if (!existing) continue
          // Seed from the current array (or a prior text patch in this same sync)
          // and replace only index i, so multiple text objects don't clobber.
          const texts = (ownerPatch.texts ?? ownerSlide.texts).slice()
          let next: typeof existing = {
            ...existing,
            text: itext.text ?? existing.text,
            style: {
              ...existing.style,
              fontSize: itext.fontSize ?? existing.style.fontSize,
              color: typeof itext.fill === 'string' ? itext.fill : existing.style.color,
              textAlign: (itext.textAlign as 'left' | 'center' | 'right') ?? existing.style.textAlign,
            },
          }
          // Persist position/width only when the user actually manipulated THIS
          // caption. Capturing on every sync would pin text that's still meant
          // to follow the template (e.g. after a device move or template switch).
          if (obj === movedTarget) {
            const c = itext.getCenterPoint()
            // Side-handle resize grows width (scaleX stays 1); fold in scaleX so
            // a corner-scale still bakes into the stored width.
            const boxW = (itext.width ?? 0) * (itext.scaleX ?? 1)
            // Page-local fraction: the follower's page starts at halfW. May
            // leave [0,1] when a text is dragged across the seam — ownership
            // stays with its slide, so don't clamp.
            const pageX = isFollower ? c.x - halfW : c.x
            next = {
              ...next,
              pos: { x: pageX / halfW, y: (itext.top ?? 0) / ch },
              // A text box can never be wider than one page.
              boxWidth: Math.min(boxW / halfW, 1),
            }
          }
          texts[i] = next
          ownerPatch.texts = texts
        }
      }

      const body = findDeviceBody(canvas)
      if (body && body._baseRawLeft !== undefined && body._baseRawTop !== undefined) {
        // An mtr drag leaves body.angle at the new tilt. Normalize to the
        // store's [-180, 180) range; re-derive the rotated base from the raw
        // anchors at THIS angle. Rotating about the body center vs the
        // render's device-center pivot differ — the offset absorbs the gap, so
        // the re-render lands exactly where the user left the card.
        const nextRotation = normalizeAngle(body.angle ?? 0)
        const base = nextRotation
          ? rotateAround(body._baseRawLeft, body._baseRawTop, body._basePivotX ?? 0, body._basePivotY ?? 0, nextRotation)
          : { x: body._baseRawLeft, y: body._baseRawTop }
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
        const nextOffsetX = Math.round((body.left ?? 0) - base.x + deltaW / 2)
        const nextOffsetY = Math.round((body.top ?? 0) - base.y + deltaH / 2)
        const curScale = slide.deviceFrame.scale ?? 1
        const proposedScale = curScale * scaleX
        // Keep the device within a sane range so users can't accidentally
        // make it vanish or overflow the canvas during a wild drag.
        const nextScale = Math.round(Math.max(0.3, Math.min(2.0, proposedScale)) * 100) / 100

        const curX = slide.deviceFrame.offsetX ?? 0
        const curY = slide.deviceFrame.offsetY ?? 0
        const scaleChanged = Math.abs(nextScale - curScale) > 0.001
        const rotationChanged = Math.abs(nextRotation - (slide.deviceFrame.rotation ?? 0)) > 0.05
        if (nextOffsetX !== curX || nextOffsetY !== curY || scaleChanged || rotationChanged) {
          slidePatch.deviceFrame = {
            ...slide.deviceFrame,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY,
            scale: nextScale,
            rotation: nextRotation,
          }
        }

        // Floating-card edge trim: the crop controls keep body._crop current,
        // and history snapshots carry it — so this same read path restores the
        // old crop on undo.
        if (body._crop) {
          const cur = slide.screenshotStyle?.crop ?? EMPTY_CROP
          const edges = ['top', 'right', 'bottom', 'left'] as const
          if (edges.some((k) => Math.abs(body._crop![k] - cur[k]) > 1e-4)) {
            slidePatch.screenshotStyle = { ...DEFAULT_SHOT_STYLE, ...slide.screenshotStyle, crop: body._crop }
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
        const w = cw
        const h = ch
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

      // Sync the loupe cards. A dragged card moves its sampling region: the
      // card's center maps back through the screen box (un-rotating with the
      // tilt the card was RENDERED at — _renderRot. A device move/rotate
      // gesture carries the card along AND keeps _renderRot/_screenBounds in
      // step, so the same inverse mapping derives the unchanged region).
      const hlPopupObjs = objects.filter(
        (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.HIGHLIGHT_POPUP,
      )
      if (hlPopupObjs.length > 0 && slide.highlights) {
        // Screen bounds the regions normalize against. Prefer the full box the
        // render stashed — the clipPath used to stand in for it, but crop
        // shrinks the clip and rotation tilts it, so it no longer matches the
        // space sourceRegion fractions live in.
        const shotObj = objects.find(
          (o) => (o as FabricObject & { layerName?: string }).layerName === LAYER_NAMES.SCREENSHOT,
        ) as (FabricImage & { clipPath?: Rect; _screenBounds?: { left: number; top: number; width: number; height: number } }) | undefined
        const clip = shotObj?.clipPath
        const sb = shotObj?._screenBounds
          ? shotObj._screenBounds
          : clip
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
          const pop = hlPopupObjs.find(
            (o) => (o as FabricObject & { highlightId?: string }).highlightId === h.id,
          ) as (FabricObject & { _renderRot?: number }) | undefined
          if (pop) {
            const pW = (pop.width ?? 0) * (pop.scaleX ?? 1)
            // getCenterPoint is rotation-safe; left/top + w/2 is not once the
            // card can tilt.
            const c = pop.getCenterPoint()
            const sr = h.sourceRegion
            const origin = canvasPointToRegionOrigin(
              sb,
              { w: sr.w, h: sr.h },
              c,
              pop._renderRot ?? 0,
            )
            const nWidth = clamp01(pW / cw)
            const nRot = normalizeAngle(pop.angle ?? 0)
            if (
              Math.abs(origin.x - sr.x) > 0.001 ||
              Math.abs(origin.y - sr.y) > 0.001 ||
              Math.abs(nWidth - h.popup.width) > 0.002 ||
              Math.abs(nRot - (h.popup.rotation ?? 0)) > 0.05
            ) {
              n = {
                ...n,
                sourceRegion: { ...sr, x: origin.x, y: origin.y },
                popup: { ...n.popup, width: nWidth, rotation: nRot },
              }
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
        const w = cw
        const h = ch
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
          // Emoji glyphs are Text — recover size from the scaled glyph width.
          const newSize = fab.getScaledWidth() / w
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

      const hasFollowerPatch = Object.keys(followerPatch).length > 0
      if (Object.keys(slidePatch).length > 0 || hasFollowerPatch) {
        onSlideChangeRef.current(slidePatch, hasFollowerPatch ? followerPatch : undefined)
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
        if (ln !== LAYER_NAMES.DEVICE_FRAME && ln !== LAYER_NAMES.SCREENSHOT && ln !== LAYER_NAMES.HIGHLIGHT_POPUP) continue
        obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy })
        const clip = (obj as FabricObject & { clipPath?: FabricObject }).clipPath
        if (clip) {
          clip.set({ left: (clip.left ?? 0) + dx, top: (clip.top ?? 0) + dy })
        }
        // Shift the screen-box stash with the shot so the loupe sync still maps
        // the (also shifted) card center back to the unchanged region.
        const stash = obj as FabricObject & { _screenBounds?: { left: number; top: number; width: number; height: number } }
        if (stash._screenBounds) {
          stash._screenBounds = { ...stash._screenBounds, left: stash._screenBounds.left + dx, top: stash._screenBounds.top + dy }
        }
        obj.setCoords()
      }
      lastBodyPos.current = { left: body.left ?? 0, top: body.top ?? 0 }
    }

    // mtr-drag counterpart of handleDeviceMove: spin the rest of the device
    // (decorative paths + screenshot + clip) around the body's center — which
    // centeredRotation keeps fixed mid-drag — by the per-tick angle delta.
    const lastBodyAngle = useRef<number | null>(null)

    function handleDeviceRotate(canvas: Canvas, body: FabricObject) {
      // First tick: the render-time angle is the slide's stored rotation.
      const last = lastBodyAngle.current ?? (activeSlideRef.current?.deviceFrame.rotation ?? 0)
      const angle = body.angle ?? 0
      // Normalize so a drag crossing the ±180° seam doesn't spin siblings 360°.
      const delta = ((angle - last + 540) % 360) - 180
      lastBodyAngle.current = angle
      if (!delta) return
      const pivot = body.getCenterPoint()
      for (const obj of canvas.getObjects()) {
        if (obj === body) continue
        const ln = (obj as FabricObject & { layerName?: string }).layerName
        if (ln === LAYER_NAMES.HIGHLIGHT_POPUP) {
          // The loupe rides its region's pixel position but keeps its own tilt:
          // orbit the card's center around the pivot without spinning it.
          const o = obj as FabricObject & { clipPath?: FabricObject; _renderRot?: number }
          const c = obj.getCenterPoint()
          const nc = rotateAround(c.x, c.y, pivot.x, pivot.y, delta)
          obj.set({ left: (obj.left ?? 0) + nc.x - c.x, top: (obj.top ?? 0) + nc.y - c.y })
          if (o.clipPath) {
            o.clipPath.set({ left: (o.clipPath.left ?? 0) + nc.x - c.x, top: (o.clipPath.top ?? 0) + nc.y - c.y })
            obj.dirty = true
          }
          // Sync un-rotates the card center with the tilt it was rendered at —
          // the gesture has effectively re-rendered it at +delta.
          o._renderRot = (o._renderRot ?? 0) + delta
          obj.setCoords()
          continue
        }
        if (ln !== LAYER_NAMES.DEVICE_FRAME && ln !== LAYER_NAMES.SCREENSHOT) continue
        const p = rotateAround(obj.left ?? 0, obj.top ?? 0, pivot.x, pivot.y, delta)
        obj.set({ left: p.x, top: p.y, angle: (obj.angle ?? 0) + delta })
        const clip = (obj as FabricObject & { clipPath?: FabricObject }).clipPath
        if (clip) {
          const cp = rotateAround(clip.left ?? 0, clip.top ?? 0, pivot.x, pivot.y, delta)
          clip.set({ left: cp.x, top: cp.y, angle: (clip.angle ?? 0) + delta })
          ;(obj as FabricObject).dirty = true
        }
        // Swing the screen-box stash's center around the pivot too, so the
        // loupe sync (which un-rotates about the stash center) keeps deriving
        // the unchanged region from the orbited card.
        const stash = obj as FabricObject & { _screenBounds?: { left: number; top: number; width: number; height: number } }
        if (stash._screenBounds) {
          const s = stash._screenBounds
          const sc = rotateAround(s.left + s.width / 2, s.top + s.height / 2, pivot.x, pivot.y, delta)
          stash._screenBounds = { ...s, left: sc.x - s.width / 2, top: sc.y - s.height / 2 }
        }
        obj.setCoords()
      }
    }

    useImperativeHandle(ref, () => ({
      undo() {
        const canvas = fabricRef.current
        if (!canvas || undoStack.current.length === 0) return
        isApplyingHistory.current = true

        const selId = selectionIdentityToRestore(canvas)
        if (baselineRef.current) redoStack.current.push(baselineRef.current)
        const prev = undoStack.current.pop()!
        baselineRef.current = prev
        canvas.loadFromJSON(prev).then(() => {
          restoreCropControls(canvas)
          restoreSelection(canvas, selId)
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

        const selId = selectionIdentityToRestore(canvas)
        if (baselineRef.current) undoStack.current.push(baselineRef.current)
        const next = redoStack.current.pop()!
        baselineRef.current = next
        canvas.loadFromJSON(next).then(() => {
          restoreCropControls(canvas)
          restoreSelection(canvas, selId)
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
        } else if (ln === LAYER_NAMES.HIGHLIGHT_POPUP && a.highlightId) {
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
        } else if (ln === LAYER_NAMES.HIGHLIGHT_POPUP && a.highlightId) {
          const src = (slide.highlights ?? []).find((h) => h.id === a.highlightId)
          if (src)
            patch = {
              highlights: [
                ...(slide.highlights ?? []),
                {
                  ...src,
                  id: newId('hl'),
                  // The card is glued to its region — shifting the region is
                  // what un-stacks the copy.
                  sourceRegion: {
                    ...src.sourceRegion,
                    x: clamp01(src.sourceRegion.x + 0.03),
                    y: clamp01(src.sourceRegion.y + 0.03),
                  },
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
              angle: o.angle,
              text: (o as Textbox).text,
              selectable: o.selectable,
              evented: o.evented,
              crop: base._crop,
            }
          }),
        }),
        findByLayer: (name: string) =>
          canvas.getObjects().find(
            (o) => (o as FabricObject & { layerName?: string }).layerName === name,
          ) ?? null,
        // True once the first render adopted its undo baseline — before that,
        // object:modified has no pre-change state to push onto the undo stack.
        hasBaseline: () => baselineRef.current != null,
      }

      canvas.on('mouse:down', () => {
        lastBodyPos.current = null
        lastBodyAngle.current = null
      })

      canvas.on('object:rotating', (e) => {
        const target = e.target
        if (!target) return
        const ln = (target as FabricObject & { layerName?: string }).layerName
        if (ln === LAYER_NAMES.DEVICE_FRAME) {
          handleDeviceRotate(canvas, target)
        } else if (ln === LAYER_NAMES.HIGHLIGHT_POPUP) {
          // Keep the rounded mask glued to the spinning card — same shape, so
          // mirroring the anchor + angle is enough.
          const clip = (target as FabricObject & { clipPath?: Rect }).clipPath
          if (clip) {
            clip.set({ left: target.left ?? 0, top: target.top ?? 0, angle: target.angle ?? 0 })
          }
        }
      })

      // Double-click surfaces the object's layer so the panel can jump to the
      // matching tab. Background dblclick (no target) reports null.
      canvas.on('mouse:dblclick', (opt) => {
        const target = opt.target as (FabricObject & { layerName?: string; owner?: 'leader' | 'follower' }) | undefined
        onElementActivateRef.current?.(target?.layerName ?? null, target?.owner)
      })

      // Ctrl/Cmd + wheel (and trackpad pinch, which arrives as ctrlKey wheel)
      // zooms; a plain wheel is left alone so the canvas area can scroll.
      canvas.on('mouse:wheel', (opt) => {
        const e = opt.e as WheelEvent
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        e.stopPropagation()
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        onZoomChangeRef.current?.(zoomRef.current * factor)
      })

      canvas.on('object:moving', (e) => {
        const target = e.target
        if (!target) return
        const ln = (target as FabricObject & { layerName?: string }).layerName
        // Snap first so the device/popup coupling below reads the snapped position.
        applySnapGuides(canvas, target, ln)
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

      canvas.on('mouse:up', () => {
        clearDragGuides(canvas)
        canvas.requestRenderAll()
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
          angle: target.angle ?? 0,
          scaleX: 1,
          scaleY: 1,
        })
      })

      canvas.on('object:modified', (e) => {
        lastBodyPos.current = null
        lastBodyAngle.current = null
        // Drop guides before snapshotting so they never enter history/sync.
        clearDragGuides(canvas)
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
    const prevLockRef = useRef<boolean>(false)
    // Template renders await fonts/images, so two effect runs can overlap. Each
    // applyTemplate clears the canvas up front and then adds objects across
    // awaits — an older render resuming after a newer one would permanently
    // re-pollute the canvas with stale duplicates. Chain renders so they never
    // interleave, and skip any render that was superseded while it waited.
    const renderSeqRef = useRef(0)
    const renderChainRef = useRef<Promise<void>>(Promise.resolve())
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas || !activeSlide) return

      const serialized = JSON.stringify({
        background: activeSlide.background,
        template: activeSlide.template,
        texts: activeSlide.texts,
        deviceFrame: activeSlide.deviceFrame,
        screenshotKey: activeSlide.screenshot?.imageKey ?? null,
        screenshotStyle: activeSlide.screenshotStyle,
        badges: activeSlide.badges,
        ornaments: activeSlide.ornaments,
        highlights: activeSlide.highlights,
        // Include grouped state in the cache key so toggling link/unlink
        // forces a re-render even when the slide data didn't change.
        isGrouped,
        // The follower's texts render on the right page of a span — a panel
        // edit to them must repaint even though the leader didn't change.
        followerTexts: isGrouped ? followerSlide?.texts ?? null : null,
        followerTemplate: isGrouped ? followerSlide?.template ?? null : null,
        // A locale whose overrides match the base renders identical content, so
        // key on the lock too — otherwise entering such a locale wouldn't
        // re-render and shared elements would stay editable.
        lockSharedLayout,
      })

      const slideChanged = prevSlideId.current !== activeSlide.id
      const dataChanged = prevSlideDataRef.current !== serialized
      const groupedChanged = prevGroupedRef.current !== isGrouped
      const lockChanged = prevLockRef.current !== lockSharedLayout
      if (!slideChanged && !dataChanged && !groupedChanged) return

      // Crossing the base↔locale boundary must reset history: undo snapshots are
      // raw canvas states, so a base-mode undo onto a locale-resolved snapshot
      // (or vice-versa) would load the wrong layout and mis-sync.
      const freshLoad = slideChanged || groupedChanged || lockChanged
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
      prevLockRef.current = lockSharedLayout

      const seq = ++renderSeqRef.current
      renderChainRef.current = renderChainRef.current.then(async () => {
        // Superseded while waiting in the chain — the newest run renders the
        // latest data, so doing this one would only waste a clear+layout.
        if (seq !== renderSeqRef.current) return
        // Span groups: render leader's data onto a 2× wide canvas and lay a
        // dashed seam guide on top. Editor-only — export takes a different
        // code path that crops the wide render into L/R halves.
        const h = getEditorCanvasHeight(activeSlide!)
        const resolveUrl = urlCacheRef.current.get
        // Load fonts before layout so fit-to-box sizing and badge widths are
        // measured against the real glyphs and the undo baseline snapshots a
        // correct layout (Fabric caches text dimensions at layout time). Cheap
        // for Korean/Latin; only a JP preview waits on the Noto CDN.
        await awaitSlideFonts(activeSlide!)
        if (isGrouped && followerSlide) await awaitSlideFonts(followerSlide)
        // The canvas can be disposed while we await image/font loads (StrictMode
        // remount, fast slide/locale switch, unmount). Touching a disposed canvas
        // — setDimensions destructures a null element — throws, so bail here.
        if (fabricRef.current !== canvas || seq !== renderSeqRef.current) return
        if (isGrouped) {
          const w = EDITOR_CANVAS_WIDTH * 2
          await applyTemplate(canvas, activeSlide!, { width: w, height: h }, {
            spanCentered: true,
            resolveUrl,
            spanFollower: followerSlide
              ? { texts: followerSlide.texts, template: followerSlide.template }
              : undefined,
          })
          addSpanSeamGuide(canvas, w / 2, h)
        } else {
          await applyTemplate(canvas, activeSlide!, undefined, { resolveUrl })
        }
        if (fabricRef.current !== canvas) return
        // Locale edit mode: lock the shared-layout elements so only captions
        // and the device frame remain editable for this locale.
        if (lockSharedLayout) {
          canvas.discardActiveObject()
          for (const o of canvas.getObjects()) {
            const ln = (o as FabricObject & { layerName?: string }).layerName
            if (ln && SHARED_LAYER_NAMES.has(ln)) {
              o.selectable = false
              o.evented = false
            }
          }
        }
        canvas.selection = !lockSharedLayout
        // applyTemplate laid out at base dims; capture them, then scale to zoom.
        baseDimsRef.current = { w: canvas.width ?? EDITOR_CANVAS_WIDTH, h: canvas.height ?? h }
        applyZoom(canvas, zoomRef.current)
        // The rendered canvas is the present state → adopt it as the undo
        // baseline on every render. Doing this only on fresh loads would leave
        // the baseline stale after store-driven changes (panel add/delete/edit),
        // so the next drag's undo would revert to a pre-add state and drop the
        // object. Stacks are still only cleared on a fresh load (above).
        baselineRef.current = takeSnapshot(canvas)
        notifyHistory()
      })
    }, [activeSlide, isGrouped, followerSlide, lockSharedLayout])

    return (
      <div className="relative flex items-start justify-center">
        <canvas ref={canvasElRef} />
      </div>
    )
  },
)
