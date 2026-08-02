import type { FontScale } from '../types';

export const LABEL_FONT_FAMILY = 'sans-serif';
export const LABEL_PAD = 8;

// Label size as a fraction of the box height, before the width fit kicks in.
export const FONT_SCALES: { id: FontScale; title: string; factor: number }[] = [
  { id: 'small', title: 'Small label', factor: 0.3 },
  { id: 'medium', title: 'Medium label', factor: 0.48 },
  { id: 'large', title: 'Large label', factor: 0.72 },
];

const DEFAULT_SCALE: FontScale = 'medium';

const measureCtx = document.createElement('canvas').getContext('2d');

// Picks a font size proportional to the box (per the chosen scale) and then
// shrinks it so the text never overflows the padded interior.
export function fitLabelFontSize(
  text: string,
  boxWidth: number,
  boxHeight: number,
  scale: FontScale | undefined,
  isEllipse: boolean,
): number {
  const factor = FONT_SCALES.find((s) => s.id === (scale ?? DEFAULT_SCALE))?.factor ?? 0.48;
  let availW = Math.max(boxWidth - LABEL_PAD * 2, 10);
  let availH = Math.max(boxHeight - LABEL_PAD * 2, 10);
  if (isEllipse) {
    // Keep the text inside the ellipse's inscribed rectangle.
    availW *= 0.7;
    availH *= 0.7;
  }

  const ref = 40;
  let widthAtRef = text.length * ref * 0.6;
  if (measureCtx) {
    measureCtx.font = `${ref}px ${LABEL_FONT_FAMILY}`;
    widthAtRef = measureCtx.measureText(text).width || widthAtRef;
  }
  const heightAtRef = ref * 1.2;

  let size = Math.min(boxHeight * factor, availH);
  const widthAtSize = (widthAtRef / ref) * size;
  if (widthAtSize > availW) size *= availW / widthAtSize;
  const heightAtSize = (heightAtRef / ref) * size;
  if (heightAtSize > availH) size *= availH / heightAtSize;

  return Math.max(4, Math.min(size, 240));
}
