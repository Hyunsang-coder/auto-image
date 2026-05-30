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

  const canvasRef = useRef<FabricCanvasHandle>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [panelTab, setPanelTab] = useState<PanelTab>('template')

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
        e.preventDefault()
        canvasRef.current?.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        canvasRef.current?.redo()
      } else if (e.key === 'd') {
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

  if (!project) return null
  const clickedSlide = project.slides.find((s) => s.id === activeSlideId) ?? null
  // When the clicked slide is part of a span group, the leader owns all the
  // layer data — route both the canvas render and every update target there.
  // `clickedSlide` is still useful for SlideList highlighting (kept in store).
  const slide = spanLeaderOf(project.slides, clickedSlide)
  const editTargetId = slide?.id ?? null
  const isGrouped = !!slide?.spanGroupId

  function handleSlideChange(patch: Partial<Slide>) {
    if (!editTargetId) return
    updateSlide(editTargetId, patch)
  }

  function handleTemplateChange(t: TemplateType) {
    if (!editTargetId || !slide) return
    const sizes = TEMPLATE_FONT_SIZES[t]
    const align = TEMPLATE_TEXT_ALIGN[t]
    updateSlide(editTargetId, {
      template: t,
      headline: { ...slide.headline, style: { ...slide.headline.style, fontSize: sizes.headline, textAlign: align } },
      subheadline: { ...slide.subheadline, style: { ...slide.subheadline.style, fontSize: sizes.subheadline, textAlign: align } },
    })
  }

  function handleBackgroundChange(bg: Background) {
    if (!editTargetId) return
    updateSlide(editTargetId, { background: bg })
  }

  function handleHeadlineChange(c: Caption) {
    if (!editTargetId) return
    updateSlide(editTargetId, { headline: c })
  }

  function handleSubheadlineChange(c: Caption) {
    if (!editTargetId) return
    updateSlide(editTargetId, { subheadline: c })
  }

  function handleScreenshotChange(screenshot: ScreenshotImage | null) {
    if (!editTargetId) return
    updateSlide(editTargetId, { screenshot })
    // Reference-checked: the replaced screenshot's blob is swept only if no
    // saved project/preset/template still points at it.
    gcImages()
  }

  function handleBadgesChange(badges: Badge[]) {
    if (!editTargetId) return
    updateSlide(editTargetId, { badges })
  }

  function handleDeviceFrameChange(df: DeviceFrame) {
    if (!editTargetId) return
    updateSlide(editTargetId, { deviceFrame: df })
  }

  function handleScreenshotStyleChange(style: ScreenshotStyle) {
    if (!editTargetId) return
    updateSlide(editTargetId, { screenshotStyle: style })
  }

  function handleOrnamentsChange(ornaments: Ornament[]) {
    if (!editTargetId) return
    updateSlide(editTargetId, { ornaments })
  }

  function handleHighlightsChange(highlights: Highlight[]) {
    if (!editTargetId) return
    updateSlide(editTargetId, { highlights })
  }

  function handleApplyThemePreset(preset: ThemePreset) {
    if (!editTargetId || !slide) return
    updateSlide(editTargetId, {
      background: structuredClone(preset.background),
      headline: {
        ...slide.headline,
        style: { ...slide.headline.style, color: preset.headlineColor },
      },
      subheadline: {
        ...slide.subheadline,
        style: { ...slide.subheadline.style, color: preset.subheadlineColor },
      },
    })
  }

  function handleSavePreset(name: string) {
    if (!slide) return
    useCustomStore.getState().addPreset(presetFromSlide(slide, name))
  }

  function handleSaveTemplate(name: string) {
    if (!slide) return
    useCustomStore.getState().addTemplate(templateFromSlide(slide, name))
  }

  function handleApplyTemplate(tpl: SlideTemplate) {
    if (!editTargetId || !slide) return
    updateSlide(editTargetId, applyTemplateToSlide(slide, tpl))
  }

  return (
    <div className="grid h-full grid-cols-[200px_1fr_280px] gap-0 border-t border-[var(--color-border)] overflow-hidden">
      <SlideList
        slides={project.slides}
        activeSlideId={activeSlideId}
        onSelect={setActiveSlide}
      />

      <main className="flex flex-col items-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="sticky top-0 z-10 flex w-full items-center justify-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] py-2">
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
        </div>
        <div className="flex flex-1 items-start justify-center p-6">
          <FabricCanvas
            ref={canvasRef}
            activeSlide={slide}
            isGrouped={isGrouped}
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

      {slide ? (
        <PropertiesPanel
          slide={slide}
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
