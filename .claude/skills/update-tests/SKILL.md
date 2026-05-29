---
name: update-tests
description: Reconcile this project's tests after a code change — when a unit/e2e test fails, goes stale, or new behavior needs coverage. The core job is to classify each failure as "the test is now wrong (intended behavior changed)" vs "the code regressed (a real bug)" BEFORE touching anything, then fix surgically. Use after editing source when tests break, when a feature changed and its tests need updating, or when adding coverage for a change. For writing tests from scratch or picking a test layer, use the `test` skill.
license: MIT
---

# Update Tests

A failing test after a code change is a fork, not a chore. Either the code is wrong
(regression — fix the code) or the test encodes old expectations (fix the test).
**Editing a test to make it green without deciding which is the single most
dangerous move here** — it silently deletes a regression signal. This skill is the
discipline for getting that classification right.

## The non-negotiable rule

For every red test, answer **"is the test wrong, or is the code wrong?"** before
editing either. State the answer explicitly. Only then change something.

- Test is wrong (the change *intentionally* altered behavior) → update the test to
  the new expectation. Make sure the new assertion still *means* something.
- Code is wrong (the change broke behavior the test correctly guards) → fix the
  code, leave the test. The test just did its job.
- Genuinely unsure → reproduce the behavior in the real app (`npm run dev`, drive
  it) or read the spec in `TESTING.md` / the source. Do not guess.

Never make a test pass by deleting the assertion, loosening an exact geometry
check to a range, adding a `.skip`, or widening a selector until it matches
something. If a test is obsolete, delete the whole test with a one-line reason —
don't hollow it out.

## Workflow

1. **Run the relevant gate and read the actual failure.**
   - Logic: `npm run test:unit`
   - DOM / geometry: `npm run test:e2e` (add `--ui` to step through, or
     `npx playwright test e2e/<file>.spec.ts` for one file)
   Read the diff between expected and received — the number/selector that moved is
   the clue to which side is wrong.

2. **Classify each failure** (the rule above). Check `git diff` against the source:
   did the change intend to alter this behavior?

3. **Fix the right side.**
   - Regression → fix source, re-run, confirm the test passes for the right reason.
   - Stale test → update the expectation. Keep assertions exact and meaningful
     (assert `toBe(cw / 2)`, not "roughly centered").

4. **Cover the gap.** If the change added behavior with no test, add one in the
   correct layer (see the `test` skill for layer choice). Bug fix → add a test that
   fails before the fix and passes after, so the regression can't return.

5. **Run the full gates** before committing:
   `npm run build && npm run lint && npm run test:unit && npm run test:e2e`.

## Project-specific gotchas

- **Geometry tests live where the math lives.** Seam/layout numbers come from
  `getDeviceBaseAnchor` / `getDeviceLayout` in `src/canvas/templateLayouts.ts`. If a
  template's horizontal bias changes (e.g. `hero-bleed` `cw*0.7`), both
  `templateLayouts.test.ts` (pure) and the `span-group.spec.ts` seam assertion may
  move. Update both, and re-read `TESTING.md §3` — the seam-centering invariant is
  load-bearing.
- **Device dimensions ⇒ regenerate fixtures, don't hand-edit them.** If you change
  export sizes in `src/constants/deviceSpecs.ts`, the committed diagnostic PNGs and
  `detectDeviceFromAspect`'s buckets may both shift. Regenerate with
  `python3 e2e/fixtures/generate_fixtures.py` and update `deviceSpecs.test.ts`'s
  boundary cases. A hand-edited fixture is no longer reproducible from source.
- **The `__editor` hook is the contract for geometry tests.** If you rename
  `layerName` constants (`src/canvas/layerNames.ts`) or change what
  `window.__editor` exposes in `FabricCanvas.tsx`, every `getObjects().find(o =>
  o.layerName === ...)` lookup in the specs breaks. Fix the specs to the new names;
  don't weaken the lookups.
- **Persistence specs are storage-key sensitive.** They key off
  `auto-image:project` / `auto-image:api-keys` and clear `localStorage` up front
  (not via `clearAppState`, whose `addInitScript` re-wipes on every reload). If you
  rename a persist key or change the persist split, update `persistence.spec.ts` and
  `helpers.ts` together.
- **Span-group adjacency is a structural invariant** (`leader.index + 1 ===
  follower.index`, enforced by the store). A test that violates it is testing an
  impossible state — fix the test, not the store.
- **One known-good warning:** `npm run lint` has one expected exhaustive-deps
  warning in `ScreenshotPanel`. Don't "fix" tests/lint config to chase it.

## When tests legitimately get deleted

A test becomes obsolete when the behavior it guards is intentionally removed (a
template dropped, a step merged). Delete the whole test block, and note in the
commit why the behavior no longer exists. Don't leave skipped husks.
