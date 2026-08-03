# 0009. Example drawing as a static `.tdraw`-format asset

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context

Issue #19 wants a bundled example drawing that showcases all tools (labeled
shapes, bound arrows, a bound dimension, freehand sketch, text), loadable
from the onboarding flow and again later from the file actions.

## Decision

- Ship the example as `public/example-drawing.json`, a static asset in the
  exact project-file format from ADR 0006 (`format: "techdraw"`,
  `version: 1`).
- Load it with `fetch` + the existing `parseProject` validator
  (`lib/exampleDrawing.ts`) and hand the result to the same
  `applyLoadedProject` path used by Open / drag-and-drop.
- Element ids in the file are fixed strings (e.g. `ex-base`); bindings
  reference those ids so arrows and the dimension demonstrate real binding.
- It is loaded from two places: the final onboarding step and a permanent
  button in the toolbar's file group (New / Save / Open / Load Example),
  which plays the role of the issue's "File menu" in this flat-toolbar UI.

## Alternatives considered

- **Hard-code the elements in a TypeScript module** — would bypass the
  parser, letting the example drift from the schema silently, and it would
  land in the main bundle for every visitor.
- **Store it in `src/` and import it** — same drift risk; `public/` keeps it
  a plain static file that Vite and any static host serve as-is.

## Consequences

- The example always round-trips through the real parser, so format changes
  that break the example fail loudly (and the e2e test asserts the element
  count).
- The fetch URL honors `import.meta.env.BASE_URL`, so non-root deployments
  keep working.
- The file is user-visible and could be hand-edited or downloaded directly;
  invalid edits are caught by the same error path as a bad `.tdraw` file.
