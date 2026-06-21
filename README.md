# App Store Screenshot Studio

Generate a full set of localized App Store / iPad screenshots — device frames, headlines, highlight call-outs, badges, gradients — at exact Apple resolutions, ready to drop into App Store Connect.

**Try it now:** [screenshotstudio.dev](https://screenshotstudio.dev/)

**The idea:** you shouldn't be dragging text boxes around for every language. Let an AI agent build the whole set from your raw simulator screenshots, then open it in the editor and nudge anything you want. Most people let the AI do ~95% and just tweak a headline or two.

**Private by default.** No backend, no API keys, nothing uploaded. Your screenshots never leave your machine — images stay in the browser (IndexedDB), project data in `localStorage`. Use the hosted site, self-host it, or run the desktop build.

**Guides** (English & Korean): [how to use](https://screenshotstudio.dev/guides/how-to-use.html) · [screenshot sizes](https://screenshotstudio.dev/guides/app-store-screenshot-sizes.html) · [localization](https://screenshotstudio.dev/guides/app-store-screenshot-localization.html) · [fastlane upload](https://screenshotstudio.dev/guides/upload-app-store-screenshots-fastlane.html) · [simulator capture](https://screenshotstudio.dev/guides/take-ios-simulator-screenshots.html) · [writing captions](https://screenshotstudio.dev/guides/app-store-screenshot-captions.html)

---

## Two ways to use it

### 1. Just ask your AI agent (recommended)

Open this repo in Claude Code (or any AI coding agent), point it at your raw simulator screenshots, and say what you want — *"build a localized App Store screenshot set from these shots, English and Korean."* That's the whole interaction. You stay in plain language; the agent does everything:

- picks a layout per slide and writes the project **manifest**,
- names and places your **screenshots**,
- writes the **captions** in each language,
- renders the final PNGs and auto-fixes any layout problems (text overlapping the device, anything past the safe margins),
- optionally packages them for direct App Store Connect upload.

No terminal, no config — you describe the result and review what comes back. The agent already knows the format from [docs/project-import.md](./docs/project-import.md); it just reads that file and runs the commands for you.

<details>
<summary>The commands the agent runs (in case you want to run them yourself)</summary>

```bash
npm run headless:export -- ./my-screenshots ./out --report   # folder → final PNGs + layout check
npm run layout:loop      -- ./my-screenshots ./out --write    # auto-fix layout issues and re-render
```

The folder holds a `manifest.json`, screenshots named `{number}-{description}.{locale}.png` (e.g. `01-home.en.png`), and a captions CSV/JSON. Full reference: [docs/agent-cli.md](./docs/agent-cli.md).

</details>

### 2. Want to tweak by hand?

When you do want to touch something, ask the agent for an **editable project file** instead of flat PNGs, and it hands you a `.studio.zip`. Open it in the editor (**Open Project File** on the setup step), change whatever you like on the canvas, then export.

The bundle round-trips *every* edit losslessly — highlights, badges, ornaments, per-language screenshots — so you can bounce between the AI workflow and the visual editor freely. You can also start from scratch in the editor (**Setup → Edit → Localize → Export**) and skip AI entirely. Both paths produce the same App Store Connect-ready output.

---

## From screenshots to the App Store

The whole pipeline, end to end:

```
raw simulator shots  →  AI builds manifest + captions  →  render  →  PNGs (or fastlane upload)
                                                            ↑
                                            open .studio.zip in editor to tweak
```

Ask the agent to package for **fastlane** and the export comes out the way fastlane `deliver` expects — complete with an `Appfile`, `Deliverfile`, and `upload.sh` — so the finished screenshots go straight to App Store Connect with a single script. You provide your own App Store Connect credentials in the generated config; they're never part of this app.

---

## What you get

- **iPhone & iPad, correct sizes automatically.** Exports at the exact App Store Connect upload resolutions — iPhone 6.9″ / 6.5″ and iPad 13″ / 11″. The device type is detected from each screenshot's shape; you don't pick it.
- **Localization without an API.** Translate captions in *your own* AI tool. Export a template, copy the built-in translation prompt, paste both into any LLM, re-import the filled file. Screenshots and captions can both differ per language.
- **A real visual editor** when you want it — gradients, device frames, headlines, magnified highlight call-outs, badges, emoji accents, device tilt, two-page panoramic spreads.
- **One-click PNG export** — every slide rendered and packaged as a ZIP grouped by `{locale}/{device}/`, or as a fastlane-ready bundle.
- **Portable project files** (`.studio.zip`) you can save, reopen, and hand back and forth between the CLI and the editor.

---

## The four steps (visual editor)

1. **Setup** — pick device, slide count, theme color — *or* import an AI-built folder / reopen a saved `.studio.zip` and skip ahead.
2. **Edit** — compose each slide on the canvas.
3. **Localize** — manage languages, export/import the translation template, bulk-import per-language screenshots.
4. **Export** — render to PNG and download.

Total PNGs = `slides × languages`; each slide exports to the one device its screenshot belongs to.

---

## Run it yourself

```bash
npm install
npm run dev      # landing: http://localhost:5173 · app: http://localhost:5173/app/
```

Build a static bundle you can host anywhere (GitHub Pages, Cloudflare Pages, Vercel, Netlify, your own server):

```bash
npm run build    # → dist/
npm run preview  # preview the production build
```

The included GitHub Actions workflow deploys to GitHub Pages on push to `main` (enable Settings → Pages → Source: GitHub Actions). A native macOS build is also available via Tauri:

```bash
npm run tauri:dev
npm run tauri:build
```

---

## Under the hood

React + TypeScript, Vite, Tailwind v4, Fabric.js, Zustand, IndexedDB (`idb-keyval`), JSZip + FileSaver. Everything runs client-side.

```bash
npm run lint
npm run test:unit
npm run test:e2e
```

## License

[MIT](./LICENSE)
