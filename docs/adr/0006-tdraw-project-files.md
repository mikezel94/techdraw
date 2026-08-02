# 0006. Portable `.tdraw` project files

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context
Auto-save (ADR 0004) keeps work alive across refreshes, and PNG/SVG export
(ADR 0005) produces flat images — but neither gives users a portable,
full-fidelity artifact they can share, version-control, or reopen for further
editing. Users need a dedicated project file (GitHub issue #16).

## Decision
- A single `src/projectFile.ts` module owns the file format: schema,
  serialization, validation, download, and file reading.
- The format is pretty-printed JSON with a `format: "techdraw"` magic marker,
  an integer `version` (currently `1`), metadata (`title`, `createdAt`,
  `modifiedAt`, `appVersion`), the viewport (`camera`), the grid toggles
  (`gridEnabled`, `snapEnabled`), and the full `elements` array. The element
  array is the same in-memory model, so round-trips are lossless.
- Files use the `.tdraw` extension and a sanitized, title-derived filename
  (`<title>.tdraw`, falling back to a timestamp).
- Save serializes the current state and triggers a browser download. Open uses
  a hidden `<input type="file">`; drag-and-drop anywhere on the canvas also
  opens a file. Both paths funnel through one `readProjectFile` →
  `applyLoadedProject` flow.
- Validation rejects non-JSON, a missing/wrong `format` marker, an unsupported
  `version`, and structurally invalid elements/viewport, each with a specific
  message. Failures surface in a dismissible red error toast (`role="alert"`);
  they never throw into the UI or corrupt the current drawing.
- The app version is injected at build time via a Vite `define`
  (`__APP_VERSION__` read from `package.json`).

## Alternatives considered
- Reusing the `localStorage` payload shape (`SavedProject`) verbatim — rejected:
  a portable file wants human metadata (title, timestamps, app version) and a
  `format` marker so non-project JSON is rejected up front.
- A binary/zip container — rejected: JSON keeps the file diffable and
  version-controllable, which is a stated goal, and the scene is small.
- Letting an invalid file partially load — rejected: all-or-nothing loading
  avoids a half-restored scene; the existing drawing is left untouched on error.

## Consequences
- Users get a shareable, version-controllable, lossless project file.
- The file format is a second public schema alongside `SavedProject`; element
  changes now require thinking about both, and a future version bump needs a
  migration branch in `parseProject`.
- Drag-and-drop is window-scoped (drops anywhere open the file), which is
  simpler than hit-testing the canvas and matches user intent.
