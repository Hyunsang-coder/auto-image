# Testing

This app is a fully client-side SPA (no backend), so verification has two layers:
an automated Playwright e2e suite, and a manual browser-driven check for the
canvas/render behavior that pixels — not the DOM — actually prove.

## 1. Gates (run before every commit)

```bash
npm run build     # tsc -b && vite build — must be 0 errors
npm run lint      # eslint . — 0 errors (1 known exhaustive-deps warning in ScreenshotPanel)
npm run test:e2e  # playwright (chromium) against the Vite dev server
```

`playwright.config.ts` reuses an already-running dev server on `localhost:5173`,
or starts one. Specs live in `e2e/` — one per step plus `navigation`,
`span-group`, and `persistence`.

### What the e2e suite covers

- **navigation / step1–4** — step gating, project create/reset, slide list,
  headline edit reflecting into the list, localize gating, export summary +
  preview render + ZIP-button disabled-while-running.
- **persistence** — headline edit survives reload; span group survives reload;
  reset clears storage durably. (Clears `localStorage` once up front rather than
  via `clearAppState`, whose `addInitScript` re-wipes on every reload.)
- **span-group** — link affordance, canvas width 440→880 on link, unlink,
  follower-click routes to leader, localize "N·N+1" label, export count
  (`slides × locales`), and **device centered on the seam** (see §3).

The editor exposes a small read-only inspection surface for tests at
`window.__editor` (set in `FabricCanvas.tsx`): `{ canvas, getState(), findByLayer() }`.
Geometry assertions read object bounding boxes through it.

## 2. Manual browser-driven verification (span groups)

Some behavior is only real in pixels: does one screenshot actually span two
slides, and does export slice it into two aligned halves? The DOM can't show
this, so drive the running app directly. This is the exact process used.

1. **Start the dev server**: `npm run dev` (serves on `localhost:5173`).

2. **Make a diagnostic fixture** — a tall (iPhone-aspect, 1320×2868) PNG with a
   clearly asymmetric left/right design so the split is unambiguous: left half
   red with an "L", right half blue with an "R", a yellow vertical line at the
   exact horizontal center (the expected seam), and horizontal gridlines to
   check vertical alignment across the split. (Generated with Pillow.)

3. **Serve the fixture** so the page can load it without a native file dialog:
   drop it in `public/` (Vite serves it at `/span_test.png`). *Remove it
   afterward — it is a throwaway, not a committed asset.*

4. **Inject it into the React file input** (clicking a file input opens a native
   dialog the automation can't see). In the page context:

   ```js
   const blob = await (await fetch('/span_test.png')).blob()
   const dt = new DataTransfer()
   dt.items.add(new File([blob], 'span_test.png', { type: 'image/png' }))
   const input = document.querySelector('input[type=file]')
   input.files = dt.files
   input.dispatchEvent(new Event('change', { bubbles: true }))  // fires React onChange
   ```

5. **Walk the flow**: upload to slide 1 → it fills the iPhone frame (aspect is
   auto-detected). Link slide 1 + 2 ("다음 슬라이드와 연결") → slide list shows a
   single **2-page span** row (L·1 / R·2) and the canvas widens to **880px** with
   a dashed seam guide at center.

6. **Measure geometry, don't eyeball** — read the device bounding box via the
   inspection hook and assert it straddles the seam:

   ```js
   const c = window.__editor.canvas
   const dev = c.getObjects().find(o => o.layerName === 'device-frame')
   const b = dev.getBoundingRect()
   ;({ seam: c.width / 2, deviceCenter: Math.round(b.left + b.width / 2) })
   // expect deviceCenter === seam
   ```

7. **Verify the export split** on step 4 (Export): render the preview for each
   half. Slide 1 = left half (red **L**, ending at the seam); slide 2 = right
   half (blue **R**, starting at the seam). They are complementary and the
   gridlines line up. Each half renders at exact device aspect (440×956 preview
   = full 1320×2868 export), sliced from one 2×-wide render at `halfWidth`, so
   the seam is pixel-perfect by construction. Total PNGs = `slides × locales`.

## 3. The seam-centering behavior

A 2-page span centers the device on the seam **regardless of template**. The
single-slide templates bias the device horizontally — `hero-bleed` at
`cw*0.7`, `split` at `cw*0.76` — which on the 880px span canvas would push the
device onto page 2 (measured center 616, not 440). `applyTemplate(..., {
spanCentered: true })` overrides `centerX` to `cw/2` for the span render path
(both the editor's grouped canvas and `renderSpanGroup` in export), so the
device straddles the seam for every template. Guarded by the
`링크하면 기기가 seam(캔버스 중앙)에 정렬됨` e2e test using the default
hero-bleed leader.
