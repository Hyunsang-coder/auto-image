import type {
  Badge,
  Highlight,
  Slide,
  Background,
  Caption,
  DeviceFrame,
  ExternalImage,
  Ornament,
  ScreenshotImage,
  ScreenshotStyle,
  Shape,
  TemplateType,
  TextStyle,
} from '../../../types/project'
import type { ThemePreset } from '../../../constants/defaults'
import { BackgroundPanel } from './BackgroundPanel'
import { BadgePanel } from './BadgePanel'
import { CaptionPanel } from './CaptionPanel'
import { ScreenshotPanel } from './ScreenshotPanel'
import { ExternalImagePanel } from './ExternalImagePanel'
import { OrnamentPanel } from './OrnamentPanel'
import { ShapePanel } from './ShapePanel'
import { HighlightPanel } from './HighlightPanel'
import { sectionLabel, type PanelTab } from './sections'
import { useT } from '../../../i18n'


interface Props {
  slide: Slide
  /**
   * Span: caption ownership follows the clicked slide. When set (the follower
   * half is active), the caption tab edits THIS slide's texts while every
   * other tab keeps editing `slide` (the leader's shared layers).
   */
  captionSlide?: Slide | null
  tab: PanelTab
  onBackgroundChange: (bg: Background) => void
  onTextsChange: (texts: Caption[]) => void
  onScreenshotChange: (screenshot: ScreenshotImage | null) => void
  onBadgesChange: (badges: Badge[]) => void
  onDeviceFrameChange: (df: DeviceFrame) => void
  onScreenshotStyleChange: (style: ScreenshotStyle) => void
  onTemplateChange: (next: TemplateType) => void
  onExternalImagesChange: (next: ExternalImage[]) => void
  onOrnamentsChange: (next: Ornament[]) => void
  onShapesChange: (next: Shape[]) => void
  onHighlightsChange: (next: Highlight[]) => void
  onApplyThemePreset: (preset: ThemePreset) => void
  onSavePreset: (name: string) => void
  /** Bulk apply ("all"/"selected"). Hidden in locale mode. */
  bulkEnabled: boolean
  /** Size of the live multi-selection (includes the active slide). */
  selectedCount: number
  /** Total base slides — the "전체" target count. */
  slideCount: number
  onApplyThemePresetToSlides: (preset: ThemePreset, scope: 'all' | 'selected') => void
  onApplyTextStyleToSlides: (style: Partial<TextStyle>, scope: 'all' | 'selected') => void
}

export function PropertiesPanel({
  slide,
  captionSlide,
  tab,
  onBackgroundChange,
  onTextsChange,
  onScreenshotChange,
  onBadgesChange,
  onDeviceFrameChange,
  onScreenshotStyleChange,
  onTemplateChange,
  onExternalImagesChange,
  onOrnamentsChange,
  onShapesChange,
  onHighlightsChange,
  onApplyThemePreset,
  onSavePreset,
  bulkEnabled,
  selectedCount,
  slideCount,
  onApplyThemePresetToSlides,
  onApplyTextStyleToSlides,
}: Props) {
  const t = useT()
  const screenshotStyle: ScreenshotStyle =
    slide.screenshotStyle ?? { cornerRadiusRatio: 0.06, shadow: true }

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      {/*
        No tab strip: the inspector shows whatever is selected, so the header
        states the section rather than offering eight of them. Sections with
        nothing selected yet are reached from the layer panel's add menu.
      */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <span className="text-[length:var(--text-ui-sm)] font-semibold text-[var(--color-text)]">
          {t(sectionLabel(tab))}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'background' && (
          <BackgroundPanel
            value={slide.background}
            onChange={onBackgroundChange}
            onApplyPreset={onApplyThemePreset}
            onSavePreset={onSavePreset}
            bulkEnabled={bulkEnabled}
            selectedCount={selectedCount}
            slideCount={slideCount}
            onApplyPresetToSlides={onApplyThemePresetToSlides}
          />
        )}
        {tab === 'caption' && (
          <CaptionPanel
            texts={(captionSlide ?? slide).texts}
            template={(captionSlide ?? slide).template}
            onChange={onTextsChange}
            bulkEnabled={bulkEnabled}
            selectedCount={selectedCount}
            slideCount={slideCount}
            onApplyTextStyleToSlides={onApplyTextStyleToSlides}
          />
        )}
        {tab === 'screenshot' && (
          <ScreenshotPanel
            value={slide.screenshot}
            onChange={onScreenshotChange}
            deviceFrame={slide.deviceFrame}
            onDeviceFrameChange={onDeviceFrameChange}
            screenshotStyle={screenshotStyle}
            onScreenshotStyleChange={onScreenshotStyleChange}
            template={slide.template}
            onTemplateChange={onTemplateChange}
          />
        )}
        {tab === 'externalImages' && (
          <ExternalImagePanel
            value={slide.externalImages ?? []}
            onChange={onExternalImagesChange}
          />
        )}
        {tab === 'highlights' && (
          <HighlightPanel
            value={slide.highlights ?? []}
            slide={slide}
            hasScreenshot={!!slide.screenshot}
            onChange={onHighlightsChange}
          />
        )}
        {tab === 'shapes' && (
          <ShapePanel
            value={slide.shapes ?? []}
            onChange={onShapesChange}
          />
        )}
        {tab === 'ornaments' && (
          <OrnamentPanel
            value={slide.ornaments ?? []}
            onChange={onOrnamentsChange}
          />
        )}
        {tab === 'badge' && (
          <BadgePanel value={slide.badges} onChange={onBadgesChange} />
        )}
      </div>
    </aside>
  )
}
