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
import { routeLocalePatch, clearLocaleLayout } from '../../lib/localeOverride'
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

  function handleSlideChange(patch: Partial<Slide>) {
    if (!editTargetId) return
    if (isLocaleMode && slide) {
      const routed = routeLocalePatch(slide, editLocale, patch)
      if (Object.keys(routed).length) updateSlide(editTargetId, routed)
      return
    }
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
          {localeOptions.length > 0 && (
            <select
              value={editLocale}
              onChange={(e) => setEditLocale(e.target.value)}
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

      {slide && isLocaleMode ? (
        <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium text-[var(--color-accent)]">
            ✏️ {localeLabel(editLocale)} 편집
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-dim)]">
            이 언어용으로 <strong>텍스트·위치·크기·디바이스</strong>만 조정합니다 (이 언어
            override로 저장). 색·템플릿·배경·뱃지 등 공유 속성은 상단에서 <strong>공유(base)</strong>로
            전환해 편집하세요.
          </p>
          <button
            onClick={() => editTargetId && updateSlide(editTargetId, clearLocaleLayout(slide, editLocale))}
            disabled={!slide.localeLayout?.[editLocale]}
            className="mt-4 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            이 언어 레이아웃 → 공유로 리셋
          </button>
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
