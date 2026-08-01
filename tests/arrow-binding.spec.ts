import { test, expect } from '@playwright/test';

type RGB = [number, number, number];

// Returns the non-transparent pixel colors in a (2r x 2r) region around (x, y).
async function colorsNear(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  r: number,
): Promise<RGB[]> {
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

const isDark = ([r, g, b]: RGB) => r < 100 && g < 100 && b < 100;
const isWhite = ([r, g, b]: RGB) => r > 240 && g > 240 && b > 240;
// SELECT_COLOR #4a90d9
const isHintBlue = ([r, g, b]: RGB) =>
  Math.abs(r - 74) < 25 && Math.abs(g - 144) < 25 && Math.abs(b - 217) < 25;

test('arrow endpoint hints, snaps to a box, and follows it when moved', async ({ page }) => {
  await page.goto('/');

  // Draw a box at (100,100)-(300,250).
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(300, 250, { steps: 5 });
  await page.mouse.up();

  // Draw an arrow from (420,320) ending just outside the box edge.
  await page.getByRole('button', { name: 'Arrow' }).click();
  await page.mouse.move(420, 320);
  await page.mouse.down();
  await page.mouse.move(312, 240, { steps: 5 });
  await page.waitForTimeout(100);

  // While dragging, the snap hint highlights the target near the edge point.
  expect((await colorsNear(page, 300, 240, 8)).some(isHintBlue)).toBe(true);

  await page.mouse.up();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('2');

  // Select the arrow: its endpoint handle sits exactly on the snapped point
  // (300,240) — white handle fill there proves the endpoint snapped to the edge.
  await page.getByRole('button', { name: 'Select' }).click();
  await page.mouse.click(360, 280);
  await page.waitForTimeout(50);
  expect((await colorsNear(page, 300, 240, 1)).some(isWhite)).toBe(true);

  // Nothing drawn at (360,330) yet.
  expect((await colorsNear(page, 360, 330, 3)).some(isDark)).toBe(false);

  // Drag the box down by 100px; the bound arrow endpoint must follow,
  // so the arrow segment now passes through (360,330).
  await page.mouse.move(200, 175);
  await page.mouse.down();
  await page.mouse.move(200, 275, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  expect((await colorsNear(page, 360, 330, 3)).some(isDark)).toBe(true);
});
