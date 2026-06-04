---
name: verifier-project-import
description: Drive the step-1 project import (manifest JSON + locale-suffixed screenshots + caption CSV) end-to-end in a real browser and capture screenshot evidence. Use when verifying changes to the import pipeline (src/lib/projectImport.ts, projectImportRun.ts, bulkImageImport.ts, applyCaptionRows, or the ProjectSetup import UI).
---

# Project-import verifier

Runtime observation harness: assembles a realistic agent-prepared folder from
the e2e fixtures, drives the real app through the import flow headless, and
captures numbered screenshots + `::`-prefixed observations.

## Run

```bash
# dev server must be up (npm run dev — reuses localhost:5173; override with BASE_URL)
bash .claude/skills/verifier-project-import/make-sample.sh /tmp/verify-import
node .claude/skills/verifier-project-import/drive.mjs /tmp/verify-import
```

Outputs: `/tmp/verify-import/shots/*.png` (01 setup → 11 garbage-modal) and
stdout `::` lines. Read the screenshots — the numbers alone are not the verdict.

## What it covers

| Step | Expected (with the bundled sample) |
|---|---|
| happy-path modal | `Flashcard PDF — 슬라이드 4장 · 스크린샷 4개 · 캡션 21개 적용`, no 경고 toggle |
| editor thumbs | 4, aria-labels = the CSV's ko headlines |
| IDB blobs | 0 → 4 after commit → 8 during re-import dry-run → 4 after cancel (gc sweep) |
| per-locale | slide 1 `편집 언어: en` shows its own screenshot override; `ja` borrows the base |
| localize table | en/ja columns filled; slide 3 (hero) has no image row |
| probe: overwrite | re-import over existing → 덮어씁니다 note; cancel leaves 4 thumbs |
| probe: garbage | `readme.txt` → 경고 `무시된 파일: readme.txt`; manifest-only import still builds |
| console | zero errors |

## Gotchas

- The IDB probe must never `indexedDB.open()` a missing DB or
  `deleteDatabase` while the app holds a connection — an unversioned open
  creates a **store-less** `keyval-store` that breaks idb-keyval's upgrade and
  silently fails every image save (looks like an app bug; it isn't). The
  script guards with `indexedDB.databases()` and clears contents instead of
  deleting. Keep it that way.
- Screenshots reuse `e2e/fixtures/iphone_*.png` so `detectTypeFromAspect`
  sees real iPhone aspect ratios. Don't substitute arbitrary images.
- Known cosmetic default: an imported badge sits at `top: 0.03` (BadgePanel's
  default) and overlaps the headline on `text-top` slides — flagged
  2026-06-04, not a harness failure.
