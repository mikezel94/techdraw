# AGENTS.md — techdraw

## Project Overview

**techdraw** is a browser-based technical drawing / diagramming application built with React 19, TypeScript, and the HTML5 Canvas API. It provides an infinite canvas with pan/zoom, a grid with snapping, and a set of drawing tools for creating boxes, ellipses, arrows, lines, freehand pencil strokes, text labels, and engineering-style dimension annotations. Shapes support inline labels with configurable font scale (S/M/L) and a color palette. Arrows can bind to shapes so they follow when shapes move. A "box extend" workflow lets users chain connected boxes with a single click.

There is no backend — all state lives in React component state (no persistence layer yet).

## Tech Stack

| Layer | Choice |
|---|---|
| UI framework | React 19 (function components + hooks, no class components) |
| Language | TypeScript 7 (strict mode, `noUnusedLocals`, `noUnusedParameters`) |
| Bundler / dev server | Vite 8 with `@vitejs/plugin-react` |
| Rendering | HTML5 `<canvas>` via a single `Canvas.tsx` component (imperative 2D context drawing inside React) |
| Styling | Plain CSS (`src/index.css`), no CSS modules or preprocessors |
| Testing | Playwright (end-to-end, Chromium only) |

## Commands

```bash
npm run dev        # Start Vite dev server on port 5173 (strict port)
npm run build      # Type-check (tsc) then bundle with Vite
npm run preview    # Serve the production build locally
npm test           # Run Playwright e2e tests (auto-starts dev server)
```

Playwright is configured to reuse an existing dev server outside CI (`reuseExistingServer: !process.env.CI`).

## Architecture

```
src/
├── main.tsx            # React entry point (StrictMode)
├── App.tsx             # Root component: all state, history (undo/redo), keyboard shortcuts,
│                       #   toolbar/palette/zoom/grid UI orchestration
├── types.ts            # Element union type (pencil | rect | ellipse | line | arrow | text | dimension),
│                       #   Tool type, ArrowBinding, genId()
├── camera.ts           # Camera (pan/zoom) model, screen↔world transforms, grid snapping helpers
├── dimensions.ts       # Dimension-line geometry, rendering (drawDimension), hit-testing, bbox
├── labelFont.ts        # Label font-size fitting logic for shape labels (S/M/L scales)
├── index.css           # All application styles
└── components/
    ├── Canvas.tsx       # <canvas> element: pointer handling, drawing loop, hit-testing, selection,
    │                    #   marquee select, arrow endpoint dragging, grid rendering
    ├── Toolbar.tsx      # Tool palette (select, pencil, rect, ellipse, line, arrow, text, dimension)
    │                    #   + undo/redo buttons
    ├── ZoomControls.tsx # Zoom in / out / reset buttons
    └── GridControls.tsx # Grid & snap toggle buttons
```

### Key patterns

- **State ownership:** `App.tsx` owns all element state, selection, history stacks (`past`/`future`), camera, and editing state. `Canvas.tsx` receives props and calls callbacks upward.
- **Element model:** A discriminated union (`Element`) keyed on `type`. Each element has a string `id` from `genId()`. Arrows carry optional `startBinding`/`endBinding` referencing other element ids.
- **History:** Snapshot-based undo/redo — full `Element[]` arrays pushed onto `past`/`future` stacks.
- **Rendering:** Imperative Canvas 2D drawing inside a `useEffect` / draw function in `Canvas.tsx`, not React DOM.
- **Coordinate spaces:** World coordinates for elements; screen coordinates via `Camera` transforms (`screenToWorld` / `worldToScreen` in `camera.ts`).
- **Tools are one-shot:** After committing an element the active tool resets to `select` and the new element is auto-selected.
- **Text editing:** A floating `<textarea>` overlay positioned in screen space; commits on Enter/blur, cancels on Escape.

## Development Conventions

- **Strict TypeScript** — no `any`, no unused locals/parameters. The build (`tsc`) enforces this.
- **No external state management** — plain `useState` / `useRef` hooks only.
- **No component library** — hand-rolled UI with plain CSS classes.
- **Functional style** — pure helper functions in dedicated modules (`camera.ts`, `dimensions.ts`, `labelFont.ts`); React components are thin wrappers.
- **Testing** — Playwright e2e specs in `tests/`. Tests target `data-testid` attributes and `data-color` attributes for palette swatches. Test files are named `<feature>.spec.ts`.
- **Constants** — module-level `const` for magic numbers (colors, sizes, gaps) at the top of the file that uses them.
