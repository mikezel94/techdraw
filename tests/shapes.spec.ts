import { test, expect } from '@playwright/test';
import { colorsNear, isDark, drawShape, elementCount } from './helpers';

test('ellipse tool draws a curved shape (ink on the edge, none at the corner)', async ({ page }) => {
  await page.goto('/');

  // Bounding box (100,100)-(300,260): cx=200 cy=180 rx=100 ry=80.
  await drawShape(page, 'Ellipse', 100, 100, 300, 260);
  await expect(elementCount(page)).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Select' })).toHaveClass(/active/);

  // The curve passes through the top and left midpoints...
  expect((await colorsNear(page, 200, 100, 3)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 100, 180, 3)).some(isDark)).toBe(true);
  // ...but not the bounding-box corner, which a rectangle would stroke.
  expect((await colorsNear(page, 112, 112, 4)).some(isDark)).toBe(false);
});

test('line tool draws a straight segment', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Line', 100, 300, 320, 300);
  await expect(elementCount(page)).toHaveText('1');

  // Ink along the horizontal segment...
  expect((await colorsNear(page, 160, 300, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 260, 300, 2)).some(isDark)).toBe(true);
  // ...and nothing off it.
  expect((await colorsNear(page, 210, 260, 3)).some(isDark)).toBe(false);
});

test('arrow tool draws a free (unbound) arrow with a filled head', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Arrow', 100, 420, 320, 420);
  await expect(elementCount(page)).toHaveText('1');

  // Shaft ink — probed off the curve midpoint, which the white bend handle
  // covers while the arrow is selected...
  expect((await colorsNear(page, 155, 432, 2)).some(isDark)).toBe(true);
  // ...and a filled arrowhead near the end point.
  expect((await colorsNear(page, 312, 420, 4)).some(isDark)).toBe(true);
});
