# 0002. E2E testing with canvas pixel probes

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context

techdraw renders every shape to a single `<canvas>` via the 2D context — drawn
boxes, ellipses, arrows, dimension lines, and the grid produce **no DOM nodes**
to assert on. A test suite that only checks React state or DOM (button classes,
element counts) cannot prove that a tool actually *drew* the right thing, that
selection/pan/zoom moved pixels, or that snapping aligned geometry. We needed a
way to verify real rendering end-to-end with Playwright (the chosen runner).

## Decision

- Verify drawing by **sampling canvas pixels** with `getImageData` and asserting
  on colors near expected coordinates ("color probes").
- Share the probe utilities in `tests/helpers.ts` (`colorsNear`, `isDark`,
  `isWhite`, `isRed`, `drawShape`, `firstDarkX`, `countGridPixels`) instead of
  duplicating them per spec.
- Prefer **behavioral, tolerant assertions** over exact pixels:
  - Draw at on-grid coordinates so snapping is deterministic.
  - Use color *predicates* with tolerances, and make `isRed` red-*dominant*
    (`r>150 && r>g+30 && r>b+30`) so it catches anti-aliased 1px strokes (which
    blend toward pink) while rejecting white, grid gray, ink, and selection blue.
  - Assert presence/absence of ink in a small region, or relative facts
    ("edge moved right", "large label taller than small"), not exact RGB.
- Keep using `data-testid` / ARIA roles for the DOM-facing UI (toolbar, palette,
  zoom %, element count), and pixel probes only for canvas content.
- Hold modifier keys with `keyboard.down/up` around a click (e.g. Shift-click to
  multi-select) rather than relying on `mouse.click({ modifiers })`.

## Alternatives considered

- DOM/`data-testid` assertions only — rejected: cannot see canvas-drawn content,
  so drawing, panning, and snapping would go untested.
- Snapshot/screenshot diffing — rejected: brittle to anti-aliasing, fonts, and
  DPR; gives a whole-image pass/fail with no localized, readable assertion.
- Exposing internal element state to tests — rejected: couples tests to
  implementation and bypasses the real rendering path we want to exercise.

## Consequences

- Tests exercise the genuine render pipeline and catch real drawing regressions.
- Tests are inherently coordinate- and pixel-sensitive; robustness depends on
  on-grid coordinates, small probe radii, tolerant color predicates, and
  relative assertions. New specs should reuse `tests/helpers.ts` and follow the
  same tolerance discipline.
- Verified stable at the time of writing: 25 specs pass, and 50/50 under
  `--repeat-each=2`.
