# 0003. User-adjustable arrow bend as a scalar offset

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context

Arrows had fixed curvature: bound arrows followed a bezier derived from the
bound shapes' surface normals, and free arrows were straight lines (later a
gentle default bow). Users need to flex an arrow themselves — route it around
other shapes or adjust how it looks — so the curve must be user-draggable and
survive selection changes, endpoint drags, and undo/redo.

## Decision

- Store a single optional scalar `bend?: number` on `ArrowElement`: the signed
  perpendicular offset of the curve apex from the straight chord (positive =
  left of the start→end direction).
- A selected arrow shows a **circular midpoint handle** (endpoint handles stay
  square). Dragging it sets `bend` to the pointer's perpendicular offset from
  the chord; the curve is a quadratic elevated to a cubic.
- Because a quadratic only reaches halfway toward its control point, the
  control point is placed at **twice** the apex offset, so the shaft passes
  exactly through `mid + perp * bend` at t = 0.5 — the handle sits right under
  the pointer while dragging.
- An explicit `bend` takes priority over binding-normal curvature.
  `bend === undefined` keeps the defaults (bound → normal-based curve, free →
  gentle bow); `bend === 0` is an explicitly straightened arrow.
- Double-clicking a bent arrow deletes `bend`, restoring the default curve.

## Alternatives considered

- Storing explicit cubic control points — more freedom, but unbounded shape
  complexity, two extra draggable handles per arrow, and control points drift
  awkwardly when endpoints move.
- Storing the dragged midpoint coordinate — redundant with the endpoints; a
  scalar offset stays meaningful when endpoints are dragged or the arrow is
  translated.
- Session-only bending (no persistence) — rejected: the curve must survive
  undo/redo and deselection like any other element property.

## Consequences

- Compact model; hit-testing and bbox needed no changes because they already
  sample the cubic returned by `arrowControls`.
- Bend drags reuse the endpoint-drag history path (`onDragStart` /
  `onDragEnd(moved)`); the double-click reset pushes its own history entry.
- The 2× control-point factor is non-obvious — it is documented in a comment
  on `arrowControls` and here.
