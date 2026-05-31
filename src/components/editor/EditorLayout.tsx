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
import { withLocale } from '../../lib/renderSlide'
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

  const canvasRef = useRef<FabricCanvasHandle>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [panelTab, setPanelTab] = useState<PanelTab>('template')
  // Read-only preview of a non-source locale on the editor canvas. '' = source
  // (full editing). Lets the user eyeball how each translation sits in the
  // shared layout before exporting.
  const [previewLocale, setPreviewLocale] = useState('')
  // onKeyDown is bound once; read live preview state through a ref so locked
  // shortcuts don't act on a stale closure.
  const isPreviewRef = useRef(false)

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
      // In read-only preview, only zoom shortcuts stay live — block anything
      // that would mutate the (source) slide.
      const editingBlocked = isPreviewRef.current
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !editingBlocked) {
        e.preventDefault()
        canvasRef.current?.deleteSelected()
        return
      }
      if (!typing && !editingBlocked && e.key.startsWith('Arrow')) {
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
        if (editingBlocked) return
        e.preventDefault()
        canvasRef.current?.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        if (editingBlocked) return
        e.preventDefault()
        canvasRef.current?.redo()
      } else if (e.key === 'd') {
        if (editingBlocked) return
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
    isPreviewRef.current = !!previewLocale && !!project && previewLocale !== project.sourceLocale
  }, [previewLocale, project])

  if (!project) return null
  const clickedSlide = project.slides.find((s) => s.id === activeSlideId) ?? null
  // When the clicked slide is part of a span group, the leader owns all the
  // layer data — route both the canvas render and every update target there.
  // `clickedSlide` is still useful for SlideList highlighting (kept in store).
  const slide = spanLeaderOf(project.slides, clickedSlide)
  const editTargetId = slide?.id ?? null
  const isGrouped = !!slide?.spanGroupId

  // Preview is active only for a real, non-source locale. The canvas then shows
  // that locale's translated text + screenshot override (read-only).
  const isPreview = !!previewLocale && previewLocale !== project.sourceLocale
  const canvasSlide = isPreview && slide ? withLocale(slide, previewLocale) : slide
  const previewLocales = [
    project.sourceLocale,
    ...project.targetLocales.filter((l) => l !== project.sourceLocale),
  ]
  const localeLabel = (code: string) => SUPPORTED_LOCALES.find((l) => l.code === code)?.label ?? code

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
          {previewLocales.length > 1 && (
            <select
              value={previewLocale || project.sourceLocale}
              onChange={(e) =>
                setPreviewLocale(e.target.value === project.sourceLocale ? '' : e.target.value)
              }
              title="언어 미리보기 — 원본 외 언어는 읽기전용"
              className={`rounded-lg border bg-[var(--color-surface)] px-2 py-1 text-xs ${
                isPreview
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
              }`}
            >
              {previewLocales.map((l) => (
                <option key={l} value={l}>
                  {localeLabel(l)}
                  {l === project.sourceLocale ? ' (원본)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-1 items-start justify-center p-6">
          <FabricCanvas
            ref={canvasRef}
            activeSlide={canvasSlide}
            isGrouped={isGrouped}
            readOnly={isPreview}
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

      {slide && isPreview ? (
        <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium text-[var(--color-accent)]">
            👁 {localeLabel(previewLocale)} 미리보기
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-dim)]">
            번역 결과를 레이아웃 안에서 확인하는 읽기전용 모드입니다. 편집하려면 상단에서
            원본({localeLabel(project.sourceLocale)})으로 전환하세요.
          </p>
        </aside>
      ) : slide ? (
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
