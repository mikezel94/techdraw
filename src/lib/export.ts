import type {
  ArrowElement,
  DimensionElement,
  Element,
  EllipseElement,
  RectElement,
} from '../types';
import {
  ARROW_HEAD_MAX,
  ARROW_HEAD_MIN,
  ARROW_HEAD_RATIO,
  ARROW_HEAD_SPREAD,
  STROKE,
  arrowControls,
  bboxOf,
  drawElement,
} from '../components/Canvas';
import { computeDimensionGeometry, resolveAnchor } from './dimensions';
import { LABEL_FONT_FAMILY, fitLabelFontSize } from './labelFont';

// Padding (world units) added around the content bounding box so strokes and
// dimension lines are not clipped at the image edge.
const EXPORT_PADDING = 24;
const DIM_COLOR = '#e74c3c';
const DIM_ARROW_SIZE = 8;
const DIM_ARROW_SPREAD = Math.PI / 7;
const DIM_TEXT_FONT_SIZE = 12;

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Union of every element's bounding box, expanded by the export padding.
// Returns null when there is nothing to export.
export function contentBounds(elements: Element[]): Bounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = bboxOf(el, elements);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX - EXPORT_PADDING,
    y: minY - EXPORT_PADDING,
    w: maxX - minX + EXPORT_PADDING * 2,
    h: maxY - minY + EXPORT_PADDING * 2,
  };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// PNG export — reuses the on-screen canvas renderer for pixel-parity output.
// ---------------------------------------------------------------------------

export function exportPng(elements: Element[], scale: number, transparent: boolean): void {
  const bounds = contentBounds(elements);
  if (!bounds) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bounds.w * scale));
  canvas.height = Math.max(1, Math.round(bounds.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, bounds.w, bounds.h);
  }
  ctx.translate(-bounds.x, -bounds.y);
  for (const el of elements) {
    drawElement(ctx, el, elements);
  }
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `techdraw-${timestamp()}.png`);
  }, 'image/png');
}

// ---------------------------------------------------------------------------
// SVG export — serializes each element to its matching SVG primitive.
// ---------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function shapeLabelSvg(el: RectElement | EllipseElement, fallbackColor: string): string {
  if (!el.text) return '';
  const size = fitLabelFontSize(el.text, el.width, el.height, el.fontScale, el.type === 'ellipse');
  const cx = round2(el.x + el.width / 2);
  const cy = round2(el.y + el.height / 2);
  const fill = el.textColor ?? fallbackColor;
  return (
    `<text x="${cx}" y="${cy}" font-family="${LABEL_FONT_FAMILY}" font-size="${round2(size)}" ` +
    `fill="${fill}" text-anchor="middle" dominant-baseline="central">${escapeXml(el.text)}</text>`
  );
}

function arrowHeadPoints(tipX: number, tipY: number, dirX: number, dirY: number, size: number, spread: number): string {
  const angle = Math.atan2(dirY, dirX);
  const bx1 = tipX - size * Math.cos(angle - spread);
  const by1 = tipY - size * Math.sin(angle - spread);
  const bx2 = tipX - size * Math.cos(angle + spread);
  const by2 = tipY - size * Math.sin(angle + spread);
  return `${round2(tipX)},${round2(tipY)} ${round2(bx1)},${round2(by1)} ${round2(bx2)},${round2(by2)}`;
}

function arrowSvg(el: ArrowElement, elements: Element[]): string {
  const c = arrowControls(elements, el);
  const path =
    `<path d="M ${round2(el.x1)} ${round2(el.y1)} C ${round2(c.c1.x)} ${round2(c.c1.y)}, ` +
    `${round2(c.c2.x)} ${round2(c.c2.y)}, ${round2(el.x2)} ${round2(el.y2)}" ` +
    `fill="none" stroke="${STROKE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dirX = el.x2 - c.c2.x;
  const dirY = el.y2 - c.c2.y;
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  const headLength = clamp(len * ARROW_HEAD_RATIO, ARROW_HEAD_MIN, ARROW_HEAD_MAX);
  const head = `<polygon points="${arrowHeadPoints(el.x2, el.y2, dirX, dirY, headLength, ARROW_HEAD_SPREAD)}" fill="${STROKE}"/>`;
  return path + head;
}

function dimensionSvg(el: DimensionElement, elements: Element[]): string {
  const p1 = resolveAnchor(el.start, elements);
  const p2 = resolveAnchor(el.end, elements);
  const g = computeDimensionGeometry(p1, p2, el.offset);
  const dimDirX = g.dimEnd.x - g.dimStart.x;
  const dimDirY = g.dimEnd.y - g.dimStart.y;
  const dimLen = Math.hypot(dimDirX, dimDirY) || 1;
  const ndx = dimDirX / dimLen;
  const ndy = dimDirY / dimLen;
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `<line x1="${round2(a.x)}" y1="${round2(a.y)}" x2="${round2(b.x)}" y2="${round2(b.y)}" ` +
    `stroke="${DIM_COLOR}" stroke-width="1"/>`;

  const parts: string[] = [];
  parts.push(line(g.ext1Start, g.ext1End));
  parts.push(line(g.ext2Start, g.ext2End));
  parts.push(
    line(
      { x: g.dimStart.x + ndx * DIM_ARROW_SIZE, y: g.dimStart.y + ndy * DIM_ARROW_SIZE },
      { x: g.dimEnd.x - ndx * DIM_ARROW_SIZE, y: g.dimEnd.y - ndy * DIM_ARROW_SIZE },
    ),
  );
  parts.push(`<polygon points="${arrowHeadPoints(g.dimStart.x, g.dimStart.y, ndx, ndy, DIM_ARROW_SIZE, DIM_ARROW_SPREAD)}" fill="${DIM_COLOR}"/>`);
  parts.push(`<polygon points="${arrowHeadPoints(g.dimEnd.x, g.dimEnd.y, -ndx, -ndy, DIM_ARROW_SIZE, DIM_ARROW_SPREAD)}" fill="${DIM_COLOR}"/>`);

  const label = Math.round(g.distance).toString();
  // Approximate the canvas measureText width so the white knockout behind the
  // label matches what the on-screen renderer produces.
  const tw = label.length * DIM_TEXT_FONT_SIZE * 0.6 + 8;
  const th = 16;
  let textAngle = g.textAngle;
  if (textAngle > Math.PI / 2) textAngle -= Math.PI;
  if (textAngle < -Math.PI / 2) textAngle += Math.PI;
  const deg = round2((textAngle * 180) / Math.PI);
  parts.push(
    `<g transform="translate(${round2(g.textPos.x)} ${round2(g.textPos.y)}) rotate(${deg})">` +
      `<rect x="${round2(-tw / 2)}" y="${round2(-th / 2)}" width="${round2(tw)}" height="${th}" fill="#ffffff"/>` +
      `<text x="0" y="0" font-family="${LABEL_FONT_FAMILY}" font-size="${DIM_TEXT_FONT_SIZE}" fill="${DIM_COLOR}" ` +
      `text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>` +
      `</g>`,
  );
  return parts.join('');
}

function elementSvg(el: Element, elements: Element[]): string {
  switch (el.type) {
    case 'pencil': {
      if (el.points.length === 0) return '';
      const pts = el.points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
      return (
        `<polyline points="${pts}" fill="none" stroke="${STROKE}" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    case 'rect': {
      const color = el.color ?? STROKE;
      const rect =
        `<rect x="${round2(el.x)}" y="${round2(el.y)}" width="${round2(el.width)}" height="${round2(el.height)}" ` +
        `fill="${el.fill ?? 'none'}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
      return rect + shapeLabelSvg(el, color);
    }
    case 'ellipse': {
      const color = el.color ?? STROKE;
      const cx = round2(el.x + el.width / 2);
      const cy = round2(el.y + el.height / 2);
      const ellipse =
        `<ellipse cx="${cx}" cy="${cy}" rx="${round2(el.width / 2)}" ry="${round2(el.height / 2)}" ` +
        `fill="${el.fill ?? 'none'}" stroke="${color}" stroke-width="2"/>`;
      return ellipse + shapeLabelSvg(el, color);
    }
    case 'line':
      return (
        `<line x1="${round2(el.x1)}" y1="${round2(el.y1)}" x2="${round2(el.x2)}" y2="${round2(el.y2)}" ` +
        `stroke="${STROKE}" stroke-width="2" stroke-linecap="round"/>`
      );
    case 'arrow':
      return arrowSvg(el, elements);
    case 'text':
      return (
        `<text x="${round2(el.x)}" y="${round2(el.y)}" font-family="sans-serif" font-size="20" ` +
        `fill="${STROKE}" dominant-baseline="hanging">${escapeXml(el.text)}</text>`
      );
    case 'dimension':
      return dimensionSvg(el, elements);
  }
}

export function buildSvg(elements: Element[]): string | null {
  const bounds = contentBounds(elements);
  if (!bounds) return null;
  const body = elements.map((el) => elementSvg(el, elements)).join('');
  const vb = `${round2(bounds.x)} ${round2(bounds.y)} ${round2(bounds.w)} ${round2(bounds.h)}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${round2(bounds.w)}" height="${round2(bounds.h)}">` +
    `<rect x="${round2(bounds.x)}" y="${round2(bounds.y)}" width="${round2(bounds.w)}" height="${round2(bounds.h)}" fill="#ffffff"/>` +
    body +
    `</svg>`
  );
}

export function exportSvg(elements: Element[]): void {
  const svg = buildSvg(elements);
  if (!svg) return;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `techdraw-${timestamp()}.svg`);
}
