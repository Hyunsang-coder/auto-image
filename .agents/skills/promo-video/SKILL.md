---
name: promo-video
description: Record a short promo/demo video of App Store Screenshot Studio for X / Threads / landing pages. Drives the real app headless through the core story — English-only import → empty Localize columns → CSV import fills every language → Export re-renders per locale → ZIP — with a painted-on cursor, then transcodes to an H.264 mp4. Use when the user asks for a promo video, demo clip, marketing video, or "홍보 영상 / 데모 영상".
---

# Promo video recorder

Records the studio's pain-point→payoff story as a paced screen capture. Every
pixel on screen is the **real app UI** driven via Playwright; the only synthetic
element is a painted-on cursor (Playwright's real cursor isn't captured). The OS
file dialog can't be captured headless, so the CSV pick is done programmatically
— **no fake dialog is shown** (an earlier version faked one; don't reintroduce
it, it reads as dishonest).

## The story it tells (~30s)

1. **Import** an English-only set (manifest + en screenshots + en captions).
2. **Editor** — browse a few slides (still English-only).
3. **Localize** — target-language columns all read "No translation" (the pain),
   then **Import the translated CSV** and the whole table fills at once.
4. **Export** — flip the preview locale through two languages so captions
   re-render, then click Export ZIP (every slide × language).

## Run

```bash
# 1. build a self-contained sample (en-only set + translated CSV, from e2e fixtures)
bash .agents/skills/promo-video/make-sample.sh /tmp/promo-demo

# 2. record (dev server is auto-started if localhost:5173 is down)
node .agents/skills/promo-video/record-demo.mjs \
  --in /tmp/promo-demo/import-en \
  --csv /tmp/promo-demo/translated.csv \
  --out /tmp/promo-demo/promo.mp4
```

Then verify by extracting frames before sending to the user (don't trust the run
log alone — confirm the empty columns, the filled table, and the per-locale
render actually appear):

```bash
ffmpeg -i /tmp/promo-demo/promo.mp4 -vf fps=1/4 /tmp/promo-demo/frames/f%02d.png
```

## Inputs

| Flag | Default | Meaning |
|---|---|---|
| `--in` | (required) | Folder with the **English-only** import set: `manifest.json` + `NN[-desc].en.png` + an en-only caption CSV. Same format as `docs/project-import.md`. |
| `--csv` | (required) | The **translated** caption CSV imported on camera — all-languages-as-columns (localize template format). Its `targetLocales` should match the manifest's. |
| `--out` | `promo.mp4` | Output path. If no ffmpeg is found, a `.webm` is written next to it instead. |
| `--base-url` | `http://localhost:5173/app/` | Override to record against a different server (e.g. the hosted site). |
| `--width` / `--height` | `1280` / `800` | Recording viewport. |
| `--keep-webm` | off | (reserved) |

Use a real app's assets for a real promo: point `--in` at that app's
`launch-screenshots` folder filtered to `*.en.png` + an en-only caption file, and
`--csv` at its fully translated `screenshot-copy.csv` (the `screenshot-copy`
skill produces exactly this). The bundled sample is only a fallback.

## ffmpeg

Needed to make the X/Threads-friendly H.264 mp4. Resolved in order:
`$FFMPEG` → system `ffmpeg` on PATH → the `ffmpeg-static` npm module. Without
any, the raw `.webm` is kept (VP8 — fine for the landing page, **not** accepted
by X). One-time setup: `brew install ffmpeg` (or `npm i -D ffmpeg-static`).

## Pacing

Timings live as `sleep(ms)` calls inside `record-demo.mjs`, grouped by scene.
The render waits (Export preview re-render, ZIP progress) are the slowest knobs —
tune those first if the clip drags. The fade-out duration is derived from the
measured run length automatically.

## Gotchas

- **Slide thumbnails are clicked by index** (`button[draggable="true"]` nth), not
  by headline text, so the editor scene is data-agnostic. Export locales are read
  live from the `<select>` (first two non-source options) — don't hardcode either.
- Preview screenshots stay in the **base (English) language** unless the import
  set also carries per-locale screenshots (`NN-desc.ko.png`, …); captions still
  re-render per locale. Add localized screenshots to `--in` if you want the
  device screens to change too, not just the overlay text.
- The script reuses a running dev server and leaves it alone; it only tears down
  a server it started itself. If you started `npm run dev` separately, kill it
  yourself afterward.
- Everything shown must be real. If a step can't be captured (OS dialogs), skip
  showing it — never paint a fake UI to stand in for it.
