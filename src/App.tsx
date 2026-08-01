import { useEffect, useRef, useState } from 'react';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import type { ArrowBinding, Element, TextElement, Tool } from './types';
import { genId } from './types';

const TEXT_FONT = '20px sans-serif';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [past, setPast] = useState<Element[][]>([]);
  const [future, setFuture] = useState<Element[][]>([]);
  const [editing, setEditing] = useState<{ x: number; y: number } | null>(null);
  const dragBaseRef = useRef<Element[] | null>(null);
  const textCancelledRef = useRef(false);

  const pushHistory = (snapshot: Element[]) => {
    setPast((p) => [...p, snapshot]);
    setFuture([]);
  };

  const commitElement = (el: Element) => {
    pushHistory(elements);
    setElements([...elements, el]);
    setDraft(null);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([...future, elements]);
    setElements(previous);
    setSelectedId(null);
    setDraft(null);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setPast([...past, elements]);
    setElements(next);
    setSelectedId(null);
    setDraft(null);
  };

  const deleteSelection = () => {
    if (!selectedId) return;
    pushHistory(elements);
    setElements(
      elements
        .filter((e) => e.id !== selectedId)
        .map((e) => {
          if (e.type !== 'arrow') return e;
          const cleared = { ...e };
          if (cleared.startBinding?.elementId === selectedId) delete cleared.startBinding;
          if (cleared.endBinding?.elementId === selectedId) delete cleared.endBinding;
          return cleared;
        }),
    );
    setSelectedId(null);
  };

  const handleDragStart = (id: string) => {
    setSelectedId(id);
    dragBaseRef.current = elements;
  };

  const handleDragMove = (dx: number, dy: number) => {
    const base = dragBaseRef.current;
    if (!base || !selectedId) return;
    setElements(
      base.map((e) => {
        if (e.id === selectedId) {
          const moved = translateElement(e, dx, dy);
          if (moved.type === 'arrow') {
            // Dragging a whole arrow detaches it from any bound shapes.
            const detached = { ...moved };
            delete detached.startBinding;
            delete detached.endBinding;
            return detached;
          }
          return moved;
        }
        // Arrow endpoints bound to the dragged shape follow it.
        if (e.type === 'arrow') {
          let a = e;
          if (a.startBinding?.elementId === selectedId) {
            a = { ...a, x1: a.x1 + dx, y1: a.y1 + dy };
          }
          if (a.endBinding?.elementId === selectedId) {
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

  const handleDragEnd = (moved: boolean) => {
    if (moved && dragBaseRef.current) {
      pushHistory(dragBaseRef.current);
    }
    dragBaseRef.current = null;
  };

  const handleTextPlace = (x: number, y: number) => {
    textCancelledRef.current = false;
    setEditing({ x, y });
  };

  const commitText = (x: number, y: number, value: string) => {
    const text = value.replace(/\n/g, ' ').trim();
    if (text.length > 0) {
      const { width, height } = measureText(text);
      const el: TextElement = { id: genId(), type: 'text', x, y, text, width, height };
      commitElement(el);
    }
    setEditing((cur) => (cur && cur.x === x && cur.y === y ? null : cur));
  };

  const cancelText = (x: number, y: number) => {
    textCancelledRef.current = true;
    setEditing((cur) => (cur && cur.x === x && cur.y === y ? null : cur));
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        deleteSelection();
      } else if (ev.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <>
      <Canvas
        elements={elements}
        draft={draft}
        tool={tool}
        selectedId={selectedId}
        onDraftChange={setDraft}
        onCommit={commitElement}
        onSelect={setSelectedId}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onEndpointDragMove={handleEndpointDragMove}
        onTextPlace={handleTextPlace}
      />
      <Toolbar
        tool={tool}
        onToolChange={(t) => {
          setTool(t);
          setSelectedId(null);
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        elementCount={elements.length}
      />
      {editing && (
        <textarea
          className="text-input"
          style={{ left: editing.x, top: editing.y }}
          rows={1}
          autoFocus
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText(editing.x, editing.y, e.currentTarget.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelText(editing.x, editing.y);
            }
          }}
          onBlur={(e) => {
            if (textCancelledRef.current) {
              textCancelledRef.current = false;
              return;
            }
            commitText(editing.x, editing.y, e.currentTarget.value);
          }}
        />
      )}
    </>
  );
}
