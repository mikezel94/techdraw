# 0008. Hand-rolled onboarding overlay

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context

Issue #19 asks for a first-visit guided tour (4 spotlight steps) so new users
understand the toolbar, dimension binding, zoom/pan, and grid/snap. Tour
libraries such as driver.js or react-joyride are the usual off-the-shelf
answer. The project so far has exactly two runtime dependencies
(react, react-dom) and hand-rolls all UI in plain CSS.

## Decision

- Implement the tour as a small custom component
  (`src/components/OnboardingOverlay.tsx`) instead of adding a dependency.
- Steps anchor to stable DOM targets (`.toolbar`,
  `[data-testid="tool-dimension"]`, `.zoom-controls`, `.grid-controls`) via
  `getBoundingClientRect`, re-measured on step change and window resize.
- Spotlight effect is a fixed-position div over the target with a huge
  `box-shadow` cut-out; the full-screen root layer blocks interaction with
  the app while the tour runs.
- "Seen" state is a `techdraw-onboarded` localStorage flag
  (helpers live with the other persistence code in `lib/storage.ts`).
- The final step offers "Load Example Drawing" or "Start drawing"; skipping
  or finishing always sets the flag.

## Alternatives considered

- **driver.js / react-joyride** — a real runtime dependency (and a React
  peer-dependency risk for joyride) for four mostly static steps; their
  imperative DOM APIs fight the project's React-first, zero-dependency
  convention.
- **No tour, help modal only** — rejected by the issue: the shortcuts modal
  does not introduce dimension binding or the extend workflow in context.

## Consequences

- No new dependency; full control over copy, styling, and test ids.
- The tour must be kept in sync with the selectors it targets (mitigated:
  targets are the top-level control clusters, which are stable, plus
  `data-testid`s added for the tour and tests).
- e2e specs simulate a returning user via Playwright `storageState`
  (see `playwright.config.ts`); first-visit behavior is covered by
  `tests/onboarding.spec.ts` with a fresh state.
