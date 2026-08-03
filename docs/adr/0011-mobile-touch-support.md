# 0011. Mobile and touch-device support

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context

Issue #21: the app assumed mouse input and a wide screen. Phones opening a
shared link saw an overflowing fixed toolbar and no way to pan or zoom
(two-finger gestures did not exist), so the app was effectively unusable
below ~768px.

## Decision

- **Small-screen notice first.** On load below 768px width, show a
  dismissible "works best on desktop" notice (`MobileNotice.tsx`) with a
  "Try anyway" button. Dismissal persists in a
  `techdraw-mobile-notice-dismissed` localStorage flag in `lib/storage.ts`.
- **Touch gestures via native Pointer Events** in `Canvas.tsx`, no library.
  The canvas already used pointer events and `touch-action: none`, so single
  fingers map to the active tool unchanged. A second concurrent touch
  cancels any in-flight gesture and starts a pinch: the world point under
  the initial midpoint stays anchored to the moving midpoint (two-finger
  pan) while the finger-distance ratio scales the zoom (clamped by
  `clampZoom`). When one finger lifts, the survivor keeps panning.
- **Toolbar becomes a bottom sheet** below 768px: a single toggle handle at
  the bottom edge expands the full button set (flex-wrap grid); picking a
  tool collapses it again. Floating controls (zoom, grid, save indicator)
  lift above the bar.
- **44x44px minimum touch targets** inside a single
  `@media (max-width: 767px)` block (Apple HIG). Color swatches keep their
  small visual dot but grow a 44px hit area via `padding` +
  `background-clip: content-box`.
- **Notch safety** via `env(safe-area-inset-bottom)` padding on the sheet
  and offsets on floating controls, plus `viewport-fit=cover` in the
  viewport meta.

## Alternatives considered

- **A gesture library (e.g. hammer.js)** — rejected: one more runtime
  dependency for two gestures, and it would fight the existing pointer
  event handlers instead of extending them.
- **A hamburger menu replacing the toolbar** — a bottom sheet keeps every
  action one tap away and reuses the existing toolbar markup and test ids;
  a nested menu would add an extra tap per action.
- **No notice, responsive-only** — rejected by the issue: phone users
  should be told up front that the desktop experience is the primary one.

## Consequences

- All interaction paths now branch on `pointerType === 'touch'`; mouse and
  pen input keep the previous behavior exactly.
- Multi-touch e2e coverage dispatches raw touches through CDP
  (`Input.dispatchTouchEvent`) in `tests/mobile.spec.ts`, because
  Playwright's `touchscreen` API is single-touch only.
- The 768px breakpoint is duplicated in `App.tsx`, `Toolbar.tsx`
  (`MOBILE_MEDIA_QUERY`), and the CSS media query; keep them in sync.
