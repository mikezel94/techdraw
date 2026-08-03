# 0012. Mobile and touch-device support

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context

Issue #21: on phones and tablets the app is unusable — no pinch-to-zoom or
two-finger pan, the fixed top toolbar overflows screens under ~600px, and
touch targets are far below the 44px guideline. Shared links opened on a
phone bounce users immediately.

## Decision

- **Notice first, then the app stays fully usable on touch.** Viewports
  under 768px show a dismissible "works best on desktop" notice on first
  load ("Try anyway" continues). Dismissal persists in a
  `techdraw-mobile-notice-dismissed` localStorage flag
  (`lib/storage.ts`, alongside the onboarding flag).
- **Gestures extend the existing Pointer Events handlers** in `Canvas.tsx`;
  no touch-specific event APIs. A pointer map tracks every active pointer:
  - one finger drives the active tool exactly as a mouse does;
  - when a second finger lands, whatever the first finger started is
    cancelled (drafts/marquees dropped, element drags snapped back to their
    start position), and a pinch gesture state is captured;
  - while two fingers are down, the distance ratio zooms around the gesture
    midpoint (via the existing `clampZoom`) and midpoint movement pans;
  - lifting a finger ends the gesture; the remaining finger is inert until
    it lifts and touches again.
- **The canvas keeps `touch-action: none`**; buttons get
  `touch-action: manipulation` to drop the double-tap-to-zoom delay, and
  `viewport-fit=cover` was added so `env(safe-area-inset-*)` values flow
  through on notched devices.
- **Responsive layout under 768px:** the toolbar becomes a bottom sheet
  (wrapped rows, scrollable, safe-area bottom padding; the wordmark H1 stays
  for SEO, status text hides), the export menu opens upward, zoom controls
  move to the top-left and grid controls to the top-right, and the floating
  palette/extend chip grow and wrap.
- **44x44px minimum touch targets** under `max-width: 767px` OR
  `(pointer: coarse)` (covers wide touch-screen laptops). The extend chip
  switched to `translate(-50%, -50%)` centering so its size no longer leaks
  into the positioning math.

## Alternatives considered

- **Hamburger menu hiding secondary actions on mobile** — rejected: every
  tool stays one tap away in the wrapped bottom sheet; hiding file/export
  actions would silently reduce functionality.
- **Touch event APIs (`touchstart`/`touchmove`)** — rejected: the
  interaction code is already pointer-based; a parallel touch code path
  would duplicate all drag state machines.
- **Blocking phone users outright** — rejected by the issue; "Try anyway"
  must keep the app functional.

## Consequences

- e2e coverage lives in `tests/mobile.spec.ts`; multi-finger gestures are
  synthesized through the Chrome DevTools Protocol (`Input.dispatchTouchEvent`
  helpers in `tests/helpers.ts`) because Playwright's touchscreen API only
  covers single taps.
- A window-level capture-phase `pointerup`/`pointercancel` listener keeps
  the pointer map consistent when a pointer is released off-canvas (the text
  tool deliberately skips pointer capture).
- The desktop mouse/pen flow is unchanged: a single pointer drives the tool
  exactly as before.
