import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import ZoomControls from './components/ZoomControls';
import GridControls from './components/GridControls';
import type {
  ArrowBinding,
  ArrowElement,
  Element,
  EllipseElement,
  FontScale,
  RectElement,
  TextElement,
  Tool,
} from './types';
import { genId } from './types';
import type { Camera } from './camera';
import { DEFAULT_CAMERA, clampZoom } from './camera';
import { fitLabelFontSize, FONT_SCALES, LABEL_FONT_FAMILY } from './labelFont';

const TEXT_FONT = '20px sans-serif';
const TEXT_FONT_SIZE = 20;
const INK_COLOR = '#1e1e1e';
const SHAPE_COLORS = ['#dc2626', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777'];
const EXTEND_GAP = 100;
const CHIP_SIZE = 26;
// "A" glyph sizes used on the S/M/L palette buttons.
const FONT_SCALE_BUTTON_SIZES: Record<FontScale, number> = { small: 10, medium: 13, large: 16 };

function translateElement(el: Element, dx: number, dy: number): Element {
  switch (el.type) {
    case 'pencil':
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'rect':
    case 'ellipse':
    case 'text':
      return { ...el, x: el.x + dx, y: el.y + dy };
    case 'line':
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case 'dimension':
      return {
        ...el,
        start: { ...el.start, x: el.start.x + dx, y: el.start.y + dy },
        end: { ...el.end, x: el.end.x + dx, y: el.end.y + dy },
      };
  }
}

const measureCtx = document.createElement('canvas').getContext('2d');

function measureText(text: string): { width: number; height: number } {
  if (!measureCtx) {
    return { width: text.length * 10, height: 20 };
  }
  measureCtx.font = TEXT_FONT;
  const metrics = measureCtx.measureText(text);
  const height = (metrics.actualBoundingBoxAscent || 16) + (metrics.actualBoundingBoxDescent || 4);
  return { width: metrics.width, height };
}

export default function App() {
  const [elements, setElements] = useState<Element[]>([]);
  const [draft, setDraft] = useState<Element | null>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<Element[][]>([]);
  const [future, setFuture] = useState<Element[][]>([]);
  const [editing, setEditing] = useState<{
    x: number;
    y: number;
    shapeId?: string;
    isShapeLabel?: boolean;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize] = useState(20);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [extendHover, setExtendHover] = useState(false);

  const dragBaseRef = useRef<Element[] | null>(null);
  const dragSelectedRef = useRef<Set<string>>(new Set());
  const textCancelledRef = useRef(false);
  const textReadyRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pushHistory = (snapshot: Element[]) => {
    setPast((p) => [...p, snapshot]);
    setFuture([]);
  };

  const commitElement = (el: Element) => {
    pushHistory(elements);
    setElements([...elements, el]);
    setDraft(null);
    setExtendHover(false);
    // Tools are one-shot: drop back to select mode with the new element selected.
    setTool('select');
    setSelectedIds(new Set([el.id]));
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([...future, elements]);
    setElements(previous);
    setSelectedIds(new Set());
    setDraft(null);
    setExtendHover(false);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setPast([...past, elements]);
    setElements(next);
    setSelectedIds(new Set());
    setDraft(null);
    setExtendHover(false);
  };

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements
        .filter((e) => !selectedIds.has(e.id))
        .map((e) => {
          if (e.type !== 'arrow') return e;
          const cleared = { ...e };
          let changed = false;
          if (cleared.startBinding && selectedIds.has(cleared.startBinding.elementId)) {
            delete cleared.startBinding;
            changed = true;
          }
          if (cleared.endBinding && selectedIds.has(cleared.endBinding.elementId)) {
            delete cleared.endBinding;
            changed = true;
          }
          return changed ? cleared : e;
        }),
    );
    setSelectedIds(new Set());
    setExtendHover(false);
  };

  const handleDragStart = (ids: string[]) => {
    dragBaseRef.current = elements;
    dragSelectedRef.current = new Set(ids);
  };

  const handleDragMove = (dx: number, dy: number) => {
    const base = dragBaseRef.current;
    const ids = dragSelectedRef.current;
    if (!base || ids.size === 0) return;
    setElements(
      base.map((e) => {
        if (ids.has(e.id)) {
          const moved = translateElement(e, dx, dy);
          if (moved.type === 'arrow') {
            const detached = { ...moved };
            delete detached.startBinding;
            delete detached.endBinding;
            return detached;
          }
          return moved;
        }
        if (e.type === 'arrow') {
          let a = e;
          if (a.startBinding && ids.has(a.startBinding.elementId)) {
            a = { ...a, x1: a.x1 + dx, y1: a.y1 + dy };
          }
          if (a.endBinding && ids.has(a.endBinding.elementId)) {
            a = { ...a, x2: a.x2 + dx, y2: a.y2 + dy };
          }
          return a;
        }
        return e;
      }),
    );
  };

  const handleEndpointDragMove = (
    id: string,
    end: 'start' | 'end',
    point: { x: number; y: number },
    binding: ArrowBinding | null,
  ) => {
    const base = dragBaseRef.current;
    if (!base) return;
    setElements(
      base.map((e) => {
        if (e.id !== id || e.type !== 'arrow') return e;
        const updated = { ...e };
        if (end === 'start') {
          updated.x1 = point.x;
          updated.y1 = point.y;
          if (binding) updated.startBinding = binding;
          else delete updated.startBinding;
        } else {
          updated.x2 = point.x;
          updated.y2 = point.y;
          if (binding) updated.endBinding = binding;
          else delete updated.endBinding;
        }
        return updated;
      }),
    );
  };

  const handleBendDragMove = (id: string, bend: number) => {
    const base = dragBaseRef.current;
    if (!base) return;
    setElements(
      base.map((e) => (e.id === id && e.type === 'arrow' ? { ...e, bend } : e)),
    );
  };

  const handleBendReset = (id: string) => {
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (e.id !== id || e.type !== 'arrow') return e;
        const cleared = { ...e };
        delete cleared.bend;
        return cleared;
      }),
    );
  };

  const handleDragEnd = (moved: boolean) => {
    if (moved && dragBaseRef.current) {
      pushHistory(dragBaseRef.current);
    }
    dragBaseRef.current = null;
    dragSelectedRef.current = new Set();
  };

  const handleTextPlace = (x: number, y: number) => {
    textCancelledRef.current = false;
    textReadyRef.current = false;
    setEditValue('');
    setEditing({ x, y });
  };

  const handleEditLabel = (shapeId: string, x: number, y: number) => {
    textCancelledRef.current = false;
    textReadyRef.current = false;
    const shape = elements.find((e) => e.id === shapeId);
    setEditValue(shape && 'text' in shape && shape.text ? shape.text : '');
    setEditing({ x, y, shapeId, isShapeLabel: true });
  };

  // Delay focus so the browser's click-sequence focus management
  // (pointerup / click stealing focus back to the canvas) settles first.
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.select();
      textReadyRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [editing]);

  const commitText = () => {
    if (!editing) return;
    const text = editValue.replace(/\n/g, ' ').trim();
    if (editing.shapeId) {
      if (text.length > 0) {
        pushHistory(elements);
        setElements(
          elements.map((e) => {
            if (e.id !== editing.shapeId) return e;
            if (e.type === 'rect' || e.type === 'ellipse') return { ...e, text };
            if (e.type === 'text') {
              const { width, height } = measureText(text);
              return { ...e, text, width, height };
            }
            return e;
          }),
        );
      } else {
        pushHistory(elements);
        setElements(
          elements
            .map((e) => {
              if (e.id !== editing.shapeId) return e;
              if (e.type === 'rect' || e.type === 'ellipse') {
                const cleared = { ...e };
                delete cleared.text;
                return cleared;
              }
              return e;
            })
            .filter((e) => e.type !== 'text' || e.id !== editing.shapeId),
        );
      }
    } else if (text.length > 0) {
      const { width, height } = measureText(text);
      const el: TextElement = {
        id: genId(),
        type: 'text',
        x: editing.x,
        y: editing.y,
        text,
        width,
        height,
      };
      commitElement(el);
    }
    setTool('select');
    setEditing(null);
  };

  const cancelText = () => {
    textCancelledRef.current = true;
    setTool('select');
    setEditing(null);
  };

  const handleCameraChange = useCallback((cam: Camera) => {
    setCamera(cam);
  }, []);

  const zoomIn = () => {
    setCamera((cam) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newZoom = clampZoom(cam.zoom * 1.25);
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom };
    });
  };

  const zoomOut = () => {
    setCamera((cam) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newZoom = clampZoom(cam.zoom / 1.25);
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom };
    });
  };

  const resetZoom = () => {
    setCamera((cam) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { x: cx - wx, y: cy - wy, zoom: 1 };
    });
  };

  // The extend suggestion targets a lone selected box.
  const selectedElement =
    selectedIds.size === 1 ? elements.find((e) => e.id === [...selectedIds][0]) : undefined;
  const extendRect =
    selectedElement && selectedElement.type === 'rect' && !draft && !editing
      ? selectedElement
      : undefined;

  const extendBox = () => {
    const source = extendRect;
    if (!source) return;
    pushHistory(elements);
    const midY = source.y + source.height / 2;
    const next: RectElement = {
      id: genId(),
      type: 'rect',
      x: source.x + source.width + EXTEND_GAP,
      y: source.y,
      width: source.width,
      height: source.height,
      ...(source.color ? { color: source.color } : {}),
    };
    const connector: ArrowElement = {
      id: genId(),
      type: 'arrow',
      x1: source.x + source.width,
      y1: midY,
      x2: next.x,
      y2: midY,
      startBinding: { elementId: source.id },
      endBinding: { elementId: next.id },
    };
    setElements([...elements, next, connector]);
    // Selecting the new box moves the suggestion onto it, so chaining continues.
    setSelectedIds(new Set([next.id]));
    setExtendHover(false);
  };

  const applyColor = (color: string | null) => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || (e.type !== 'rect' && e.type !== 'ellipse')) return e;
        if (color) return { ...e, color };
        const cleared = { ...e };
        delete cleared.color;
        return cleared;
      }),
    );
  };

  const applyFontScale = (scale: FontScale) => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || (e.type !== 'rect' && e.type !== 'ellipse')) return e;
        return { ...e, fontScale: scale };
      }),
    );
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;

      if (ev.code === 'Space') {
        ev.preventDefault();
        setSpaceHeld(true);
        return;
      }

      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
      } else if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      } else if (mod && ev.key.toLowerCase() === 'a') {
        ev.preventDefault();
        setSelectedIds(new Set(elements.map((e) => e.id)));
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        deleteSelection();
      } else if (ev.key === 'Escape') {
        setSelectedIds(new Set());
      } else if (ev.key === '=' || ev.key === '+') {
        zoomIn();
      } else if (ev.key === '-') {
        zoomOut();
      } else if (ev.key === '0') {
        resetZoom();
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Convert editing position (world) to screen for the textarea overlay
  const editingScreen = editing
    ? { x: editing.x * camera.zoom + camera.x, y: editing.y * camera.zoom + camera.y }
    : null;

  // The label editor mirrors the exact size the canvas will render, so what
  // you see while typing is what you get after committing.
  const editingShape =
    editing && editing.shapeId ? elements.find((e) => e.id === editing.shapeId) : undefined;
  let textareaStyle: CSSProperties = { left: editingScreen?.x, top: editingScreen?.y };
  if (editingShape && (editingShape.type === 'rect' || editingShape.type === 'ellipse')) {
    const size = fitLabelFontSize(
      editValue || 'Text',
      editingShape.width,
      editingShape.height,
      editingShape.fontScale,
      editingShape.type === 'ellipse',
    );
    textareaStyle = {
      ...textareaStyle,
      fontSize: size * camera.zoom,
      width: editingShape.width * camera.zoom,
      minWidth: 0,
      fontFamily: LABEL_FONT_FAMILY,
    };
  } else {
    textareaStyle = { ...textareaStyle, fontSize: TEXT_FONT_SIZE * camera.zoom };
  }

  // Floating color palette above the selected shape(s)
  const colorableSelected = elements.filter(
    (e): e is RectElement | EllipseElement =>
      selectedIds.has(e.id) && (e.type === 'rect' || e.type === 'ellipse'),
  );
  const paletteVisible =
    !editing && selectedIds.size > 0 && colorableSelected.length === selectedIds.size;
  let paletteBox: { x: number; y: number; w: number; h: number } | null = null;
  if (paletteVisible) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of colorableSelected) {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.width);
      maxY = Math.max(maxY, e.y + e.height);
    }
    paletteBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const selectedColors = new Set(colorableSelected.map((e) => e.color ?? null));
  const currentColor = selectedColors.size === 1 ? [...selectedColors][0] : undefined;
  const selectedScales = new Set(colorableSelected.map((e) => e.fontScale ?? 'medium'));
  const currentScale = selectedScales.size === 1 ? [...selectedScales][0] : undefined;
  let paletteScreen: { left: number; top: number; below: boolean } | null = null;
  if (paletteBox) {
    const topEdge = paletteBox.y * camera.zoom + camera.y;
    const below = topEdge < 64;
    paletteScreen = {
      left: (paletteBox.x + paletteBox.w / 2) * camera.zoom + camera.x,
      top: below ? (paletteBox.y + paletteBox.h) * camera.zoom + camera.y + 12 : topEdge - 12,
      below,
    };
  }

  // Screen positions for the "extend to next box" suggestion
  const chipVisible = !!extendRect;
  const chipScreen =
    chipVisible && extendRect
      ? {
          left: (extendRect.x + extendRect.width) * camera.zoom + camera.x + 20 - CHIP_SIZE / 2,
          top: (extendRect.y + extendRect.height / 2) * camera.zoom + camera.y - CHIP_SIZE / 2,
        }
      : null;
  const extendPreview =
    chipVisible && extendHover && extendRect
      ? {
          x: extendRect.x + extendRect.width + EXTEND_GAP,
          y: extendRect.y,
          width: extendRect.width,
          height: extendRect.height,
          fromX: extendRect.x + extendRect.width,
          fromY: extendRect.y + extendRect.height / 2,
          toX: extendRect.x + extendRect.width + EXTEND_GAP,
          toY: extendRect.y + extendRect.height / 2,
        }
      : null;

  return (
    <>
      <Canvas
        elements={elements}
        draft={draft}
        tool={tool}
        selectedIds={selectedIds}
        camera={camera}
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        gridSize={gridSize}
        spaceHeld={spaceHeld}
        extendPreview={extendPreview}
        onDraftChange={setDraft}
        onCommit={commitElement}
        onSelect={setSelectedIds}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onEndpointDragMove={handleEndpointDragMove}
        onBendDragMove={handleBendDragMove}
        onBendReset={handleBendReset}
        onTextPlace={handleTextPlace}
        onEditLabel={handleEditLabel}
        onCameraChange={handleCameraChange}
      />
      <Toolbar
        tool={tool}
        onToolChange={(t) => {
          setTool(t);
          setSelectedIds(new Set());
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        elementCount={elements.length}
      />
      <ZoomControls
        zoom={camera.zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
      />
      <GridControls
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        onToggleGrid={() => setGridEnabled((v) => !v)}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
      />
      {paletteVisible && paletteScreen && (
        <div
          className={`color-palette${paletteScreen.below ? ' below' : ''}`}
          data-testid="color-palette"
          style={{ left: paletteScreen.left, top: paletteScreen.top }}
        >
          <button
            type="button"
            className={`color-swatch${currentColor === null ? ' active' : ''}`}
            data-color="ink"
            style={{ background: INK_COLOR }}
            title="Ink (default)"
            onClick={() => applyColor(null)}
          />
          {SHAPE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch${currentColor === c ? ' active' : ''}`}
              data-color={c}
              style={{ background: c }}
              title={c}
              onClick={() => applyColor(c)}
            />
          ))}
          <div className="palette-divider" />
          {FONT_SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`font-scale${currentScale === s.id ? ' active' : ''}`}
              data-testid={`font-scale-${s.id}`}
              title={s.title}
              aria-label={s.title}
              onClick={() => applyFontScale(s.id)}
            >
              <span style={{ fontSize: FONT_SCALE_BUTTON_SIZES[s.id] }}>A</span>
            </button>
          ))}
        </div>
      )}
      {chipScreen && (
        <button
          type="button"
          className="extend-chip"
          data-testid="extend-chip"
          style={{ left: chipScreen.left, top: chipScreen.top }}
          title="Extend: add a connected box"
          onMouseEnter={() => setExtendHover(true)}
          onMouseLeave={() => setExtendHover(false)}
          onClick={extendBox}
        >
          +
        </button>
      )}
      {editingScreen && editing && (
        <textarea
          ref={textareaRef}
          className={`text-input${editing.isShapeLabel ? ' text-input-centered' : ''}`}
          style={textareaStyle}
          rows={1}
          value={editValue}
          onChange={(e) => setEditValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelText();
            }
          }}
          onBlur={() => {
            if (!textReadyRef.current) {
              // Focus was stolen by the click sequence before we could
              // establish it — reclaim instead of committing empty text.
              setTimeout(() => textareaRef.current?.focus(), 0);
              return;
            }
            if (textCancelledRef.current) {
              textCancelledRef.current = false;
              return;
            }
            commitText();
          }}
        />
      )}
    </>
  );
}
