# Tech Draw

A browser-based technical drawing and diagramming tool built on the HTML5 Canvas. Create boxes, ellipses, arrows, lines, freehand sketches, text labels, and engineering-style dimension annotations on an infinite canvas with pan, zoom, and grid snapping.

**Live demo:** [techdraw.pages.dev](https://techdraw.pages.dev)

## Features

- **Infinite canvas** — pan and zoom with a configurable grid and snap-to-grid
- **Drawing tools** — rectangle, ellipse, arrow, line, pencil (freehand), text, and dimension lines
- **Shape labels** — inline text labels with configurable font scale (S / M / L)
- **Color palette** — per-element stroke colors
- **Arrow binding** — arrows attach to shapes and follow them when moved; adjustable bend
- **Box extend** — chain connected boxes with a single click
- **Undo / redo** — full snapshot-based history
- **Auto-save** — drawings persist in `localStorage` across page refreshes

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 (function components + hooks) |
| Language | TypeScript (strict mode) |
| Bundler | Vite |
| Rendering | Canvas 2D API |
| Styling | Plain CSS |
| Testing | Playwright (e2e, Chromium) |

## Getting started

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # type-check + production build
npm run preview    # serve the production build
npm test           # Playwright e2e tests (auto-starts dev server)
```

## AI-driven development

This project is developed with AI-generated code. A GitHub Actions workflow (`.github/workflows/ai-engineer.yml`) automatically resolves issues:

1. Label a GitHub issue with **`AI`**.
2. The workflow spins up [Qwen Code](https://github.com/anthropics/qwen-code) CLI, builds a knowledge graph of the codebase, and lets the AI agent solve the issue end-to-end.
3. Changes are committed to an `ai/issue-<N>` branch and a pull request is opened automatically.

All significant decisions made during development — by humans or AI — are recorded as Architecture Decision Records in [`docs/adr/`](docs/adr/README.md).

## Project structure

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Root component: state, history, shortcuts, UI
├── types.ts              # Element union type, Tool type, bindings
├── index.css             # Application styles
├── components/
│   ├── Canvas.tsx         # Canvas element: pointer handling, drawing, hit-testing
│   ├── Toolbar.tsx        # Tool palette + undo/redo
│   ├── ZoomControls.tsx   # Zoom in / out / reset
│   └── GridControls.tsx   # Grid & snap toggles
└── lib/
    ├── camera.ts          # Pan/zoom model, screen↔world transforms, snapping
    ├── dimensions.ts      # Dimension-line geometry, rendering, hit-testing
    ├── labelFont.ts       # Label font-size fitting (S/M/L)
    ├── export.ts          # PNG and SVG export
    ├── storage.ts         # localStorage persistence
    └── projectFile.ts     # .tdraw project file save/open
```
