# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Rules

- **State assumptions explicitly** before writing code. If a requirement has multiple valid interpretations, list them and ask — never pick one silently.
- **Write the minimum code** that satisfies the request. No speculative abstractions, configs, or extra features.
- **Surgical edits only.** Every changed line must map directly to the request. Leave unrelated code untouched.
- **Define done verifiably.** Translate vague tasks into a concrete success condition (e.g., "step 1 form saves → survives refresh") and confirm it before closing the task.

## Commands

```bash
npm run dev       # start dev server (Vite HMR)
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # preview production build
```

No test framework is configured yet.

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

Planned layer order (bottom → top): Background → Screenshot → DeviceFrame → HighlightBorder → HighlightPopup+Connector → Headline/Subheadline → Badge.

Sync is **one-directional**: user edits → Fabric internal state → `object:modified` (debounced 300ms) → `syncToZustand()`. Zustand → Fabric only on slide load/switch. Same sync fires on `history:undo` / `history:redo`.

Layer objects are identified by name constants defined in `src/canvas/layerNames.ts` (planned).

### Export pipeline

`renderSlide()` creates an offscreen `fabric.Canvas` at full Apple resolution, waits for `document.fonts.ready`, renders, calls `toBlob('image/png')`, then immediately `canvas.dispose()`. Slides render sequentially (not in parallel) to avoid memory exhaustion. JSZip + FileSaver packages output as `{locale}/{device}/{index}.png`.

### Device specs

All Apple export dimensions and frame specs are in `src/constants/deviceSpecs.ts` — single source of truth. Current models: `iphone-16-pro` (1320×2868) and `ipad-pro-13` (2064×2752).

### Translation

Direct browser calls to LLM APIs. Claude requires the `anthropic-dangerous-direct-browser-access: true` header. Model choices: `claude-sonnet-4-6`, `gpt-4o-mini`, `gemini-2.0-flash`.

### CSS

Tailwind v4 (via `@tailwindcss/vite`). Design tokens are CSS variables (`--color-border`, `--color-surface`, `--color-text-dim`, etc.) defined in `src/index.css`.
