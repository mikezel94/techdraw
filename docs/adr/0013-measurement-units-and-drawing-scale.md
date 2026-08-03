# 0013. Measurement units and drawing scale as a px-to-unit scalar

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context
Dimension annotations showed raw canvas pixel counts, which are meaningless
outside the browser. For real fabrication/documentation use (GitHub issue
#22) users need real-world units (mm, cm, m, in, ft) and a way to state how
canvas pixels map to them, plus an on-canvas reference so printed output can
be checked against a ruler.

## Decision
- Model measurement settings as a pair `{ unit, scale }` where `scale` is the
  number of real-world units represented by **one canvas pixel** ("1 px =
  0.5 mm"). All geometry stays in canvas pixels; conversion happens only at
  label/export/legend time.
- The unit list (`px, mm, cm, m, in, ft`) and its per-unit label precision
  live in a single `src/lib/units.ts` module; `px` is the default and always
  uses an effective scale of 1.
- The controls live in the existing bottom-right grid panel (unit `<select>`
  + "1 px = N" number input) rather than a new settings dialog.
- A scale bar is drawn in screen space in the bottom-left corner above the
  zoom controls. Its reference length snaps to the largest 1/2/5 × 10^n
  unit value that fits ~120 screen px, so it stays readable at any zoom.
- `unit`/`scale` persist in the localStorage auto-save and in `.tdraw`
  project files as **optional** fields; files/saves without them load with
  the px defaults, so no format version bump is needed.
- Dimension labels use fixed per-unit decimal precision (1 for mm/in, 2 for
  cm/m/ft, 0 for px) in both the canvas renderer and the SVG/PNG exports.

## Alternatives considered
- Storing geometry in real-world units and converting for display — rejected:
  it would migrate every element field, all hit-testing, snapping, and the
  project-file schema, for no functional gain while pixels remain the
  rendering primitive.
- A separate scale *dialog* or settings page — rejected: a two-control panel
  extension is enough, and keeps the one-screen, no-menus character of the UI.
- A fixed-length scale bar with a changing label — rejected: the bar itself
  must stay true to the stated length, which requires resizing it with zoom.

## Consequences
- Dimension labels, SVG export, and PNG export all thread a
  `MeasurementSettings` parameter (defaulting to px/1), so the default look
  is unchanged apart from an explicit "px" suffix on labels.
- Old auto-saves and `.tdraw` files keep loading; future removal or
  redefinition of the fields would need the optional-field tolerance to be
  kept or a version bump.
- E2E tests verify the conversion through the SVG export text and the scale
  bar's pixel extent, since canvas-drawn text is not readable by the DOM.
- DXF export (not yet implemented) must apply the same conversion.
