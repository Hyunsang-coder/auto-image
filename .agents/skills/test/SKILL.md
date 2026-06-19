---
name: test
description: Test the App Store Screenshot Studio app across its three verification layers — logic (pure-function unit tests via Vitest), real behavior (canvas pixels / export split driven in a real browser), and e2e (DOM flows via Playwright). Use when asked to test a change, add coverage, verify a feature works, or run the test gates. Routes the change to the right layer instead of defaulting to e2e for everything. For reconciling tests that broke after a code change, use the `update-tests` skill instead.
---

# Test

This app is a fully client-side SPA. Some things are provable by a pure function,
some only by the DOM, and some only by the pixels a canvas actually paints. Using
the wrong layer either misses the bug or pays browser-boot cost for a 1ms check.
**Pick the layer that matches what the change can break.** Default to the cheapest
layer that can actually prove the behavior.

## The three layers

| Layer | Proves | Runner | Lives in | Command |
|---|---|---|---|---|
| **Logic** | Pure functions: math, mapping, reducers, prompt building | Vitest (jsdom) | `src/**/*.test.ts` | `npm run test:unit` |
| **Real behavior** | Canvas render, export split, seam alignment, fonts — things only true in pixels | Playwright + `window.__editor` + fixture PNGs | `e2e/*.spec.ts` (geometry) / manual drive | `npm run test:e2e` |
| **E2E** | DOM flows: step gating, forms, slide list, persistence | Playwright | `e2e/*.spec.ts` | `npm run test:e2e` |

The two file globs never overlap by design: unit tests are `*.test.ts` under
`src/`, Playwright owns `*.spec.ts` under `e2e/`. Vitest's `include` is pinned to
`src/**/*.test.ts` in `vite.config.ts`.

## Choosing the layer

Ask: *what is the smallest thing that can prove this change is correct?*

- **Pure input→output, no DOM, no Fabric instance** → logic test. Examples:
  `detectDeviceFromAspect`, `deviceSpecOf`, `getDeviceBaseAnchor` (seam math),
  `safeStorage` quota handling, store actions (span link/unlink, slide add/remove),
  `buildPrompt`/`parseJsonArray` in `translate.ts`. **Fast — prefer this.**
- **A user can click through it and the DOM reflects the result** → e2e. Examples:
  step navigation/gating, project create/reset, headline edit appearing in the
  slide list, localize gating, export summary + ZIP-button-disabled-while-running.
- **Only the rendered pixels prove it** → real-behavior. Examples: a screenshot
  actually spanning two slides, the export slicing into two aligned halves, the
  device straddling the seam, corner-radius scaling, font rendering on export.
  The DOM shows none of this.

A single change can need two layers (e.g. seam centering has a pure-math test in
`templateLayouts.test.ts` *and* a geometry e2e assertion in `span-group.spec.ts`).

## Logic layer (Vitest)

- Test only genuinely pure exports. If a function builds Fabric objects or needs a
  live `Canvas`, it belongs in the real-behavior layer, not here.
- Construct minimal inputs. `getDeviceBaseAnchor` only reads `slide.template` and
  `slide.deviceFrame.model` — stub a `Slide` with `as unknown as Slide` rather than
  filling every field (see `src/canvas/templateLayouts.test.ts`).
- Run with `npm run test:unit` (or `npm run test:unit:watch` while iterating).
- Assert exact numbers for geometry (`toBe(cw / 2)`), not ranges — the math is
  deterministic.

## Real-behavior layer (browser-driven)

Some behavior is real only in pixels. Two ways to verify, in order of preference:

**A. Automated geometry assertion (preferred — make it a repeatable spec).**
The editor exposes a read-only hook at `window.__editor`
(`{ canvas, getState(), findByLayer() }`, set in `FabricCanvas.tsx`). Read object
bounding boxes through it and assert geometry. This is how `span-group.spec.ts`
proves the device centers on the seam:

```js
const c = window.__editor.canvas
const dev = c.getObjects().find(o => o.layerName === 'device-frame')
const b = dev.getBoundingRect()
// expect Math.round(b.left + b.width / 2) === c.width / 2  (the seam)
```

**B. Manual drive when you must inspect pixels you can't measure** (color of a
half, gridline alignment after an export split). Process:

1. `npm run dev` (serves on `localhost:5173`).
2. Use a committed fixture from `e2e/fixtures/` — `span_iphone.png` (1320×2868) or
   `span_ipad.png` (2064×2752). Each is split red-**L** / blue-**R** with a yellow
   seam line at center and horizontal gridlines, so a split is unambiguous.
3. Serve it where the page can fetch it: copy into `public/` (Vite serves it at
   `/<name>`). **Remove it from `public/` afterward** — `public/` holds only real
   app assets; the fixtures live in `e2e/fixtures/`.
4. Inject into the React file input (a native file dialog is invisible to
   automation):

   ```js
   const blob = await (await fetch('/span_iphone.png')).blob()
   const dt = new DataTransfer()
   dt.items.add(new File([blob], 'span_iphone.png', { type: 'image/png' }))
   const input = document.querySelector('input[type=file]')
   input.files = dt.files
   input.dispatchEvent(new Event('change', { bubbles: true }))
   ```
5. Walk the flow, then **measure, don't eyeball** — read geometry via
   `window.__editor` and assert (seam center, complementary halves, aligned
   gridlines). See `TESTING.md §2–§3` for the full worked example.

### Fixtures

Committed under `e2e/fixtures/`, generated by `generate_fixtures.py`. Their
dimensions mirror the Apple export sizes in `src/constants/deviceSpecs.ts` so the
aspect auto-detector frames each as the right device on upload. If those specs
change, regenerate (don't hand-edit):

```bash
python3 e2e/fixtures/generate_fixtures.py
```

Need a different diagnostic (e.g. a new device, or a non-split pattern)? Add it to
the `FIXTURES` list / extend `build()` in that script and re-run, so every fixture
stays reproducible from source.

## Gates (all must be green before commit)

```bash
npm run build      # tsc -b && vite build — 0 errors
npm run lint       # eslint . — 0 errors (1 known exhaustive-deps warning in ScreenshotPanel)
npm run test:unit  # vitest run — logic layer
npm run test:e2e   # playwright (chromium) — DOM + geometry layers
```

Playwright reuses an already-running dev server on `localhost:5173` or starts one.

## Writing a new test — checklist

1. Name what the change can break, and pick the cheapest layer that proves it (above).
2. Logic → add a `*.test.ts` beside the source under `src/`. Behavior/e2e → add to
   the matching `e2e/*.spec.ts` (one spec per step / feature: `navigation`,
   `step1`–`step4`, `span-group`, `persistence`, `device-rotation`).
3. For geometry, assert through `window.__editor`, never by screenshot-eyeballing.
4. Run that layer's command; then run the full gates before committing.
5. Commit the test with the code it covers (one intent per commit).
