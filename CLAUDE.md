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

Screenshots can be localized per locale: `ScreenshotImage.localeOverrides` maps a locale code to a `LocaleScreenshot` (its own `imageKey` + dims). At render time `withLocale()` (in `renderSlide.ts`) swaps in the override for that locale, falling back to the base when absent — same fallback shape as caption `translations`. The device frame stays fixed; the override is cover-fit into it. Overrides are uploaded on the Localize page, and their blobs join the GC keep-set in `imageRefs.ts`. The Localize page also bulk-imports screenshots by filename: `{n}[-desc].{locale}.{ext}` (`parseImageName` in `src/lib/imageImport.ts`). **Every file must carry a locale suffix** — there is no implicit "no-suffix = base" form. Which locale becomes the slide's base is decided by `project.sourceLocale` at import time (same source-as-setting routing as the caption table): a file whose locale equals `sourceLocale` lands in `slide.screenshot` (base), the rest become `localeOverrides`. The slide number is the leading digits of the name, so a descriptive suffix is allowed (`01-home.en.png`, `02-add-pdf.de.png`). Base files are applied before overrides so an override can attach to a base imported in the same batch; importing an override for a slide with no base (no source-locale file present and none uploaded in the editor) is skipped with a warning.

The editor canvas can render any locale read-only via a preview dropdown (`EditorLayout` `previewLocale`): a non-source selection feeds `withLocale(slide, locale)` to `FabricCanvas` with `readOnly`, which strips selection/eventing/text-editing so a translation preview can't write back into the source slide; the properties panel is replaced by a read-only notice and mutating keyboard shortcuts are gated. Layout/style is shared across locales — only text + screenshot differ — so this is for eyeballing fit, not per-locale layout.

### Device specs

All Apple export dimensions and frame specs are in `src/constants/deviceSpecs.ts` — single source of truth. Current models: `iphone-16-pro` (1320×2868) and `ipad-pro-13` (2064×2752). The editor canvas follows `slide.deviceFrame.model` (not a fixed iPhone aspect) so iPad slides actually look like iPads while editing. Device-frame corner radius is derived from the *rendered* device width, not the canvas width — this keeps split / hero-bleed (which shrink the device) from getting exaggerated corners.

### Translation

Direct browser calls to LLM APIs. Claude requires the `anthropic-dangerous-direct-browser-access: true` header. Model choices: `claude-sonnet-4-6`, `gpt-4o-mini`, `gemini-3.1-flash-lite`.

The translation table can also be filled by hand off-app: the Localize page exports a CSV or JSON template and re-imports the filled file. The template carries **every language as a labeled column** — `[sourceLocale, ...targetLocales]` — with no special "source" column. CSV header is `slide, slideId, field, <locale1>, <locale2>, …`; JSON rows carry a `texts` map of `locale → text`. The source-locale column holds the slide's base `.text`; the rest hold `translations`. Pure serialization/parse lives in `src/lib/localeIO.ts` (no store/React deps).

Import routing is keyed off the app's `project.sourceLocale` setting, **not** baked into the file — so flipping the source language and re-importing the *same* file moves the base column without regenerating. For each non-empty cell: `locale === sourceLocale` → slide base text (`headline.text` / `subheadline.text` / `badges[i].text`), otherwise → `translations[locale]` (and that locale is auto-added to `targetLocales` if not yet selected). The pure routing builders live in `src/lib/localePatch.ts` (`buildBasePatch` / `buildTranslationPatch`, dispatched by `buildImportPatch`); the grid's AI-translation path uses `buildTranslationPatch` directly. Rows match on `slideId` first, falling back to the 1-based `slide` index. Writing the source column overwrites base text the user typed in the editor (empty cells are skipped; the import summary notes how many base texts were updated). Back-compat: a legacy `source` column is ignored, and a JSON file with only the old `translations` key is read as the language map (`texts` wins when both are present).

### CSS

Tailwind v4 (via `@tailwindcss/vite`). Design tokens are CSS variables (`--color-border`, `--color-surface`, `--color-text-dim`, etc.) defined in `src/index.css`.
