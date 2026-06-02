import { useRef, useEffect, useState } from 'react'
import { useProjectStore, spanLeaderOf } from '../../store/useProjectStore'
import { SlideList } from './SlideList'
import { FabricCanvas, type FabricCanvasHandle } from './FabricCanvas'
import { CanvasToolbar } from './CanvasToolbar'
import { PropertiesPanel, type PanelTab } from './properties/PropertiesPanel'
import { LAYER_NAMES } from '../../canvas/layerNames'
import type {
  Badge,
  Highlight,
  Slide,
  TemplateType,
  Background,
  Caption,
  DeviceFrame,
  Ornament,
  ScreenshotImage,
  ScreenshotStyle,
  SlideTemplate,
} from '../../types/project'
import {
  TEMPLATE_FONT_SIZES,
  TEMPLATE_TEXT_ALIGN,
  type ThemePreset,
  presetFromSlide,
  templateFromSlide,
  applyTemplateToSlide,
} from '../../constants/defaults'
import { useCustomStore } from '../../store/useCustomStore'
import { gcImages } from '../../lib/imageRefs'
import { resolveSlideForLocale } from '../../lib/resolveSlide'
import { routeLocalePatch, clearLocaleOverride } from '../../lib/localeOverride'
import { SUPPORTED_LOCALES } from '../../constants/defaults'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))

// Double-click an object → jump the properties panel to its tab.
const LAYER_TAB: Record<string, PanelTab> = {
  [LAYER_NAMES.HEADLINE]: 'caption',
  [LAYER_NAMES.SUBHEADLINE]: 'caption',
  [LAYER_NAMES.SCREENSHOT]: 'screenshot',
  [LAYER_NAMES.DEVICE_FRAME]: 'screenshot',
  [LAYER_NAMES.BADGE]: 'badge',
  [LAYER_NAMES.ORNAMENT]: 'ornaments',
  [LAYER_NAMES.HIGHLIGHT_SOURCE]: 'highlights',
  [LAYER_NAMES.HIGHLIGHT_POPUP]: 'highlights',
}

export function EditorLayout() {
  const project = useProjectStore((s) => s.project)
  const activeSlideId = useProjectStore((s) => s.activeSlideId)
  const setActiveSlide = useProjectStore((s) => s.setActiveSlide)
  const updateSlide = useProjectStore((s) => s.updateSlide)
  const setStep = useProjectStore((s) => s.setStep)

  const canvasRef = useRef<FabricCanvasHandle>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [panelTab, setPanelTab] = useState<PanelTab>('template')
  // Which locale the editor is editing. '' = the shared/base view (full
  // editing of every element). A locale code = edit that locale: captions and
  // the device frame are tweakable and their changes are stored as that
  // locale's overrides; shared elements are locked.
  const [editLocale, setEditLocale] = useState('')
  // onKeyDown is bound once; read live mode through a ref so locale-gated
  // shortcuts don't act on a stale closure.
  const localeModeRef = useRef(false)

  function handleElementActivate(layerName: string | null) {
    if (layerName === null) {
      setPanelTab('background')
      return
    }
    const tab = LAYER_TAB[layerName]
    if (tab) setPanelTab(tab)
  }

  // Canvas keyboard shortcuts wired to the canvas handle.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true

      if (e.key === 'Escape') {
        canvasRef.current?.discardSelection()
        return
      }
      // In locale mode, delete/nudge are safe (delete only hits shared elements,
      // which are locked → inert; nudge routes through sync into the locale's
      // overrides). Undo/redo/duplicate work off raw canvas snapshots that don't
      // route, so they stay base-only for now.
      const localeMode = localeModeRef.current
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault()
        canvasRef.current?.deleteSelected()
        return
      }
      if (!typing && e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (d) {
          e.preventDefault()
          canvasRef.current?.nudgeSelected(d[0], d[1])
        }
        return
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrl = isMac ? e.metaKey : e.ctrlKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) {
        if (localeMode) return
        e.preventDefault()
        canvasRef.current?.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        if (localeMode) return
        e.preventDefault()
        canvasRef.current?.redo()
      } else if (e.key === 'd') {
        if (localeMode) return
        e.preventDefault()
        canvasRef.current?.duplicateSelected()
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setZoom((z) => clampZoom(z + 0.1))
      } else if (e.key === '-') {
        e.preventDefault()
        setZoom((z) => clampZoom(z - 0.1))
      } else if (e.key === '0') {
        e.preventDefault()
        setZoom(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    localeModeRef.current = !!editLocale
  }, [editLocale])

  if (!project) return null
  const clickedSlide = project.slides.find((s) => s.id === activeSlideId) ?? null
  // When the clicked slide is part of a span group, the leader owns all the
  // layer data — route both the canvas render and every update target there.
  // `clickedSlide` is still useful for SlideList highlighting (kept in store).
  const slide = spanLeaderOf(project.slides, clickedSlide)
  const editTargetId = slide?.id ?? null
  const isGrouped = !!slide?.spanGroupId

  // Locale edit mode: the canvas renders the slide resolved for that locale and
  // routes edits into its overrides. '' = shared/base view (edit everything).
  const isLocaleMode = !!editLocale
  const canvasSlide = isLocaleMode && slide ? resolveSlideForLocale(slide, editLocale) : slide
  // Editable locales. project.locales is the new peer list; until setup writes
  // it (a later phase), fall back to the translation targets.
  const localeOptions = project.locales ?? project.targetLocales
  const localeLabel = (code: string) => SUPPORTED_LOCALES.find((l) => l.code === code)?.label ?? code

  // The slide the editor actually shows/edits: resolved for the locale, or the
  // shared base. Panel handlers build patches off this so they reflect what the
  // user sees; applyEdit then routes the patch to the right place.
  const editingSlide = canvasSlide

  // Screenshot donor: in locale mode a locale with no own screenshot can borrow
  // another locale's (default = base). Offer it only when there's a donor to
  // borrow from and this locale hasn't uploaded its own.
  const shotOverrides = slide?.screenshot?.localeOverrides ?? {}
  const donorLocales = Object.keys(shotOverrides).filter((l) => l !== editLocale)
  const showShotSource =
    isLocaleMode && !!slide?.screenshot && !shotOverrides[editLocale] && donorLocales.length > 0

  function setScreenshotSource(donor: string) {
    if (!slide?.screenshot || !editTargetId) return
    const next = { ...slide.screenshot.localeSource }
    if (donor) next[editLocale] = donor
    else delete next[editLocale]
    updateSlide(editTargetId, {
      screenshot: { ...slide.screenshot, localeSource: Object.keys(next).length ? next : undefined },
    })
  }

  // Single write path. In locale mode the patch is rerouted into that locale's
  // overrides (text → translations, look → localeOverrides, shared elements →
  // base); otherwise it edits the shared base directly.
  function applyEdit(patch: Partial<Slide>) {
    if (!editTargetId) return
    if (isLocaleMode && slide) {
      const routed = routeLocalePatch(slide, editLocale, patch)
      if (Object.keys(routed).length) updateSlide(editTargetId, routed)
      return
    }
    updateSlide(editTargetId, patch)
  }

  const handleSlideChange = applyEdit

  // Commit any in-progress inline caption edit to the CURRENT slide/locale
  // before switching. text:editing:exited → syncToZustand runs synchronously
  // here, so it routes through the present editTargetId/editLocale; doing the
  // state switch first would let the trailing commit land on the new slide.
  function flushCanvasEdits() {
    canvasRef.current?.discardSelection()
  }

  function switchSlide(id: string) {
    flushCanvasEdits()
    setActiveSlide(id)
  }

  function switchLocale(next: string) {
    flushCanvasEdits()
    setEditLocale(next)
  }

  function handleTemplateChange(t: TemplateType) {
    if (!editingSlide) return
    const sizes = TEMPLATE_FONT_SIZES[t]
    const align = TEMPLATE_TEXT_ALIGN[t]
    applyEdit({
      template: t,
      headline: { ...editingSlide.headline, style: { ...editingSlide.headline.style, fontSize: sizes.headline, textAlign: align } },
      subheadline: { ...editingSlide.subheadline, style: { ...editingSlide.subheadline.style, fontSize: sizes.subheadline, textAlign: align } },
    })
  }

  function handleBackgroundChange(bg: Background) {
    applyEdit({ background: bg })
  }

  function handleHeadlineChange(c: Caption) {
    applyEdit({ headline: c })
  }

  function handleSubheadlineChange(c: Caption) {
    applyEdit({ subheadline: c })
  }

  function handleScreenshotChange(screenshot: ScreenshotImage | null) {
    applyEdit({ screenshot })
    // Reference-checked: the replaced screenshot's blob is swept only if no
    // saved project/preset/template still points at it.
    gcImages()
  }

  function handleBadgesChange(badges: Badge[]) {
    applyEdit({ badges })
  }

  function handleDeviceFrameChange(df: DeviceFrame) {
    applyEdit({ deviceFrame: df })
  }

  function handleScreenshotStyleChange(style: ScreenshotStyle) {
    applyEdit({ screenshotStyle: style })
  }

  function handleOrnamentsChange(ornaments: Ornament[]) {
    applyEdit({ ornaments })
  }

  function handleHighlightsChange(highlights: Highlight[]) {
    applyEdit({ highlights })
  }

  function handleApplyThemePreset(preset: ThemePreset) {
    if (!editingSlide) return
    applyEdit({
      background: structuredClone(preset.background),
      headline: {
        ...editingSlide.headline,
        style: { ...editingSlide.headline.style, color: preset.headlineColor },
      },
      subheadline: {
        ...editingSlide.subheadline,
        style: { ...editingSlide.subheadline.style, color: preset.subheadlineColor },
      },
    })
  }

  function handleSavePreset(name: string) {
    if (!editingSlide) return
    useCustomStore.getState().addPreset(presetFromSlide(editingSlide, name))
  }

  function handleSaveTemplate(name: string) {
    if (!editingSlide) return
    useCustomStore.getState().addTemplate(templateFromSlide(editingSlide, name))
  }

  function handleApplyTemplate(tpl: SlideTemplate) {
    if (!editingSlide) return
    applyEdit(applyTemplateToSlide(editingSlide, tpl))
  }

  return (
    <div className="grid h-full grid-cols-[200px_1fr_280px] gap-0 border-t border-[var(--color-border)] overflow-hidden">
      <SlideList
        slides={project.slides}
        activeSlideId={activeSlideId}
        onSelect={switchSlide}
        previewLocale={editLocale}
      />

      <main className="flex flex-col items-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <CanvasToolbar
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => canvasRef.current?.undo()}
              onRedo={() => canvasRef.current?.redo()}
            />
            <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-dim)]">
              <button
                type="button"
                title="축소 (Cmd −)"
                onClick={() => setZoom((z) => clampZoom(z - 0.1))}
                className="rounded px-1.5 leading-none transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                −
              </button>
              <button
                type="button"
                title="100%로 맞춤 (Cmd 0)"
                onClick={() => setZoom(1)}
                className="w-12 text-center tabular-nums transition hover:text-[var(--color-text)]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                title="확대 (Cmd +)"
                onClick={() => setZoom((z) => clampZoom(z + 0.1))}
                className="rounded px-1.5 leading-none transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                +
              </button>
            </div>
            {localeOptions.length > 0 && (
              <select
                value={editLocale}
                onChange={(e) => switchLocale(e.target.value)}
                title="편집 언어 — 공유(base)는 전체 공통, 특정 언어는 그 언어용 위치/크기/텍스트만 조정"
                className={`rounded-lg border bg-[var(--color-surface)] px-2 py-1 text-xs ${
                  isLocaleMode
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
                }`}
              >
                <option value="">공유 (base)</option>
                {localeOptions.map((l) => (
                  <option key={l} value={l}>
                    {localeLabel(l)}
                  </option>
                ))}
              </select>
            )}
            {isLocaleMode && (
              <button
                type="button"
                onClick={() => slide && editTargetId && updateSlide(editTargetId, clearLocaleOverride(slide, editLocale))}
                disabled={!slide?.localeOverrides?.[editLocale]}
                title="이 언어의 레이아웃 override(위치·크기·템플릿·배경·디바이스)를 지웁니다. 번역 텍스트와 스크린샷은 유지됩니다."
                className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                레이아웃 리셋
              </button>
            )}
            {showShotSource && (
              <select
                value={slide!.screenshot!.localeSource?.[editLocale] ?? ''}
                onChange={(e) => setScreenshotSource(e.target.value)}
                title="이 언어는 자체 스크린샷이 없습니다. 어떤 언어의 스크린샷을 빌려올지 선택하세요 (기본: 원본)."
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-dim)]"
              >
                <option value="">스크린샷: 원본</option>
                {donorLocales.map((l) => (
                  <option key={l} value={l}>스크린샷: {localeLabel(l)}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-1 justify-end">
            <button
              type="button"
              onClick={() => setStep(3)}
              title="다음 단계: 로컬라이즈"
              className="whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              다음 →
            </button>
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center p-6">
          <FabricCanvas
            ref={canvasRef}
            activeSlide={canvasSlide}
            isGrouped={isGrouped}
            lockSharedLayout={isLocaleMode}
            zoom={zoom}
            onSlideChange={handleSlideChange}
            onHistoryChange={({ canUndo, canRedo }) => {
              setCanUndo(canUndo)
              setCanRedo(canRedo)
            }}
            onZoomChange={(z) => setZoom(clampZoom(z))}
            onElementActivate={handleElementActivate}
          />
        </div>
      </main>

      {editingSlide ? (
        <PropertiesPanel
          slide={editingSlide}
          tab={panelTab}
          onTabChange={setPanelTab}
          onTemplateChange={handleTemplateChange}
          onBackgroundChange={handleBackgroundChange}
          onHeadlineChange={handleHeadlineChange}
          onSubheadlineChange={handleSubheadlineChange}
          onScreenshotChange={handleScreenshotChange}
          onBadgesChange={handleBadgesChange}
          onDeviceFrameChange={handleDeviceFrameChange}
          onScreenshotStyleChange={handleScreenshotStyleChange}
          onOrnamentsChange={handleOrnamentsChange}
          onHighlightsChange={handleHighlightsChange}
          onApplyThemePreset={handleApplyThemePreset}
          onSavePreset={handleSavePreset}
          onApplyTemplate={handleApplyTemplate}
          onSaveTemplate={handleSaveTemplate}
        />
      ) : (
        <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm text-[var(--color-text-dim)]">슬라이드를 선택하세요</p>
        </aside>
      )}
    </div>
  )
}
