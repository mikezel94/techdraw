# 0007. Grouping via a shared groupId on elements

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context

Issue #18 adds multi-select editing plus grouping (Ctrl+G / Ctrl+Shift+G).
Grouped elements must select and move as one unit, survive undo/redo, and
persist through auto-save and `.tdraw` files. The element model is a flat
`Element[]` discriminated union with no nesting, so grouping needs a
representation that fits that flat structure.

## Decision

- Store an optional `groupId?: string` on `BaseElement`, so every element type
  can belong to a group. Elements sharing a `groupId` form one group.
- Grouping assigns a fresh `genGroupId()` to every selected element; ungrouping
  deletes `groupId` from the selected elements.
- Selection and drag are group-aware in `App.tsx`: `expandGroups(ids)` grows any
  incoming selection/drag set to include all elements sharing a `groupId` with a
  member. It is applied on the selection path (`onSelect`) and on drag start
  (`handleDragStart`), so a group always selects and moves together.
- Copy/paste/duplicate remap `groupId` through a per-clone map, so a copied set
  keeps its internal grouping under a new id while never colliding with the
  originals.
- Grouping is just another element property, so it flows through the existing
  snapshot history, auto-save, and project-file serialization unchanged.

## Alternatives considered

- A separate `groups: string[][]` registry on the side — keeps elements lean,
  but every code path that adds/removes/copies elements would also have to keep
  the registry in sync, and undo/redo of element arrays would desync from it.
- Nested group elements containing children — breaks the flat `Element[]` model,
  the renderer, hit-testing, and bbox, all of which iterate a flat list.
- Reusing element ids as group anchors (group = "same id as leader") — couples
  group identity to a specific element's lifetime; deleting the leader would
  dissolve the group.

## Consequences

- Flat model and all existing pipelines (history, persistence, export) needed no
  structural changes; `projectFile` validation ignores the optional field.
- A group cannot be partially selected: selecting or shift-clicking any member
  re-expands to the whole group. Users ungroup (Ctrl+Shift+G) to edit members
  individually.
- `groupId` is non-obvious in that selection expansion, not a group object, is
  what enforces togetherness — documented here and on `expandGroups`.
