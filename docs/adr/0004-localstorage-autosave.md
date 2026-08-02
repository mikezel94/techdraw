# 0004. localStorage auto-save for persistence

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context
TechDraw had zero persistence: all state lived in React memory, so a refresh
or tab close destroyed the drawing. For a technical-drawing tool where work
takes real time to produce, this blocks trusting the app with real work
(GitHub issue #14).

## Decision
- Persist the full scene (elements, camera pan/zoom, grid/snap toggles) to
  `localStorage` under a single key (`techdraw-project`).
- Payload is JSON with a `version` field and a `savedAt` ISO timestamp, so
  future schema migrations can branch on version and the UI can show when the
  restore came from.
- Saves are debounced (~800 ms after the last committed change) in a single
  `useEffect` over the persisted state; there is no explicit "save" action.
- Restore is synchronous and automatic at mount via lazy `useState`
  initializers; a dismissible toast reports the restore time.
- A "New Drawing" toolbar action clears state and removes the key, guarded by
  a confirmation dialog.
- Storage failures (quota exceeded, storage unavailable) never throw into the
  UI; they surface as a dismissible warning banner.
- An empty scene clears the key instead of saving, so a fresh load never
  shows a spurious "restored" toast.

## Alternatives considered
- IndexedDB — more capacity, but async and far more API surface; the scene
  JSON fits comfortably in the ~5 MB localStorage quota for the foreseeable
  future.
- Manual save/export only — puts the burden on the user and still loses work
  on accidental refresh; rejected as the primary mechanism (export may come
  later as a separate feature).
- Save on every keystroke/drag frame — wasteful; debouncing on committed
  state changes is cheap and meets the <1 s requirement.

## Consequences
- Drawings survive refresh with no user action.
- The persisted shape becomes a de facto public schema: changing element
  fields later requires a version bump and a migration path in
  `loadProject`.
- Tests run in fresh browser contexts, so persistence does not leak between
  Playwright specs.
- Private-browsing quota errors are handled, but the user must notice the
  banner — persistence silently degrades to in-memory only.
