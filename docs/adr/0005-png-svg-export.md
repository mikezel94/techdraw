# 0005. PNG and SVG export from the content bounding box

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context

TechDraw had no way to get a drawing out of the browser. Users need raster
(PNG) for documents/printing and vector (SVG) for scaling and hand-off. The
export must capture only the drawing content — auto-cropped to its bounding
box — not the infinite canvas, and must render every element type (shapes,
labels, arrows, dimensions, freehand) exactly as it appears on screen.

## Decision

- A single `src/export.ts` module owns both exporters plus the download and
  timestamped-filename helpers (`techdraw-YYYYMMDD-HHMMSS.<ext>`).
- **PNG** reuses the on-screen renderer: `contentBounds` unions every element's
  `bboxOf` (plus padding), an offscreen canvas is sized to that box at the
  requested scale (2x default, 1x optional), and the existing `drawElement`
  paints each element into a translated context. This guarantees pixel parity
  with the canvas for all element types, labels, and dimensions.
- **SVG** serializes each element to its matching primitive (`rect`, `ellipse`,
  `line`, cubic-bezier `path` + `polygon` head for arrows, `polyline` for
  freehand, `text` for labels). Arrow control points come from the same
  `arrowControls` used on screen; dimension geometry comes from
  `computeDimensionGeometry`. The root `<svg>` uses a `viewBox` of the content
  bounds and a white background rect.
- To make this reuse possible, `drawElement`, `bboxOf`, `arrowControls`, the
  arrow-head constants, and `STROKE` are now exported from `Canvas.tsx`.
- The Export control is a dropdown on the floating toolbar (PNG 2x, PNG 1x,
  PNG 2x transparent, SVG). Transparent background is PNG-only; SVG is always
  white. Export is disabled when the drawing is empty.

## Alternatives considered

- Serializing the live `<canvas>` to PNG via `toDataURL` — rejected: it would
  capture the whole viewport (grid, selection handles, empty canvas) instead of
  a cropped, zoom-independent image of the content.
- A third-party serializer (e.g. `canvas-to-svg`) to emit SVG from the canvas
  draw calls — rejected: adds a dependency for output that is straightforward
  to build from the element model, and would still need dimension/label logic.
- Duplicating the render code in `export.ts` — rejected for PNG: it would drift
  from the canvas renderer. Reusing `drawElement` keeps one source of truth.

## Consequences

- PNG output always matches the canvas; new element types only need an SVG
  serializer added to `elementSvg`.
- SVG is a parallel implementation of appearance, so a visual change to
  `drawElement` (e.g. stroke width) must be mirrored in `export.ts`.
- `Canvas.tsx` now exports rendering internals, coupling `export.ts` to it;
  this is acceptable since both describe the same element appearance.
