import { test, expect } from '@playwright/test';
import { colorsNear, isDark, drawShape, elementCount } from './helpers';

test('dragging a selected box moves it', async ({ page }) => {
  await page.goto('/');

  // Box (100,100)-(260,200); left edge at x=100.
  await drawShape(page, 'Rect', 100, 100, 260, 200);
  await expect(elementCount(page)).toHaveText('1');
  expect((await colorsNear(page, 100, 150, 2)).some(isDark)).toBe(true);

  // Drag the box +200px to the right (world == screen at zoom 1).
  await page.mouse.move(180, 150);
  await page.mouse.down();
  await page.mouse.move(380, 150, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  // Left edge is now at x=300 and the old position is empty.
  expect((await colorsNear(page, 300, 150, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 100, 150, 2)).some(isDark)).toBe(false);
});

test('marquee drag selects every box it encloses', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await drawShape(page, 'Rect', 300, 100, 400, 180);
  await expect(elementCount(page)).toHaveText('2');

  // Drag a marquee from empty canvas enclosing both boxes.
  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(460, 240, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  // Both selected -> Delete clears both.
  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
});

test('shift-click adds a box to the selection', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await drawShape(page, 'Rect', 300, 100, 400, 180);
  await expect(elementCount(page)).toHaveText('2');

  // Only the second box is selected now; shift-click the first to add it.
  await page.keyboard.down('Shift');
  await page.mouse.click(150, 140);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(50);

  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
});
