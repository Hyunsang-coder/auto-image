# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Rules

- **State assumptions explicitly** before writing code. If a requirement has multiple valid interpretations, list them and ask — never pick one silently.
- **Write the minimum code** that satisfies the request. No speculative abstractions, configs, or extra features.
- **Surgical edits only.** Every changed line must map directly to the request. Leave unrelated code untouched.
- **Define done verifiably.** Translate vague tasks into a concrete success condition (e.g., "step 1 form saves → survives refresh") and confirm it before closing the task.

## Commands

```bash
npm run dev          # start dev server (Vite HMR)
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npm run preview      # preview production build
npm run test:e2e     # playwright e2e (chromium, against the Vite dev server)
npm run test:e2e:ui  # playwright UI mode
```

E2E specs live in `e2e/` (one per step + a top-level navigation spec). `playwright.config.ts` reuses an already-running dev server on `localhost:5173`.

## Architecture

**App Store Screenshot Studio** — fully client-side React/TypeScript SPA. No backend. API keys stored only in `localStorage`.

### 4-step flow

`App.tsx` routes between steps via `useProjectStore.step`:
1. **ProjectSetup** — device, slide count, theme color
2. **EditorLayout** — Fabric.js canvas editor + properties panel
3. **LocalizeEditor** — translation table (Claude / OpenAI / Gemini)
4. **ExportPanel** — renders slides to PNG and packages as ZIP

### State management

Two Zustand stores (both with `localStorage` persist):
- `useProjectStore` — project + slides data. Images are **not** stored here.
- `useApiKeyStore` — API keys only, intentionally separated so project JSON can be shared without leaking keys.

Images (screenshots) are stored in **IndexedDB** via `src/lib/imageStore.ts` using `idb-keyval`. `ScreenshotImage.imageKey` is the pointer (prefixed `img:`); never a dataUrl in the store.

### Canvas (Fabric.js)

Layer order (bottom → top): Background → Ornaments → Screenshot → DeviceFrame → Headline/Subheadline → HighlightSource (dashed) → HighlightPopup → Badge. Highlights render *after* text + device frame so the magnified card floats above the bezel while the badge stays top-most. Connector lines between source and popup are part of the data model (`Highlight.popup.showConnectorLine`) but not yet rendered.

Sync is **one-directional**: user edits → Fabric internal state → `object:modified` → `syncToZustand()`. Zustand → Fabric only on slide load/switch. Same sync fires on undo/redo via the canvas handle. While a highlight popup is being dragged or scaled, its absolutely-positioned `clipPath` is repositioned every `object:moving` / `object:scaling` tick so the rounded mask doesn't lag.

Layer objects are tagged with `layerName` constants from `src/canvas/layerNames.ts`. Per-instance objects (ornaments, highlights) additionally carry an id (`ornamentId`, `highlightId`) so the sync code can map them back to the corresponding store entry.

### Export pipeline

`renderSlide()` creates an offscreen `fabric.Canvas` at full Apple resolution, waits for `document.fonts.ready`, renders, calls `toBlob('image/png')`, then immediately `canvas.dispose()`. Slides render sequentially (not in parallel) to avoid memory exhaustion. JSZip + FileSaver packages output as `{locale}/{device}/{index}.png`.

Each slide exports to exactly **one** device — the one its screenshot belongs to, auto-detected from aspect ratio on upload (`detectDeviceFromAspect` in `deviceSpecs.ts`). `project.devices` is the initial default for new slides; it is **not** multiplied into the export. Total PNGs = `slides × locales`, and slides are grouped into their own device folder. An iPhone screenshot in an iPad project is impossible by construction — the slide flips to iPad frame as soon as a near-square shot is uploaded.

Screenshots can be localized per locale: `ScreenshotImage.localeOverrides` maps a locale code to a `LocaleScreenshot` (its own `imageKey` + dims). At render time `withLocale()` (in `renderSlide.ts`) swaps in the override for that locale, falling back to the base when absent — same fallback shape as caption `translations`. The device frame stays fixed; the override is cover-fit into it. Overrides are uploaded on the Localize page, and their blobs join the GC keep-set in `imageRefs.ts`.

### Device specs

All Apple export dimensions and frame specs are in `src/constants/deviceSpecs.ts` — single source of truth. Current models: `iphone-16-pro` (1320×2868) and `ipad-pro-13` (2064×2752). The editor canvas follows `slide.deviceFrame.model` (not a fixed iPhone aspect) so iPad slides actually look like iPads while editing. Device-frame corner radius is derived from the *rendered* device width, not the canvas width — this keeps split / hero-bleed (which shrink the device) from getting exaggerated corners.

### Translation

Direct browser calls to LLM APIs. Claude requires the `anthropic-dangerous-direct-browser-access: true` header. Model choices: `claude-sonnet-4-6`, `gpt-4o-mini`, `gemini-3.1-flash-lite`.

The translation table can also be filled by hand off-app: the Localize page exports a CSV or JSON template (source text + a column/key per target locale, pre-filled with any existing translations) and re-imports the filled file. Pure serialization/parse lives in `src/lib/localeIO.ts` (no store/React deps); the editor builds the rows and writes parsed cells back via the same `buildPatch` path as AI translation. Rows match on `slideId` first, falling back to the 1-based `slide` index; `source` is a reserved (non-locale) column. Imported locales not yet selected are auto-added to `targetLocales`.

### CSS

Tailwind v4 (via `@tailwindcss/vite`). Design tokens are CSS variables (`--color-border`, `--color-surface`, `--color-text-dim`, etc.) defined in `src/index.css`.
