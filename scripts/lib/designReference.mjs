// The design vocabulary an agent needs, built straight from the app's own TS
// constants so the two can never drift. Imported by the repo MCP server (which
// runs under tsx) and by scripts/build-mcp-package.mjs, which freezes it into
// JSON for the published package — a package cannot import TS at runtime.

import {
  FONT_OPTIONS,
  MAX_HIGHLIGHTS,
  MAX_TEXTS,
  ORNAMENT_DEFAULTS,
  SHAPE_DEFAULTS,
  SUPPORTED_LOCALES,
  THEME_PRESETS,
} from '../../src/constants/defaults.ts'
import { DEFAULT_MODEL, DEVICE_SPECS, EDITOR_CANVAS_WIDTH } from '../../src/constants/deviceSpecs.ts'

export function buildDesignReference() {
  return {
    layouts: {
      'text-top': 'text above, device below bleeding past the bottom edge (reference look, default)',
      'text-bottom': 'device on top, text band at 74% height (import seeds deviceFrame.scale 0.85)',
      hero: 'text only — no screenshot slot',
      'hero-bleed': 'text top-left, large device bleeding past the bottom-right corner',
      split: 'left text column (left-aligned), device vertically centered in the right half',
    },
    themePresets: THEME_PRESETS,
    // Families usable as texts[i].fontFamily (manifest) / texts[i].style.fontFamily
    // (patch). Non-Pretendard families are Latin display faces; Korean glyphs
    // fall back to Pretendard automatically.
    fontFamilies: FONT_OPTIONS.map((f) => f.family),
    ornamentShapes: ORNAMENT_DEFAULTS,
    // slides[].shapes kinds with their add-defaults; geometry fields are
    // canvas fractions (x/y center, width of canvas W, height of canvas H).
    shapeKinds: SHAPE_DEFAULTS,
    locales: SUPPORTED_LOCALES.map(({ code, name }) => ({ code, name })),
    deviceModels: Object.values(DEVICE_SPECS).map(({ model, type, label, exportWidth, exportHeight }) => ({
      model,
      type,
      label,
      exportWidth,
      exportHeight,
    })),
    defaultModelByType: DEFAULT_MODEL,
    limits: {
      slides: 10,
      textBlocksPerSlide: MAX_TEXTS,
      badgesPerSlide: 5,
      ornamentsPerSlide: 5,
      shapesPerSlide: 8,
      externalImagesPerSlide: 3,
      highlightsPerSlide: MAX_HIGHLIGHTS,
    },
    editorCanvasWidth: EDITOR_CANVAS_WIDTH,
    notes: [
      'All px values in manifests/patches (fontSize, paddings, outline width, shadow offsets) are relative to the ' +
        `${EDITOR_CANVAS_WIDTH}px editor canvas and scale to export resolution automatically.`,
      'One device type per project; type is auto-detected from screenshot aspect ratio.',
      'Total exported PNGs = slides × locales, grouped {locale}/{device}/NN.png.',
    ],
  }
}
