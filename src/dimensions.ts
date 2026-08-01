import type { Anchor, DimensionElement, Element, Point } from './types';

const DIM_OFFSET = 30;
const EXTENSION_OVERSHOOT = 6;
const ARROW_SIZE = 8;
const TEXT_FONT = '12px sans-serif';
const TEXT_PADDING = 4;

export function resolveAnchor(anchor: Anchor, elements: Element[]): Point {
  if (anchor.binding) {
    const target = elements.find((e) => e.id === anchor.binding!.elementId);
    if (target) {
      switch (target.type) {
        case 'rect':
        case 'ellipse':
        case 'text': {
          const cx = target.x + target.width / 2;
          const cy = target.y + target.height / 2;
          const dx = anchor.x - cx;
          const dy = anchor.y - cy;
          return { x: cx + dx, y: cy + dy };
        }
        default:
          break;
      }
    }
  }
  return { x: anchor.x, y: anchor.y };
}

export interface DimensionGeometry {
  p1: Point;
  p2: Point;
  dimStart: Point;
  dimEnd: Point;
  ext1Start: Point;
  ext1End: Point;
  ext2Start: Point;
  ext2End: Point;
  textPos: Point;
  textAngle: number;
  distance: number;
  perpX: number;
  perpY: number;
}

export function computeDimensionGeometry(
  p1: Point,
  p2: Point,
  offset: number,
): DimensionGeometry {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const perpX = -dirY;
  const perpY = dirX;

  const dimStart: Point = { x: p1.x + perpX * offset, y: p1.y + perpY * offset };
  const dimEnd: Point = { x: p2.x + perpX * offset, y: p2.y + perpY * offset };

  const ext1Start: Point = {
    x: p1.x - perpX * EXTENSION_OVERSHOOT,
    y: p1.y - perpY * EXTENSION_OVERSHOOT,
  };
  const ext1End: Point = {
    x: dimStart.x + perpX * EXTENSION_OVERSHOOT,
    y: dimStart.y + perpY * EXTENSION_OVERSHOOT,
  };
  const ext2Start: Point = {
    x: p2.x - perpX * EXTENSION_OVERSHOOT,
    y: p2.y - perpY * EXTENSION_OVERSHOOT,
  };
  const ext2End: Point = {
    x: dimEnd.x + perpX * EXTENSION_OVERSHOOT,
    y: dimEnd.y + perpY * EXTENSION_OVERSHOOT,
  };

  const midX = (dimStart.x + dimEnd.x) / 2;
  const midY = (dimStart.y + dimEnd.y) / 2;
  const textAngle = Math.atan2(dy, dx);

  return {
    p1,
    p2,
    dimStart,
    dimEnd,
    ext1Start,
    ext1End,
    ext2Start,
    ext2End,
    textPos: { x: midX, y: midY },
    textAngle,
    distance: len,
    perpX,
    perpY,
  };
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  dirX: number,
  dirY: number,
  size: number,
) {
  const angle = Math.atan2(dirY, dirX);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(
    tip.x - size * Math.cos(angle - spread),
    tip.y - size * Math.sin(angle - spread),
  );
  ctx.lineTo(
    tip.x - size * Math.cos(angle + spread),
    tip.y - size * Math.sin(angle + spread),
  );
  ctx.closePath();
  ctx.fill();
}

export function drawDimension(
  ctx: CanvasRenderingContext2D,
  dim: DimensionElement,
  elements: Element[],
) {
  const p1 = resolveAnchor(dim.start, elements);
  const p2 = resolveAnchor(dim.end, elements);
  const g = computeDimensionGeometry(p1, p2, dim.offset);

  ctx.save();
  ctx.strokeStyle = '#e74c3c';
  ctx.fillStyle = '#e74c3c';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(g.ext1Start.x, g.ext1Start.y);
  ctx.lineTo(g.ext1End.x, g.ext1End.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(g.ext2Start.x, g.ext2Start.y);
  ctx.lineTo(g.ext2End.x, g.ext2End.y);
  ctx.stroke();

  const dimDirX = g.dimEnd.x - g.dimStart.x;
  const dimDirY = g.dimEnd.y - g.dimStart.y;
  const dimLen = Math.hypot(dimDirX, dimDirY) || 1;
  const ndx = dimDirX / dimLen;
  const ndy = dimDirY / dimLen;

  ctx.beginPath();
  ctx.moveTo(g.dimStart.x + ndx * ARROW_SIZE, g.dimStart.y + ndy * ARROW_SIZE);
  ctx.lineTo(g.dimEnd.x - ndx * ARROW_SIZE, g.dimEnd.y - ndy * ARROW_SIZE);
  ctx.stroke();

  drawArrowHead(ctx, g.dimStart, ndx, ndy, ARROW_SIZE);
  drawArrowHead(ctx, g.dimEnd, -ndx, -ndy, ARROW_SIZE);

  ctx.font = TEXT_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = Math.round(g.distance).toString();
  const metrics = ctx.measureText(label);
  const tw = metrics.width + TEXT_PADDING * 2;
  const th = 16;

  ctx.save();
  ctx.translate(g.textPos.x, g.textPos.y);
  let textAngle = g.textAngle;
  if (textAngle > Math.PI / 2) textAngle -= Math.PI;
  if (textAngle < -Math.PI / 2) textAngle += Math.PI;
  ctx.rotate(textAngle);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-tw / 2, -th / 2, tw, th);

  ctx.fillStyle = '#e74c3c';
  ctx.fillText(label, 0, 0);
  ctx.restore();

  ctx.restore();
}

export function hitDimension(
  dim: DimensionElement,
  x: number,
  y: number,
  elements: Element[],
  tolerance: number,
): boolean {
  const p1 = resolveAnchor(dim.start, elements);
  const p2 = resolveAnchor(dim.end, elements);
  const g = computeDimensionGeometry(p1, p2, dim.offset);

  const distToLine = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const ldx = x2 - x1;
    const ldy = y2 - y1;
    const lenSq = ldx * ldx + ldy * ldy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * ldx + (py - y1) * ldy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * ldx), py - (y1 + t * ldy));
  };

  if (distToLine(x, y, g.dimStart.x, g.dimStart.y, g.dimEnd.x, g.dimEnd.y) <= tolerance) return true;
  if (distToLine(x, y, g.ext1Start.x, g.ext1Start.y, g.ext1End.x, g.ext1End.y) <= tolerance) return true;
  if (distToLine(x, y, g.ext2Start.x, g.ext2Start.y, g.ext2End.x, g.ext2End.y) <= tolerance) return true;

  return false;
}

export function bboxOfDimension(dim: DimensionElement, elements: Element[]) {
  const p1 = resolveAnchor(dim.start, elements);
  const p2 = resolveAnchor(dim.end, elements);
  const g = computeDimensionGeometry(p1, p2, dim.offset);
  const xs = [g.p1.x, g.p2.x, g.dimStart.x, g.dimEnd.x, g.ext1Start.x, g.ext1End.x, g.ext2Start.x, g.ext2End.x];
  const ys = [g.p1.y, g.p2.y, g.dimStart.y, g.dimEnd.y, g.ext1Start.y, g.ext1End.y, g.ext2Start.y, g.ext2End.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export { DIM_OFFSET };
