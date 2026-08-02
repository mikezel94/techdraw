import { test, expect } from '@playwright/test';
import { colorsNear, isDark, drawShape, elementCount } from './helpers';

// A free arrow (100,420)-(320,420) gets the default gentle bow, whose apex
// (and bend handle) sits near (210,436). Dragging the handle to (210,340)
// sets bend = -80, so the shaft passes exactly through (210,340).

test('dragging the midpoint handle flexes a selected arrow', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Arrow', 100, 420, 320, 420);
  await expect(elementCount(page)).toHaveText('1');

  // Grab the circular bend handle at the shaft apex and pull it upward.
  await page.mouse.move(210, 436);
  await page.mouse.down();
  await page.mouse.move(210, 340, { steps: 5 });
  await page.mouse.up();

  // Deselect so the white handle fills stop covering the shaft ink.
  await page.mouse.click(500, 500);

  // The shaft now passes through the dragged apex...
  expect((await colorsNear(page, 210, 340, 3)).some(isDark)).toBe(true);
  // ...and left the default-bow position.
  expect((await colorsNear(page, 210, 437, 3)).some(isDark)).toBe(false);
  // Endpoints stay anchored (start cap, and the head near the end).
  expect((await colorsNear(page, 100, 420, 3)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 312, 412, 3)).some(isDark)).toBe(true);
});

test('double-clicking a bent arrow releases the bend', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Arrow', 100, 420, 320, 420);

  // Flex it upward first.
  await page.mouse.move(210, 436);
  await page.mouse.down();
  await page.mouse.move(210, 340, { steps: 5 });
  await page.mouse.up();
  // Shaft ink away from the handle proves the bend took effect: the bent
  // curve passes through (155,360) on its way up to the (210,340) apex.
  expect((await colorsNear(page, 155, 360, 2)).some(isDark)).toBe(true);

  // Double-click the shaft: the bend is released back to the default curve.
  await page.mouse.dblclick(155, 360);
  await page.mouse.click(500, 500);

  // Default bow restored: ink back near the original apex...
  expect((await colorsNear(page, 210, 437, 3)).some(isDark)).toBe(true);
  // ...and gone from the dragged position.
  expect((await colorsNear(page, 210, 340, 3)).some(isDark)).toBe(false);
});
