import { useEffect, useRef, useState } from 'react';
import type {
  ArrowBinding,
  ArrowElement,
  Element,
  EllipseElement,
  Point,
  RectElement,
  Tool,
} from '../types';
import { genId } from '../types';
import type { Camera } from '../lib/camera';
import { screenToWorld, snapPointToGrid, getGridStep, clampZoom } from '../lib/camera';
import { drawDimension, hitDimension, bboxOfDimension, DIM_OFFSET } from '../lib/dimensions';
import { fitLabelFontSize, LABEL_FONT_FAMILY, LABEL_PAD } from '../lib/labelFont';

export const STROKE = '#1e1e1e';
const SELECT_COLOR = '#4a90d9';
const HIT_TOLERANCE = 6;
const MIN_SIZE = 3;
const SNAP_THRESHOLD = 14;
const HANDLE_SIZE = 8;
const HANDLE_HIT = 8;
const CURVE_SAMPLES = 24;
export const ARROW_HEAD_MIN = 14;
export const ARROW_HEAD_MAX = 30;
export const ARROW_HEAD_RATIO = 0.15;
export const ARROW_HEAD_SPREAD = Math.PI / 6;
const ARROW_BOW_RATIO = 0.1;
const ARROW_BOW_MAX = 25;

export interface ExtendPreview {
  x: number;
  y: number;
  width: number;
  height: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface CanvasProps {
  elements: Element[];
  draft: Element | null;
  tool: Tool;
  selectedIds: Set<string>;
  camera: Camera;
  gridEnabled: boolean;
  snapEnabled: boolean;
  gridSize: number;
  spaceHeld: boolean;
  extendPreview: ExtendPreview | null;
  onDraftChange: (draft: Element | null) => void;
  onCommit: (el: Element) => void;
  onSelect: (ids: Set<string>) => void;
  onDragStart: (ids: string[]) => void;
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: (moved: boolean) => void;
  onEndpointDragMove: (id: string, end: 'start' | 'end', point: Point, binding: ArrowBinding | null) => void;
  onBendDragMove: (id: string, bend: number) => void;
  onBendReset: (id: string) => void;
  onTextPlace: (x: number, y: number) => void;
  onEditLabel: (shapeId: string, x: number, y: number) => void;
  onCameraChange: (camera: Camera) => void;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
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
    if (cx !== px || cy !== py) return { x: cx, y: cy };
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

export function arrowControls(elements: Element[], el: ArrowElement): ArrowControls {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  const len = Math.hypot(dx, dy) || 1;

  // An explicit bend (dragged midpoint handle) takes priority: the curve is
  // a quadratic elevated to a cubic. A quadratic only reaches halfway toward
  // its control point, so the control point sits at twice the apex offset —
  // the shaft then passes exactly through mid + perp * bend at t = 0.5,
  // right under the drag handle.
  if (el.bend !== undefined) {
    const perpX = -dy / len;
    const perpY = dx / len;
    const qx = el.x1 + dx / 2 + perpX * el.bend * 2;
    const qy = el.y1 + dy / 2 + perpY * el.bend * 2;
    return {
      c1: { x: el.x1 + (2 / 3) * (qx - el.x1), y: el.y1 + (2 / 3) * (qy - el.y1) },
      c2: { x: el.x2 + (2 / 3) * (qx - el.x2), y: el.y2 + (2 / 3) * (qy - el.y2) },
    };
  }

  const n0 = boundNormal(elements, el, 'start');
  const n1 = boundNormal(elements, el, 'end');

  if (!n0 && !n1) {
    // Free arrow: gentle perpendicular bow for a flexible look
    const bow = Math.min(len * ARROW_BOW_RATIO, ARROW_BOW_MAX);
    const perpX = -dy / len;
    const perpY = dx / len;
    return {
      c1: { x: el.x1 + dx / 3 + perpX * bow, y: el.y1 + dy / 3 + perpY * bow },
      c2: { x: el.x1 + (2 * dx) / 3 + perpX * bow, y: el.y1 + (2 * dy) / 3 + perpY * bow },
    };
  }

  const bend = Math.min(len * 0.35, 60);
  const d0 = n0 ?? { x: dx / len, y: dy / len };
  const d1 = n1 ?? { x: -dx / len, y: -dy / len };
  return {
    c1: { x: el.x1 + d0.x * bend, y: el.y1 + d0.y * bend },
    c2: { x: el.x2 + d1.x * bend, y: el.y2 + d1.y * bend },
  };
}

function arrowMidpoint(elements: Element[], el: ArrowElement): Point {
  const c = arrowControls(elements, el);
  return cubicPoint({ x: el.x1, y: el.y1 }, c.c1, c.c2, { x: el.x2, y: el.y2 }, 0.5);
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

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

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
      const p0 = { x: el.x1, y: el.y1 };
      const p1 = { x: el.x2, y: el.y2 };
      let prev = p0;
      for (let i = 1; i <= CURVE_SAMPLES; i++) {
        const q = cubicPoint(p0, controls.c1, controls.c2, p1, i / CURVE_SAMPLES);
        if (distToSegment(x, y, prev.x, prev.y, q.x, q.y) <= HIT_TOLERANCE) return true;
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
        if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_TOLERANCE) return true;
      }
      return false;
    }
    case 'dimension':
      return hitDimension(el, x, y, elements, HIT_TOLERANCE);
  }
}

function hitTest(elements: Element[], x: number, y: number): Element | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitElement(elements[i], x, y, elements)) return elements[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bounding boxes
// ---------------------------------------------------------------------------

export function bboxOf(el: Element, elements: Element[]): { x: number; y: number; w: number; h: number } {
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
      if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'dimension':
      return bboxOfDimension(el, elements);
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function drawShapeText(
  ctx: CanvasRenderingContext2D,
  el: RectElement | EllipseElement,
  color: string,
) {
  const { x, y, width: w, height: h, text } = el;
  if (!text) return;
  const size = fitLabelFontSize(text, w, h, el.fontScale, el.type === 'ellipse');
  ctx.save();
  ctx.font = `${size}px ${LABEL_FONT_FAMILY}`;
  // Text color is independent of the border color; it falls back to the
  // border color when unset so labels stay legible on unfilled shapes.
  ctx.fillStyle = el.textColor ?? color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Clip keeps oversized labels (e.g. large scale on a tiny box) inside the shape.
  const pad = Math.min(LABEL_PAD, w / 4, h / 4);
  ctx.beginPath();
  ctx.rect(x + pad, y + pad, Math.max(w - pad * 2, 1), Math.max(h - pad * 2, 1));
  ctx.clip();
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
}

export function drawElement(ctx: CanvasRenderingContext2D, el: Element, elements: Element[]): void {
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
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y + 0.01);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      break;
    }
    case 'rect': {
      const color = el.color ?? STROKE;
      if (el.fill) {
        ctx.fillStyle = el.fill;
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      drawShapeText(ctx, el, color);
      break;
    }
    case 'ellipse': {
      const color = el.color ?? STROKE;
      ctx.beginPath();
      ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      if (el.fill) {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.stroke();
      drawShapeText(ctx, el, color);
      break;
    }
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
      ctx.bezierCurveTo(controls.c1.x, controls.c1.y, controls.c2.x, controls.c2.y, el.x2, el.y2);
      ctx.stroke();
      const angle = Math.atan2(el.y2 - controls.c2.y, el.x2 - controls.c2.x);
      const arrowLen = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      const headLength = clamp(arrowLen * ARROW_HEAD_RATIO, ARROW_HEAD_MIN, ARROW_HEAD_MAX);
      const spread = ARROW_HEAD_SPREAD;
      ctx.beginPath();
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - headLength * Math.cos(angle - spread), el.y2 - headLength * Math.sin(angle - spread));
      ctx.lineTo(el.x2 - headLength * Math.cos(angle + spread), el.y2 - headLength * Math.sin(angle + spread));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'text':
      ctx.font = '20px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(el.text, el.x, el.y);
      break;
    case 'dimension':
      drawDimension(ctx, el, elements);
      break;
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  gridSize: number,
) {
  const step = getGridStep(gridSize, camera.zoom);
  const majorEvery = 5;

  const worldLeft = -camera.x / camera.zoom;
  const worldTop = -camera.y / camera.zoom;
  const worldRight = (width - camera.x) / camera.zoom;
  const worldBottom = (height - camera.y) / camera.zoom;

  const startX = Math.floor(worldLeft / step) * step;
  const startY = Math.floor(worldTop / step) * step;

  ctx.save();
  ctx.lineWidth = 1 / camera.zoom;

  ctx.strokeStyle = '#f0f0f0';
  ctx.beginPath();
  for (let x = startX; x <= worldRight; x += step) {
    if (Math.round(x / step) % majorEvery === 0) continue;
    ctx.moveTo(x, worldTop);
    ctx.lineTo(x, worldBottom);
  }
  for (let y = startY; y <= worldBottom; y += step) {
    if (Math.round(y / step) % majorEvery === 0) continue;
    ctx.moveTo(worldLeft, y);
    ctx.lineTo(worldRight, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#e0e0e0';
  ctx.beginPath();
  for (let x = startX; x <= worldRight; x += step) {
    if (Math.round(x / step) % majorEvery !== 0) continue;
    ctx.moveTo(x, worldTop);
    ctx.lineTo(x, worldBottom);
  }
  for (let y = startY; y <= worldBottom; y += step) {
    if (Math.round(y / step) % majorEvery !== 0) continue;
    ctx.moveTo(worldLeft, y);
    ctx.lineTo(worldRight, y);
  }
  ctx.stroke();

  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, el: Element, elements: Element[]): void {
  const b = bboxOf(el, elements);
  ctx.save();
  ctx.strokeStyle = SELECT_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  ctx.restore();
}

function drawArrowHandles(ctx: CanvasRenderingContext2D, el: ArrowElement, elements: Element[]): void {
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
  // Circular midpoint handle: drag it to flex the arrow.
  const mid = arrowMidpoint(elements, el);
  ctx.beginPath();
  ctx.arc(mid.x, mid.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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
    ctx.ellipse(target.x + target.width / 2, target.y + target.height / 2, target.width / 2, target.height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExtendPreview(ctx: CanvasRenderingContext2D, p: ExtendPreview): void {
  ctx.save();
  ctx.strokeStyle = SELECT_COLOR;
  ctx.fillStyle = SELECT_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(p.x, p.y, p.width, p.height);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p.fromX, p.fromY);
  ctx.lineTo(p.toX, p.toY);
  ctx.stroke();
  const angle = Math.atan2(p.toY - p.fromY, p.toX - p.fromX);
  const previewLen = Math.hypot(p.toX - p.fromX, p.toY - p.fromY);
  const headLength = clamp(previewLen * ARROW_HEAD_RATIO, ARROW_HEAD_MIN, ARROW_HEAD_MAX);
  const spread = ARROW_HEAD_SPREAD;
  ctx.beginPath();
  ctx.moveTo(p.toX, p.toY);
  ctx.lineTo(p.toX - headLength * Math.cos(angle - spread), p.toY - headLength * Math.sin(angle - spread));
  ctx.lineTo(p.toX - headLength * Math.cos(angle + spread), p.toY - headLength * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shape creation helpers
// ---------------------------------------------------------------------------

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
    case 'dimension':
      return Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y) > MIN_SIZE;
  }
}

// ---------------------------------------------------------------------------
// Canvas component
// ---------------------------------------------------------------------------

export default function Canvas({
  elements,
  draft,
  tool,
  selectedIds,
  camera,
  gridEnabled,
  snapEnabled,
  gridSize,
  spaceHeld,
  extendPreview,
  onDraftChange,
  onCommit,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onEndpointDragMove,
  onBendDragMove,
  onBendReset,
  onTextPlace,
  onEditLabel,
  onCameraChange,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<Element | null>(null);
  const startRef = useRef<Point>({ x: 0, y: 0 });
  const moveRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const endpointRef = useRef<{ id: string; end: 'start' | 'end'; moved: boolean } | null>(null);
  const bendRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);
  const marqueeRef = useRef<{
    startWorld: Point;
    currentWorld: Point;
    additive: boolean;
    baseIds: Set<string>;
  } | null>(null);
  const pendingDimRef = useRef<Point | null>(null);
  const lastClickRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  // Multi-touch: every active pointer (screen coords), plus the two-finger
  // pinch/pan gesture state captured when the second finger lands.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    startDist: number;
    startMidX: number;
    startMidY: number;
    startCam: Camera;
  } | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const [snapHint, setSnapHint] = useState<{ targetId: string; point: Point } | null>(null);
  const [handleHover, setHandleHover] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Clear pending dimension when switching tools
  useEffect(() => {
    pendingDimRef.current = null;
  }, [tool]);

  // ---- Render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // World-space rendering (camera transform)
      ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.x, dpr * camera.y);

      if (gridEnabled) {
        drawGrid(ctx, camera, w, h, gridSize);
      }

      for (const el of elements) {
        drawElement(ctx, el, elements);
      }
      if (draft) {
        drawElement(ctx, draft, elements);
      }
      if (snapHint) {
        const target = elements.find((e) => e.id === snapHint.targetId);
        if (target) {
          drawSnapHint(ctx, target, snapHint.point);
        }
      }
      if (extendPreview) {
        drawExtendPreview(ctx, extendPreview);
      }

      // Selection indicators (world-space, line width compensated for zoom)
      if (selectedIds.size > 0) {
        ctx.save();
        ctx.lineWidth = 1 / camera.zoom;
        for (const id of selectedIds) {
          const sel = elements.find((e) => e.id === id);
          if (sel) {
            drawSelection(ctx, sel, elements);
            if (sel.type === 'arrow') {
              drawArrowHandles(ctx, sel, elements);
            }
          }
        }
        ctx.restore();
      }

      // Screen-space overlays
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (marqueeBox) {
        const sx1 = marqueeBox.x1 * camera.zoom + camera.x;
        const sy1 = marqueeBox.y1 * camera.zoom + camera.y;
        const sx2 = marqueeBox.x2 * camera.zoom + camera.x;
        const sy2 = marqueeBox.y2 * camera.zoom + camera.y;
        ctx.save();
        ctx.strokeStyle = SELECT_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(sx1, sy1, sx2 - sx1, sy2 - sy1);
        ctx.fillStyle = 'rgba(74, 144, 217, 0.08)';
        ctx.fillRect(sx1, sy1, sx2 - sx1, sy2 - sy1);
        ctx.restore();
      }
    };
    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [elements, draft, selectedIds, snapHint, camera, gridEnabled, gridSize, marqueeBox, extendPreview]);

  // ---- Wheel zoom (non-passive to allow preventDefault) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const delta = -e.deltaY * (e.ctrlKey ? 0.01 : 0.002);
      const newZoom = cam.zoom * (1 + delta);
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(cam, sx, sy);
      const clampedZoom = Math.max(0.1, Math.min(10, newZoom));
      onCameraChange({
        x: sx - world.x * clampedZoom,
        y: sy - world.y * clampedZoom,
        zoom: clampedZoom,
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onCameraChange]);

  // Safety net for the pointer map: the text tool deliberately skips pointer
  // capture, so a finger/mouse released outside the canvas never fires the
  // canvas pointerup. A window-level capture listener sees every release and
  // keeps the map from accumulating stale entries (which a later pointerdown
  // would misread as a second finger).
  useEffect(() => {
    const prune = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
    };
    window.addEventListener('pointerup', prune, true);
    window.addEventListener('pointercancel', prune, true);
    return () => {
      window.removeEventListener('pointerup', prune, true);
      window.removeEventListener('pointercancel', prune, true);
    };
  }, []);

  const maybeSnap = (p: Point): Point => (snapEnabled ? snapPointToGrid(p, gridSize) : p);

  // Abandon whatever the first finger started when a second finger turns the
  // interaction into a two-finger gesture. Element drags snap back to their
  // start position; open drafts and marquees are dropped. Endpoint/bend drags
  // commit as-is (they are undoable).
  const cancelSinglePointerWork = () => {
    setSnapHint(null);
    panRef.current = null;
    if (moveRef.current) {
      onDragMove(0, 0);
      onDragEnd(false);
      moveRef.current = null;
    }
    if (endpointRef.current) {
      onDragEnd(endpointRef.current.moved);
      endpointRef.current = null;
    }
    if (bendRef.current) {
      onDragEnd(bendRef.current.moved);
      bendRef.current = null;
    }
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeBox(null);
    }
    if (draftRef.current) {
      draftRef.current = null;
      onDraftChange(null);
    }
  };

  // ---- Pointer handlers ----
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const p = screenToWorld(camera, screenX, screenY);

    pointersRef.current.set(e.pointerId, { x: screenX, y: screenY });

    // Second finger: pinch-to-zoom + two-finger pan gesture.
    if (pointersRef.current.size === 2) {
      cancelSinglePointerWork();
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current = {
        startDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        startMidX: (a.x + b.x) / 2,
        startMidY: (a.y + b.y) / 2,
        startCam: cameraRef.current,
      };
      return;
    }
    if (pointersRef.current.size > 2) return;

    // Pan: middle mouse or space + left click
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      panRef.current = { startX: screenX, startY: screenY, camX: camera.x, camY: camera.y };
      return;
    }
    if (e.button !== 0) return;

    // Double-click detection (shared by select mode and the shape tools,
    // which treat a double-click on a shape as "label it")
    const now = Date.now();
    const last = lastClickRef.current;
    const isDoubleClick =
      now - last.time < 400 && Math.hypot(p.x - last.x, p.y - last.y) < 10 / camera.zoom;
    lastClickRef.current = { time: now, x: p.x, y: p.y };

    // Text tool: no pointer capture so the textarea can receive focus
    if (tool === 'text') {
      const hit = hitTest(elements, p.x, p.y);
      if (hit && (hit.type === 'rect' || hit.type === 'ellipse')) {
        onEditLabel(hit.id, hit.x + hit.width / 2, hit.y + hit.height / 2);
      } else if (hit && hit.type === 'text') {
        onEditLabel(hit.id, hit.x + hit.width / 2, hit.y + hit.height / 2);
      } else {
        onTextPlace(p.x, p.y);
      }
      return;
    }

    if (tool === 'select') {
      // Arrow endpoint and bend handles
      for (const id of selectedIds) {
        const sel = elements.find((el) => el.id === id);
        if (sel && sel.type === 'arrow') {
          const nearStart = Math.hypot(p.x - sel.x1, p.y - sel.y1) <= HANDLE_HIT / camera.zoom;
          const nearEnd = Math.hypot(p.x - sel.x2, p.y - sel.y2) <= HANDLE_HIT / camera.zoom;
          if (nearStart || nearEnd) {
            canvasRef.current?.setPointerCapture(e.pointerId);
            onDragStart([sel.id]);
            endpointRef.current = { id: sel.id, end: nearStart ? 'start' : 'end', moved: false };
            return;
          }
          const mid = arrowMidpoint(elements, sel);
          if (Math.hypot(p.x - mid.x, p.y - mid.y) <= HANDLE_HIT / camera.zoom) {
            canvasRef.current?.setPointerCapture(e.pointerId);
            onDragStart([sel.id]);
            bendRef.current = { id: sel.id, moved: false };
            return;
          }
        }
      }

      const hit = hitTest(elements, p.x, p.y);

      // Double-click: edit shape labels or standalone text
      if (isDoubleClick && hit) {
        if (hit.type === 'rect' || hit.type === 'ellipse' || hit.type === 'text') {
          onEditLabel(hit.id, hit.x + hit.width / 2, hit.y + hit.height / 2);
          return;
        }
        // Double-click an arrow to release its bend back to the default curve.
        if (hit.type === 'arrow' && hit.bend !== undefined) {
          onBendReset(hit.id);
          return;
        }
      }

      if (hit) {
        canvasRef.current?.setPointerCapture(e.pointerId);
        if (e.shiftKey) {
          const next = new Set(selectedIds);
          if (next.has(hit.id)) next.delete(hit.id);
          else next.add(hit.id);
          onSelect(next);
          if (next.size > 0) {
            onDragStart([...next]);
            moveRef.current = { startX: p.x, startY: p.y, moved: false };
          }
        } else {
          let ids: Set<string>;
          if (selectedIds.has(hit.id)) {
            ids = selectedIds;
          } else {
            ids = new Set([hit.id]);
            onSelect(ids);
          }
          onDragStart([...ids]);
          moveRef.current = { startX: p.x, startY: p.y, moved: false };
        }
      } else {
        canvasRef.current?.setPointerCapture(e.pointerId);
        // Shift-drag adds the marquee result to the current selection; a plain
        // drag replaces it.
        const additive = e.shiftKey;
        if (!additive) onSelect(new Set());
        marqueeRef.current = {
          startWorld: p,
          currentWorld: p,
          additive,
          baseIds: additive ? new Set(selectedIds) : new Set(),
        };
        setMarqueeBox({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      }
      return;
    }

    // Smart shortcut: with a shape tool active, double-clicking an existing
    // shape means "label it" rather than drawing on top of it.
    if (
      isDoubleClick &&
      (tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow')
    ) {
      const hit = hitTest(elements, p.x, p.y);
      if (hit && (hit.type === 'rect' || hit.type === 'ellipse' || hit.type === 'text')) {
        onEditLabel(hit.id, hit.x + hit.width / 2, hit.y + hit.height / 2);
        return;
      }
    }

    canvasRef.current?.setPointerCapture(e.pointerId);

    if (tool === 'dimension') {
      const snapped = maybeSnap(p);
      const snap = findSnapTarget(elements, '', snapped.x, snapped.y);
      const anchor = snap
        ? { x: snap.point.x, y: snap.point.y, binding: { elementId: snap.el.id } }
        : { x: snapped.x, y: snapped.y };

      if (pendingDimRef.current) {
        const dim: Element = {
          id: genId(),
          type: 'dimension',
          start: { x: pendingDimRef.current.x, y: pendingDimRef.current.y },
          end: anchor,
          offset: DIM_OFFSET,
        };
        pendingDimRef.current = null;
        draftRef.current = null;
        onDraftChange(null);
        onCommit(dim);
      } else {
        pendingDimRef.current = anchor;
        draftRef.current = {
          id: genId(),
          type: 'dimension',
          start: anchor,
          end: anchor,
          offset: DIM_OFFSET,
        };
        onDraftChange(draftRef.current);
      }
      if (snap) setSnapHint({ targetId: snap.el.id, point: snap.point });
      return;
    }

    // Drawing tools: pencil, rectangle, ellipse, line, arrow
    const snapped = maybeSnap(p);
    startRef.current = snapped;
    if (tool === 'pencil') {
      draftRef.current = { id: genId(), type: 'pencil', points: [snapped] };
    } else {
      draftRef.current = makeShape(tool, genId(), snapped, snapped);
      if (draftRef.current.type === 'arrow') {
        const snap = findSnapTarget(elements, draftRef.current.id, snapped.x, snapped.y);
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
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: screenX, y: screenY });
    }

    // Two-finger pinch/pan: the distance change zooms around the midpoint,
    // and the midpoint movement pans.
    if (gestureRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const g = gestureRef.current;
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const zoom = clampZoom(g.startCam.zoom * (dist / g.startDist));
      const world = screenToWorld(g.startCam, g.startMidX, g.startMidY);
      onCameraChange({
        x: midX - world.x * zoom,
        y: midY - world.y * zoom,
        zoom,
      });
      return;
    }

    // Panning
    if (panRef.current) {
      const dx = screenX - panRef.current.startX;
      const dy = screenY - panRef.current.startY;
      onCameraChange({
        ...cameraRef.current,
        x: panRef.current.camX + dx,
        y: panRef.current.camY + dy,
      });
      return;
    }

    const p = screenToWorld(camera, screenX, screenY);

    // Dragging selected elements
    if (moveRef.current) {
      const dx = p.x - moveRef.current.startX;
      const dy = p.y - moveRef.current.startY;
      if (dx !== 0 || dy !== 0) moveRef.current.moved = true;
      onDragMove(dx, dy);
      return;
    }

    // Dragging arrow endpoint
    if (endpointRef.current) {
      const { id, end } = endpointRef.current;
      const snap = findSnapTarget(elements, id, p.x, p.y);
      const point = snap ? snap.point : p;
      endpointRef.current.moved = true;
      onEndpointDragMove(id, end, point, snap ? { elementId: snap.el.id } : null);
      setSnapHint(snap ? { targetId: snap.el.id, point: snap.point } : null);
      return;
    }

    // Dragging arrow bend handle: bend is the pointer's perpendicular offset
    // from the straight chord.
    if (bendRef.current) {
      const { id } = bendRef.current;
      const el = elements.find((e) => e.id === id);
      if (el && el.type === 'arrow') {
        const dx = el.x2 - el.x1;
        const dy = el.y2 - el.y1;
        const len = Math.hypot(dx, dy) || 1;
        const midX = (el.x1 + el.x2) / 2;
        const midY = (el.y1 + el.y2) / 2;
        bendRef.current.moved = true;
        onBendDragMove(id, ((p.x - midX) * -dy + (p.y - midY) * dx) / len);
      }
      return;
    }

    // Marquee selection
    if (marqueeRef.current) {
      marqueeRef.current.currentWorld = p;
      setMarqueeBox({
        x1: marqueeRef.current.startWorld.x,
        y1: marqueeRef.current.startWorld.y,
        x2: p.x,
        y2: p.y,
      });
      return;
    }

    // Dimension preview (second point not yet placed)
    const current = draftRef.current;
    if (current && current.type === 'dimension' && pendingDimRef.current) {
      const snapped = maybeSnap(p);
      const snap = findSnapTarget(elements, current.id, snapped.x, snapped.y);
      const endPoint = snap ? snap.point : snapped;
      draftRef.current = {
        ...current,
        end: snap
          ? { x: snap.point.x, y: snap.point.y, binding: { elementId: snap.el.id } }
          : { x: endPoint.x, y: endPoint.y },
      };
      onDraftChange(draftRef.current);
      setSnapHint(snap ? { targetId: snap.el.id, point: snap.point } : null);
      return;
    }

    if (!current) {
      // Handle hover cursor for arrow endpoints and bend handles
      if (tool === 'select' && selectedIds.size > 0) {
        let over = false;
        for (const id of selectedIds) {
          const sel = elements.find((el) => el.id === id);
          if (sel && sel.type === 'arrow') {
            const mid = arrowMidpoint(elements, sel);
            if (
              Math.hypot(p.x - sel.x1, p.y - sel.y1) <= HANDLE_HIT / camera.zoom ||
              Math.hypot(p.x - sel.x2, p.y - sel.y2) <= HANDLE_HIT / camera.zoom ||
              Math.hypot(p.x - mid.x, p.y - mid.y) <= HANDLE_HIT / camera.zoom
            ) {
              over = true;
              break;
            }
          }
        }
        setHandleHover((prev) => (prev === over ? prev : over));
      }
      return;
    }

    // Drawing tool previews
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

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (gestureRef.current) {
      if (pointersRef.current.size < 2) {
        // Gesture over. A finger still down does nothing until it lifts and
        // touches again.
        gestureRef.current = null;
      }
      return;
    }

    setSnapHint(null);

    if (panRef.current) {
      panRef.current = null;
      return;
    }

    if (endpointRef.current) {
      onDragEnd(endpointRef.current.moved);
      endpointRef.current = null;
      return;
    }

    if (bendRef.current) {
      onDragEnd(bendRef.current.moved);
      bendRef.current = null;
      return;
    }

    if (moveRef.current) {
      onDragEnd(moveRef.current.moved);
      moveRef.current = null;
      return;
    }

    // Marquee selection commit
    if (marqueeRef.current) {
      const { startWorld, currentWorld } = marqueeRef.current;
      const minX = Math.min(startWorld.x, currentWorld.x);
      const maxX = Math.max(startWorld.x, currentWorld.x);
      const minY = Math.min(startWorld.y, currentWorld.y);
      const maxY = Math.max(startWorld.y, currentWorld.y);

      if (maxX - minX > 2 / camera.zoom || maxY - minY > 2 / camera.zoom) {
        const hits = new Set<string>();
        for (const el of elements) {
          const b = bboxOf(el, elements);
          // Select anything whose bounds intersect the marquee rectangle.
          if (b.x <= maxX && b.x + b.w >= minX && b.y <= maxY && b.y + b.h >= minY) {
            hits.add(el.id);
          }
        }
        onSelect(
          marqueeRef.current.additive
            ? new Set([...marqueeRef.current.baseIds, ...hits])
            : hits,
        );
      }

      marqueeRef.current = null;
      setMarqueeBox(null);
      return;
    }

    // Dimension tool: first click just sets the anchor, don't commit
    if (tool === 'dimension' && pendingDimRef.current) {
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

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    setSnapHint(null);
    panRef.current = null;
    pendingDimRef.current = null;
    if (endpointRef.current) {
      onDragEnd(false);
      endpointRef.current = null;
    }
    if (bendRef.current) {
      onDragEnd(false);
      bendRef.current = null;
    }
    if (moveRef.current) {
      onDragEnd(false);
      moveRef.current = null;
    }
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeBox(null);
    }
    if (draftRef.current) {
      draftRef.current = null;
      onDraftChange(null);
    }
  };

  // ---- Cursor ----
  let cursor = 'crosshair';
  if (tool === 'select') {
    cursor = handleHover ? 'move' : 'default';
  }
  if (spaceHeld) {
    cursor = panRef.current ? 'grabbing' : 'grab';
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}
