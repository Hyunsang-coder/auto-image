# App Store Screenshot Studio

A fully client-side editor for building localized App Store / iPad screenshots — device frames, headlines, highlight popouts, badges, gradients — and exporting them at exact Apple resolutions, ready to drop into App Store Connect.

**Try it now:** [hyunsang-coder.github.io/auto-image](https://hyunsang-coder.github.io/auto-image/)

**Local-first & private.** There is no backend. Your screenshots never leave the browser — images live in IndexedDB, and API keys (if you use any) stay in `localStorage`. You can self-host it, run the desktop build, or just use the hosted site.

## Features

- **Visual canvas editor** (Fabric.js) — background/gradient, device frame, headline + subheadline, highlight popouts (magnified callouts), badges, emoji ornaments, device tilt.
- **iPhone & iPad** — exports at the App Store Connect upload sizes: iPhone 6.9" (1320×2868) / 6.5" (1242×2688) and iPad 13" (2064×2752) / 11" (1668×2388). The device type is auto-detected from each screenshot's aspect ratio.
- **Localization, your way** — translate captions in *your own* AI tool, not ours. Export a CSV/JSON template, copy the bundled translation prompt, paste both into any LLM, then re-import the filled file. Per-locale screenshots and per-locale caption editing are supported.
- **Agent-ready project import** — an AI agent can author the entire project as files: a manifest JSON + screenshots named `{n}[-desc].{locale}.{ext}` + a caption CSV. Select them all in one file pick on the setup step and a complete pre-export project is assembled. Spec: [docs/project-import.md](./docs/project-import.md). For zero clicks, `node scripts/headless-export.mjs <input-dir> <out-dir> [--fastlane]` renders that folder straight to final PNGs (works against a local checkout or the hosted site via `BASE_URL`) — so an agent can loop *edit files → render → inspect PNGs* unattended.
- **One-click export** — renders every slide to PNG (alpha-stripped, App Store Connect-safe) and packages them as a ZIP grouped by `{locale}/{device}/`, or as a fastlane `deliver`-ready ZIP for direct App Store Connect upload.
- **Multi-project library** + custom background presets and slide-style templates.

## Quick start

```bash
npm install
npm run dev      # landing: http://localhost:5173 · app: http://localhost:5173/app/
```

## Build & deploy

```bash
npm run build    # tsc -b && vite build → dist/
npm run preview  # preview the production build locally
```

`dist/` is a static bundle — host it anywhere (GitHub Pages, Cloudflare Pages, Vercel, Netlify, or your own server). The included GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys to GitHub Pages on push to `main`; enable Pages (Settings → Pages → Source: GitHub Actions) to use it. For root-domain hosts (Cloudflare/Vercel/Netlify) the default config works as-is.

### Desktop (optional)

A Tauri shell is included for a native macOS build:

```bash
npm run tauri:dev
npm run tauri:build
```

## How it works

1. **Setup** — pick device, slide count, theme color — or import an agent-authored file bundle ([spec](./docs/project-import.md)) and skip straight to review.
2. **Edit** — compose each slide on the canvas.
3. **Localize** — manage target languages, export/import the translation template, bulk-import per-locale screenshots.
4. **Export** — render to PNG and download the ZIP.

Total PNGs = `slides × locales`; each slide exports to the single device its screenshot belongs to.

## Tech stack

React + TypeScript, Vite, Tailwind v4, Fabric.js, Zustand (with `localStorage` persist), IndexedDB (`idb-keyval`), JSZip + FileSaver. Tests: Vitest (logic) + Playwright (e2e).

```bash
npm run lint
npm run test:unit
npm run test:e2e
```

## License

[MIT](./LICENSE)
