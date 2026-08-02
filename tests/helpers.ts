import type { Page } from '@playwright/test';

export type RGB = [number, number, number];

// Returns the non-transparent pixel colors in a (2r x 2r) region around (x, y),
// measured in CSS pixels (top-left origin of the canvas).
export async function colorsNear(page: Page, x: number, y: number, r: number): Promise<RGB[]> {
  return page.evaluate(
    ([cx, cy, rad]) => {
      const c = document.querySelector('canvas');
      if (!c) return [];
      const ctx = c.getContext('2d');
      if (!ctx) return [];
      const dpr = window.devicePixelRatio || 1;
      const size = Math.max(1, Math.round(2 * rad * dpr));
      const data = ctx.getImageData(
        Math.round((cx - rad) * dpr),
        Math.round((cy - rad) * dpr),
        size,
        size,
      ).data;
      const colors: [number, number, number][] = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 128) colors.push([data[i], data[i + 1], data[i + 2]]);
      }
      return colors;
    },
    [x, y, r],
  );
}

// Default ink #1e1e1e (and anti-aliased blends of it).
export const isDark = ([r, g, b]: RGB): boolean => r < 100 && g < 100 && b < 100;
export const isWhite = ([r, g, b]: RGB): boolean => r > 240 && g > 240 && b > 240;
// Red-dominant pixel: catches the solid #dc2626 swatch / #e74c3c dimension red
// AND their anti-aliased blends with white (thin 1px lines render pinkish).
// Rejects white, grid gray, dark ink, and the blue selection color.
export const isRed = ([r, g, b]: RGB): boolean => r > 150 && r > g + 30 && r > b + 30;

export function elementCount(page: Page) {
  return page.locator('[data-testid="element-count"]');
}

// Drags out a shape with the named toolbar tool ('Rect', 'Ellipse', 'Line',
// 'Arrow'). Tools are one-shot, so this leaves the new shape selected and the
// Select tool active.
export async function drawShape(
  page: Page,
  toolName: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  await page.getByRole('button', { name: toolName }).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
}

// X of the first dark (stroke) pixel scanning row `y` from x0..x1, or -1.
// Grid lines (light gray) and the blue selection box are intentionally ignored.
export async function firstDarkX(page: Page, y: number, x0: number, x1: number): Promise<number> {
  return page.evaluate(
    ([yy, a, b]) => {
      const c = document.querySelector('canvas');
      if (!c) return -1;
      const ctx = c.getContext('2d');
      if (!ctx) return -1;
      const dpr = window.devicePixelRatio || 1;
      const py = Math.round(yy * dpr);
      for (let x = a; x <= b; x++) {
        const d = ctx.getImageData(Math.round(x * dpr), py, 1, 1).data;
        if (d[3] > 128 && d[0] < 120 && d[1] < 120 && d[2] < 120) return x;
      }
      return -1;
    },
    [y, x0, x1],
  );
}

// Counts light-gray grid pixels (minor #f0f0f0 / major #e0e0e0) in a region.
// Pure white background (grid off) and dark strokes are excluded.
export async function countGridPixels(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<number> {
  return page.evaluate(
    ([ax, ay, bx, by]) => {
      const c = document.querySelector('canvas');
      if (!c) return 0;
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round((bx - ax) * dpr);
      const h = Math.round((by - ay) * dpr);
      const data = ctx.getImageData(Math.round(ax * dpr), Math.round(ay * dpr), w, h).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= 215 && r <= 245 && Math.abs(r - g) <= 6 && Math.abs(r - b) <= 6) n++;
      }
      return n;
    },
    [x0, y0, x1, y1],
  );
}
