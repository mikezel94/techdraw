import { useEffect, useRef, useState } from 'react';
import type { ArrowBinding, ArrowElement, Element, Point, Tool } from '../types';
import { genId } from '../types';

const STROKE = '#1e1e1e';
const SELECT_COLOR = '#4a90d9';
const HIT_TOLERANCE = 6;
const MIN_SIZE = 3;
const SNAP_THRESHOLD = 14;
const HANDLE_SIZE = 8;
const HANDLE_HIT = 8;
const CURVE_SAMPLES = 24;

interface CanvasProps {
  elements: Element[];
  draft: Element | null;
  tool: Tool;
  selectedId: string | null;
  onDraftChange: (draft: Element | null) => void;
  onCommit: (el: Element) => void;
  onSelect: (id: string | null) => void;
  onDragStart: (id: string) => void;
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: (moved: boolean) => void;
  onEndpointDragMove: (id: string, end: 'start' | 'end', point: Point, binding: ArrowBinding | null) => void;
  onTextPlace: (x: number, y: number) => void;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function snapToShape(el: Element, px: number, py: number): Point | null {
  if (el.type === 'rect') {
    const cx = clamp(px, el.x, el.x + el.width);
    const cy = clamp(py, el.y, el.y + el.height);
    if (cx !== px || cy !== py) {
      // Outside the box: the clamped point lies on the border.
      return { x: cx, y: cy };
    }
    // Inside the box: push to the nearest edge.
    const dl = px - el.x;
    const dr = el.x + el.width - px;
    const dt = py - el.y;
    const db = el.y + el.height - py;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: el.x, y: py };
    if (m === dr) return { x: el.x + el.width, y: py };
    if (m === dt) return { x: px, y: el.y };
    return { x: px, y: el.y + el.height };
  }
  if (el.type === 'ellipse') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = el.width / 2;
    const ry = el.height / 2;
    if (rx === 0 || ry === 0) return { x: cx, y: cy };
    const theta = Math.atan2((py - cy) / ry, (px - cx) / rx);
    return { x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) };
  }
  return null;
}

function findSnapTarget(
  elements: Element[],
  excludeId: string,
  x: number,
  y: number,
): { el: Element; point: Point } | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === excludeId || (el.type !== 'rect' && el.type !== 'ellipse')) continue;
    if (
      x >= el.x - SNAP_THRESHOLD &&
      x <= el.x + el.width + SNAP_THRESHOLD &&
      y >= el.y - SNAP_THRESHOLD &&
      y <= el.y + el.height + SNAP_THRESHOLD
    ) {
      const point = snapToShape(el, x, y);
      if (point) return { el, point };
    }
  }
  return null;
}

// Outward normal of the shape an arrow endpoint is bound to, or null when the
// endpoint is free (unbound, or the bound shape no longer exists).
function boundNormal(elements: Element[], el: ArrowElement, end: 'start' | 'end'): Point | null {
  const binding = end === 'start' ? el.startBinding : el.endBinding;
  if (!binding) return null;
  const target = elements.find((t) => t.id === binding.elementId);
  if (!target) return null;
  const px = end === 'start' ? el.x1 : el.x2;
  const py = end === 'start' ? el.y1 : el.y2;
  if (target.type === 'rect') {
    const dl = Math.abs(px - target.x);
    const dr = Math.abs(px - (target.x + target.width));
    const dt = Math.abs(py - target.y);
    const db = Math.abs(py - (target.y + target.height));
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: -1, y: 0 };
    if (m === dr) return { x: 1, y: 0 };
    if (m === dt) return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }
  if (target.type === 'ellipse') {
    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    const len = Math.hypot(px - cx, py - cy);
    if (len === 0) return null;
    return { x: (px - cx) / len, y: (py - cy) / len };
  }
  return null;
}

interface ArrowControls {
  c1: Point;
  c2: Point;
}

// Cubic control points that make a bound arrow leave/arrive perpendicular to
// its shapes, so the curve flexes as the shapes move. Returns null for a fully
// unbound arrow, which is rendered straight.
function arrowControls(elements: Element[], el: ArrowElement): ArrowControls | null {
  const n0 = boundNormal(elements, el, 'start');
  const n1 = boundNormal(elements, el, 'end');
  if (!n0 && !n1) return null;
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(len * 0.35, 60);
  const d0 = n0 ?? { x: dx / len, y: dy / len };
  const d1 = n1 ?? { x: -dx / len, y: -dy / len };
  return {
    c1: { x: el.x1 + d0.x * bend, y: el.y1 + d0.y * bend },
    c2: { x: el.x2 + d1.x * bend, y: el.y2 + d1.y * bend },
  };
}

function cubicPoint(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

function hitElement(el: Element, x: number, y: number, elements: Element[]): boolean {
  switch (el.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      return (
        x >= el.x - HIT_TOLERANCE &&
        x <= el.x + el.width + HIT_TOLERANCE &&
        y >= el.y - HIT_TOLERANCE &&
        y <= el.y + el.height + HIT_TOLERANCE
      );
    case 'line':
      return distToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= HIT_TOLERANCE;
    case 'arrow': {
      const controls = arrowControls(elements, el);
      if (!controls) {
        return distToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= HIT_TOLERANCE;
      }
      const p0 = { x: el.x1, y: el.y1 };
      const p1 = { x: el.x2, y: el.y2 };
      let prev = p0;
      for (let i = 1; i <= CURVE_SAMPLES; i++) {
        const q = cubicPoint(p0, controls.c1, controls.c2, p1, i / CURVE_SAMPLES);
        if (distToSegment(x, y, prev.x, prev.y, q.x, q.y) <= HIT_TOLERANCE) {
          return true;
        }
        prev = q;
      }
      return false;
    }
    case 'pencil': {
      if (el.points.length === 1) {
        return Math.hypot(x - el.points[0].x, y - el.points[0].y) <= HIT_TOLERANCE;
      }
      for (let i = 1; i < el.points.length; i++) {
        const a = el.points[i - 1];
        const b = el.points[i];
        if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE) {
          return true;
        }
      }
      return false;
    }
  }
}

function hitTest(elements: Element[], x: number, y: number): Element | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitElement(elements[i], x, y, elements)) {
      return elements[i];
    }
  }
  return null;
}

function bboxOf(el: Element, elements: Element[]): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case 'line':
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        w: Math.abs(el.x2 - el.x1),
        h: Math.abs(el.y2 - el.y1),
      };
    case 'arrow': {
      const controls = arrowControls(elements, el);
      if (!controls) {
        return {
          x: Math.min(el.x1, el.x2),
          y: Math.min(el.y1, el.y2),
          w: Math.abs(el.x2 - el.x1),
          h: Math.abs(el.y2 - el.y1),
        };
      }
      const p0 = { x: el.x1, y: el.y1 };
      const p1 = { x: el.x2, y: el.y2 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const q = cubicPoint(p0, controls.c1, controls.c2, p1, i / CURVE_SAMPLES);
        minX = Math.min(minX, q.x);
        minY = Math.min(minY, q.y);
        maxX = Math.max(maxX, q.x);
        maxY = Math.max(maxY, q.y);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'pencil': {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      if (!Number.isFinite(minX)) {
        return { x: 0, y: 0, w: 0, h: 0 };
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
}

function drawElement(ctx: CanvasRenderingContext2D, el: Element, elements: Element[]): void {
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = STROKE;
  switch (el.type) {
    case 'pencil': {
      const pts = el.points;
      if (pts.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) {
        ctx.lineTo(pts[0].x + 0.01, pts[0].y + 0.01);
      }
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'rect':
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(
        el.x + el.width / 2,
        el.y + el.height / 2,
        el.width / 2,
        el.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      break;
    case 'arrow': {
      const controls = arrowControls(elements, el);
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      if (controls) {
        ctx.bezierCurveTo(
          controls.c1.x,
          controls.c1.y,
          controls.c2.x,
          controls.c2.y,
          el.x2,
          el.y2,
        );
      } else {
        ctx.lineTo(el.x2, el.y2);
      }
      ctx.stroke();
      const angle = controls
        ? Math.atan2(el.y2 - controls.c2.y, el.x2 - controls.c2.x)
        : Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
      const headLength = 14;
      const spread = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(
        el.x2 - headLength * Math.cos(angle - spread),
        el.y2 - headLength * Math.sin(angle - spread),
      );
      ctx.lineTo(
        el.x2 - headLength * Math.cos(angle + spread),
        el.y2 - headLength * Math.sin(angle + spread),
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'text':
      ctx.font = '20px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(el.text, el.x, el.y);
      break;
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, el: Element): void {
  const b = bboxOf(el);
  ctx.save();
  ctx.strokeStyle = SELECT_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  ctx.restore();
}

function drawArrowHandles(ctx: CanvasRenderingContext2D, el: ArrowElement): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = SELECT_COLOR;
  ctx.lineWidth = 1.5;
  for (const [x, y] of [
    [el.x1, el.y1],
    [el.x2, el.y2],
  ]) {
    ctx.beginPath();
    ctx.rect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnapHint(ctx: CanvasRenderingContext2D, target: Element, point: Point): void {
  ctx.save();
  ctx.strokeStyle = SELECT_COLOR;
  ctx.fillStyle = SELECT_COLOR;
  ctx.lineWidth = 2;
  if (target.type === 'rect') {
    ctx.strokeRect(target.x, target.y, target.width, target.height);
  } else if (target.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      target.x + target.width / 2,
      target.y + target.height / 2,
      target.width / 2,
      target.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makeShape(tool: Tool, id: string, s: Point, c: Point): Element {
  const x = Math.min(s.x, c.x);
  const y = Math.min(s.y, c.y);
  const w = Math.abs(c.x - s.x);
  const h = Math.abs(c.y - s.y);
  switch (tool) {
    case 'rectangle':
      return { id, type: 'rect', x, y, width: w, height: h };
    case 'ellipse':
      return { id, type: 'ellipse', x, y, width: w, height: h };
    case 'line':
      return { id, type: 'line', x1: s.x, y1: s.y, x2: c.x, y2: c.y };
    case 'arrow':
      return { id, type: 'arrow', x1: s.x, y1: s.y, x2: c.x, y2: c.y };
    default:
      throw new Error(`not a shape tool: ${tool}`);
  }
}

function updateShape(draft: Element, s: Point, c: Point): Element {
  const x = Math.min(s.x, c.x);
  const y = Math.min(s.y, c.y);
  const w = Math.abs(c.x - s.x);
  const h = Math.abs(c.y - s.y);
  switch (draft.type) {
    case 'rect':
      return { ...draft, x, y, width: w, height: h };
    case 'ellipse':
      return { ...draft, x, y, width: w, height: h };
    case 'line':
    case 'arrow':
      return { ...draft, x2: c.x, y2: c.y };
    default:
      return draft;
  }
}

function isMeaningful(el: Element): boolean {
  switch (el.type) {
    case 'pencil':
      return el.points.length >= 2;
    case 'rect':
    case 'ellipse':
      return el.width > MIN_SIZE && el.height > MIN_SIZE;
    case 'line':
    case 'arrow':
      return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) > MIN_SIZE;
    case 'text':
      return true;
  }
}

export default function Canvas({
  elements,
  draft,
  tool,
  selectedId,
  onDraftChange,
  onCommit,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onEndpointDragMove,
  onTextPlace,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<Element | null>(null);
  const startRef = useRef<Point>({ x: 0, y: 0 });
  const moveRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const endpointRef = useRef<{ id: string; end: 'start' | 'end'; moved: boolean } | null>(null);
  const [snapHint, setSnapHint] = useState<{ targetId: string; point: Point } | null>(null);
  const [handleHover, setHandleHover] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const el of elements) {
        drawElement(ctx, el);
      }
      if (draft) {
        drawElement(ctx, draft);
      }
      if (snapHint) {
        const target = elements.find((e) => e.id === snapHint.targetId);
        if (target) {
          drawSnapHint(ctx, target, snapHint.point);
        }
      }
      if (selectedId) {
        const sel = elements.find((e) => e.id === selectedId);
        if (sel) {
          drawSelection(ctx, sel);
          if (sel.type === 'arrow') {
            drawArrowHandles(ctx, sel);
          }
        }
      }
    };
    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [elements, draft, selectedId, snapHint]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = getPos(e);
    if (tool === 'select') {
      const sel = selectedId ? elements.find((el) => el.id === selectedId) : null;
      if (sel && sel.type === 'arrow') {
        const nearStart = Math.hypot(p.x - sel.x1, p.y - sel.y1) <= HANDLE_HIT;
        const nearEnd = Math.hypot(p.x - sel.x2, p.y - sel.y2) <= HANDLE_HIT;
        if (nearStart || nearEnd) {
          onSelect(sel.id);
          onDragStart(sel.id);
          endpointRef.current = { id: sel.id, end: nearStart ? 'start' : 'end', moved: false };
          return;
        }
      }
      const hit = hitTest(elements, p.x, p.y);
      if (hit) {
        onSelect(hit.id);
        onDragStart(hit.id);
        moveRef.current = { startX: p.x, startY: p.y, moved: false };
      } else {
        onSelect(null);
      }
      return;
    }
    if (tool === 'text') {
      onTextPlace(p.x, p.y);
      return;
    }
    startRef.current = p;
    if (tool === 'pencil') {
      draftRef.current = { id: genId(), type: 'pencil', points: [p] };
    } else {
      draftRef.current = makeShape(tool, genId(), p, p);
      if (draftRef.current.type === 'arrow') {
        const snap = findSnapTarget(elements, draftRef.current.id, p.x, p.y);
        if (snap) {
          draftRef.current = {
            ...draftRef.current,
            x1: snap.point.x,
            y1: snap.point.y,
            x2: snap.point.x,
            y2: snap.point.y,
            startBinding: { elementId: snap.el.id },
          };
          startRef.current = snap.point;
          setSnapHint({ targetId: snap.el.id, point: snap.point });
        }
      }
    }
    onDraftChange(draftRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = getPos(e);
    if (moveRef.current) {
      const dx = p.x - moveRef.current.startX;
      const dy = p.y - moveRef.current.startY;
      if (dx !== 0 || dy !== 0) {
        moveRef.current.moved = true;
      }
      onDragMove(dx, dy);
      return;
    }
    if (endpointRef.current) {
      const { id, end } = endpointRef.current;
      const snap = findSnapTarget(elements, id, p.x, p.y);
      const point = snap ? snap.point : p;
      endpointRef.current.moved = true;
      onEndpointDragMove(id, end, point, snap ? { elementId: snap.el.id } : null);
      setSnapHint(snap ? { targetId: snap.el.id, point: snap.point } : null);
      return;
    }
    const current = draftRef.current;
    if (!current) {
      if (tool === 'select' && selectedId) {
        const sel = elements.find((el) => el.id === selectedId);
        const over =
          !!sel &&
          sel.type === 'arrow' &&
          (Math.hypot(p.x - sel.x1, p.y - sel.y1) <= HANDLE_HIT ||
            Math.hypot(p.x - sel.x2, p.y - sel.y2) <= HANDLE_HIT);
        setHandleHover((prev) => (prev === over ? prev : over));
      }
      return;
    }
    if (current.type === 'pencil') {
      draftRef.current = { ...current, points: [...current.points, p] };
    } else if (current.type === 'arrow') {
      const snap = findSnapTarget(elements, current.id, p.x, p.y);
      const point = snap ? snap.point : p;
      draftRef.current = {
        ...current,
        x2: point.x,
        y2: point.y,
        endBinding: snap ? { elementId: snap.el.id } : undefined,
      };
      setSnapHint(snap ? { targetId: snap.el.id, point: snap.point } : null);
    } else {
      draftRef.current = updateShape(current, startRef.current, p);
    }
    onDraftChange(draftRef.current);
  };

  const handlePointerUp = () => {
    setSnapHint(null);
    if (endpointRef.current) {
      onDragEnd(endpointRef.current.moved);
      endpointRef.current = null;
      return;
    }
    if (moveRef.current) {
      onDragEnd(moveRef.current.moved);
      moveRef.current = null;
      return;
    }
    const current = draftRef.current;
    draftRef.current = null;
    if (!current) return;
    if (isMeaningful(current)) {
      onCommit(current);
    } else {
      onDraftChange(null);
    }
  };

  const handlePointerCancel = () => {
    setSnapHint(null);
    if (endpointRef.current) {
      onDragEnd(false);
      endpointRef.current = null;
    }
    if (moveRef.current) {
      onDragEnd(false);
      moveRef.current = null;
    }
    if (draftRef.current) {
      draftRef.current = null;
      onDraftChange(null);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ cursor: tool === 'select' ? (handleHover ? 'move' : 'default') : 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}
