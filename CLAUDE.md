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
npm run headless:export -- <input-dir> <out-dir> --report  # render an import folder + layout reports
npm run layout:fix -- <out-dir>/layout-summary.json <input-dir>/manifest.json  # dry-run manifest fixes
npm run layout:loop -- <input-dir> <out-dir> --write --max-runs 3  # render/fix/re-render loop
npm run test:e2e     # playwright e2e (chromium, against the Vite dev server)
npm run test:e2e:ui  # playwright UI mode
```

E2E specs live in `e2e/` (one per step + a top-level navigation spec). `playwright.config.ts` reuses an already-running dev server on `localhost:5173`.

## Architecture

**App Store Screenshot Studio** — fully client-side React/TypeScript app. No backend, no API keys (translation is import-only — see Translation). Vite MPA: static landing at `/` (root `index.html`), the React app at `/app/`, plus static guide/blog pages under `public/` (see Static pages).

### UI i18n

The UI is bilingual (ko/en) via `src/i18n/` — **the Korean source string is the dictionary key** (`t('저장')`), with `src/i18n/en.ts` as the only dictionary; a missing entry falls back to Korean. Interpolation uses `{token}` slots: `t('슬라이드 {n}', { n })`. Components use the reactive `useT()` hook; non-React modules (lib warnings, store messages) import plain `t()`. Default locale comes from `navigator.language`, persisted in `localStorage` (`ui-locale`), toggled in the app header. Tests are pinned to Korean — Playwright via `locale: 'ko-KR'` (specs select by Korean text) and Vitest via `src/test.setup.ts` (lib tests assert Korean messages) — so **never rename a Korean source string without updating its `en.ts` key**; `src/i18n/en.test.ts` statically scans all literal `t('…')` calls and fails on any key missing from the dictionary (it cannot see non-literal `t(item.label)` calls — add those entries manually).

### 4-step flow

`App.tsx` routes between steps via `useProjectStore.step`:
1. **ProjectSetup** — device, slide count, theme color
2. **EditorLayout** — Fabric.js canvas editor + properties panel
3. **LocalizeEditor** — translation table (template export/import + copyable translation prompt)
4. **ExportPanel** — renders slides to PNG and packages as ZIP

### Project import (step 1)

ProjectSetup also accepts a flat multi-file selection (an AI-authored manifest JSON + screenshots named `{n}[-desc].{locale}.{ext}` + a caption CSV/JSON in the localize template format) and assembles a complete pre-export project in one uncommitted pass; a single result modal shows the summary/warnings and doubles as the overwrite confirmation, committing via one `loadProject`. The manifest is a thin schema over `makeProject`/`makeSlide` (NOT the internal `Project` type) — its per-slide `textBlocks` count pre-creates the slots the caption file fills, because caption rows whose slot doesn't exist are skipped (imported slides are text+image only — no badge slots, `badge:N` rows skip). Fresh slide ids can't match a pre-authored file, so caption rows match by 1-based `slide` index (`slideId` left blank). `.json` files are classified by shape (`version`+`slides` = manifest, `rows` = captions; CSV wins over caption JSON). `text-bottom` slides are seeded with `deviceFrame.scale` 0.85 — a default-scale device (5→83% of canvas height, model-independent since frame aspect = canvas aspect) would run under the layout's 74% text anchor, and import is the only path that creates a bare text-bottom frame (the editor's layout selector was removed; built-in templates author scale per slide). Pure pipeline: `src/lib/projectImport.ts` (parse/normalize → build) + `src/lib/projectImportRun.ts` (routing + orchestration, returns an uncommitted Project; cancel relies on `gcImages` to sweep the blobs `importBulkImages` already persisted). Headless flow: `npm run headless:export -- <input-dir> <out-dir> --report` emits PNGs plus layout reports; `npm run layout:fix` dry-runs/applies manifest edits from `layout-summary.json`; `npm run layout:loop -- <input-dir> <out-dir> --write` renders, fixes, and re-renders until issues clear or the max run count is reached. Agent-facing spec: `docs/project-import.md`.

### State management

Three Zustand stores (all with `localStorage` persist):
- `useProjectStore` — the active project + slides data. Images are **not** stored here.
- `useLibraryStore` — multi-project library (deep-cloned snapshots, upsert by id).
- `useCustomStore` — user-saved theme presets + project templates.

Images (screenshots) are stored in **IndexedDB** via `src/lib/imageStore.ts` using `idb-keyval`. `ScreenshotImage.imageKey` is the pointer (prefixed `img:`); never a dataUrl in the store.

### Canvas (Fabric.js)

Layer order (bottom → top): Background → Ornaments → Screenshot → DeviceFrame → Headline/Subheadline → HighlightSource (dashed) → HighlightPopup → Badge. Highlights render *after* text + device frame so the magnified card floats above the bezel while the badge stays top-most. Connector lines between source and popup are part of the data model (`Highlight.popup.showConnectorLine`) but not yet rendered.

Sync is **one-directional**: user edits → Fabric internal state → `object:modified` → `syncToZustand()`. Zustand → Fabric only on slide load/switch. Same sync fires on undo/redo via the canvas handle. While a highlight popup is being dragged or scaled, its absolutely-positioned `clipPath` is repositioned every `object:moving` / `object:scaling` tick so the rounded mask doesn't lag.

Layer objects are tagged with `layerName` constants from `src/canvas/layerNames.ts`. Per-instance objects (ornaments, highlights) additionally carry an id (`ornamentId`, `highlightId`) so the sync code can map them back to the corresponding store entry.

### 2-page span groups

Two adjacent slides can link into an App-Store-style spanning pair (`spanGroupId` + `spanRole: leader|follower`; adjacency `leader.index + 1 === follower.index` is enforced by the store). Ownership is split: the **leader owns the shared layers** (background, device frame, screenshot, ornaments, highlights, badges — anything that crosses the seam), while **`texts` are per-slide** — the leader's captions render on the left page, the follower's on the right, so the localize table/CSV addresses each half by its own slide number and `unlinkSpan` keeps the follower's captions (only the look is cloned from the leader). The follower's *other* layer fields are ignored while grouped.

Coordinate invariant: a span slide's `Caption.pos.x`/`boxWidth` normalize against its **own page width** (halfWidth of the wide canvas), not the wide canvas — values may leave [0,1] when a box crosses the seam; ownership is array membership, not position. Rendering composes one 2×-wide canvas (`renderSpanGroup(leader, follower, …)` → sliced into two PNGs; same composition in the editor) where `applyTemplate`'s `spanFollower` opt lays the follower's texts with its own template anchors offset one page right. Canvas text objects carry an `owner: 'leader'|'follower'` tag (in `HISTORY_PROPS`, since `textIndex` alone isn't unique on a span) and `syncToZustand` emits a dual patch — `onSlideChange(leaderPatch, followerPatch?)` — written atomically via `updateSlides`. In the editor, the caption tab follows the *clicked* slide (follower half → its texts); every other tab routes to the leader via `spanLeaderOf`. Legacy data (leader-owned texts in wide-canvas coords) is migrated by `src/lib/spanTextMigration.ts` — project persist v4→v5 and custom-template store v2→v3 split right-half captions onto the follower with renormalized fractions.

### Export pipeline

`renderSlide()` creates an offscreen `fabric.Canvas` at full Apple resolution, waits for `document.fonts.ready`, renders, calls `toBlob('image/png')`, then immediately `canvas.dispose()`. Slides render sequentially (not in parallel) to avoid memory exhaustion. JSZip + FileSaver packages output as `{locale}/{device}/{index}.png`.

Each slide exports to exactly **one** device — the one its screenshot belongs to. The device *type* (iphone/ipad) is auto-detected from aspect ratio on upload (`detectTypeFromAspect` in `deviceSpecs.ts`); the *size within the type* (which App Store resolution) is a per-project setting (`project.deviceModels`, edited via the size dropdowns in the editor header). `project.devices` is the initial default for new slides; it is **not** multiplied into the export. Total PNGs = `slides × locales`, and slides are grouped into their own device folder. An iPhone screenshot in an iPad project is impossible by construction — the slide flips to iPad frame as soon as a near-square shot is uploaded.

Screenshots can be localized per locale: `ScreenshotImage.localeOverrides` maps a locale code to a `LocaleScreenshot` (its own `imageKey` + dims). At render time `withLocale()` (in `renderSlide.ts`) swaps in the override for that locale, falling back to the base when absent — same fallback shape as caption `translations`. The device frame stays fixed; the override is cover-fit into it. Overrides are uploaded on the Localize page, and their blobs join the GC keep-set in `imageRefs.ts`. The Localize page also bulk-imports screenshots by filename: `{n}[-desc].{locale}.{ext}` (`parseImageName` in `src/lib/imageImport.ts`). **Every file must carry a locale suffix** — there is no implicit "no-suffix = base" form. Which locale becomes the slide's base is decided by `project.sourceLocale` at import time (same source-as-setting routing as the caption table): a file whose locale equals `sourceLocale` lands in `slide.screenshot` (base), the rest become `localeOverrides`. The slide number is the leading digits of the name, so a descriptive suffix is allowed (`01-home.en.png`, `02-add-pdf.de.png`). Base files are applied before overrides so an override can attach to a base imported in the same batch; importing an override for a slide with no base (no source-locale file present and none uploaded in the editor) is skipped with a warning.

The editor canvas can render any locale read-only via a preview dropdown (`EditorLayout` `previewLocale`): a non-source selection feeds `withLocale(slide, locale)` to `FabricCanvas` with `readOnly`, which strips selection/eventing/text-editing so a translation preview can't write back into the source slide; the properties panel is replaced by a read-only notice and mutating keyboard shortcuts are gated. Layout/style is shared across locales — only text + screenshot differ — so this is for eyeballing fit, not per-locale layout.

### Device specs

All Apple export dimensions and frame specs are in `src/constants/deviceSpecs.ts` — single source of truth. Models are the App Store Connect screenshot upload slots (labels match ASC's "… Display" wording), grouped by type in `MODELS_BY_TYPE`: iPhone `iphone-16-pro` (6.9", 1320×2868) and `iphone-6-5` (1242×2688); iPad `ipad-pro-13` (13", 2064×2752) and `ipad-11` (1668×2388). iPad 12.9" is omitted on purpose — ASC folds 2048×2732 into the 13" slot. (The `iphone-16-pro` / `ipad-pro-13` keys are legacy ids kept for persisted-project back-compat; the user-facing name is the spec `label`.) `DEFAULT_MODEL` is the largest (App Store-required) per type, used when `project.deviceModels` hasn't picked a size; `setDeviceSize` (store) changes a type's size and remaps every slide of that type. The editor canvas follows `slide.deviceFrame.model` (not a fixed iPhone aspect) so iPad slides actually look like iPads while editing. Device-frame corner radius is derived from the *rendered* device width, not the canvas width — this keeps split / hero-bleed (which shrink the device) from getting exaggerated corners.

### Translation

Translation is **import-only by design** — there are no in-app LLM API calls and no API keys anywhere. The Localize page exports a CSV or JSON template and provides a copyable translation prompt; the user pastes both into any AI chat (or hands the file to a translator/spreadsheet) and re-imports the filled file. The template carries **every language as a labeled column** — `[sourceLocale, ...targetLocales]` — with no special "source" column. CSV header is `slide, slideId, field, <locale1>, <locale2>, …`; JSON rows carry a `texts` map of `locale → text`. The source-locale column holds the slide's base `.text`; the rest hold `translations`. Pure serialization/parse lives in `src/lib/localeIO.ts` (no store/React deps).

Import routing is keyed off the app's `project.sourceLocale` setting, **not** baked into the file — so flipping the source language and re-importing the *same* file moves the base column without regenerating. For each non-empty cell: `locale === sourceLocale` → slide base text (`headline.text` / `subheadline.text` / `badges[i].text`), otherwise → `translations[locale]` (and that locale is auto-added to `targetLocales` if not yet selected). The pure routing builders live in `src/lib/localePatch.ts` (`buildBasePatch` / `buildTranslationPatch`, dispatched by `buildImportPatch`); the grid's cell-edit path uses `buildTranslationPatch` directly. Rows match on `slideId` first, falling back to the 1-based `slide` index. Writing the source column overwrites base text the user typed in the editor (empty cells are skipped; the import summary notes how many base texts were updated). Back-compat: a legacy `source` column is ignored, and a JSON file with only the old `translations` key is read as the language map (`texts` wins when both are present).

### CSS

Tailwind v4 (via `@tailwindcss/vite`). Design tokens are CSS variables (`--color-border`, `--color-surface`, `--color-text-dim`, etc.) defined in `src/index.css`.

### Static pages (SEO)

Marketing/SEO pages are plain hand-written HTML (each with its own inline `<style>`, no Tailwind): the landing (root `index.html`), `public/guides/*.html` with Korean versions at `public/guides/ko/<same-name>.html`, `public/blog/` (same en/ko layout), and `public/about.html` / `public/privacy.html`. Conventions when adding or renaming a page: every en/ko pair carries the hreflang triple (`en`, `ko`, `x-default` → en) plus a visible `p.lang` switch link; ko pages link to ko siblings; every page gets a `<loc>` entry in `public/sitemap.xml` and the Cloudflare Web Analytics beacon at the end of `<body>`. Guides also cross-link via their "Related guides" list, and the landing's Guides grid lists all of them. Live site: https://screenshotstudio.dev (GH Pages deploys on push to `main`).
