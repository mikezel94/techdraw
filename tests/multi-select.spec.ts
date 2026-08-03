import { test, expect } from '@playwright/test';
import { colorsNear, isDark, drawShape, elementCount } from './helpers';

test('marquee selects a box it only partially overlaps', async ({ page }) => {
  await page.goto('/');

  // Box spans (100,100)-(200,180).
  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await expect(elementCount(page)).toHaveText('1');

  // Marquee (50,50)-(150,150) intersects the box but does not enclose it.
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(150, 150, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
});

test('copy and paste duplicates a box with an offset', async ({ page }) => {
  await page.goto('/');

  // Box (100,100)-(200,180); auto-selected after drawing.
  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await expect(elementCount(page)).toHaveText('1');

  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(elementCount(page)).toHaveText('2');
  await page.waitForTimeout(50);

  // The pasted box is offset +20px: its right edge sits at x=220, beyond the
  // original's right edge at x=200.
  expect((await colorsNear(page, 220, 150, 2)).some(isDark)).toBe(true);
});

test('duplicate creates a copy of the current selection', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await expect(elementCount(page)).toHaveText('1');

  await page.keyboard.press('ControlOrMeta+D');
  await expect(elementCount(page)).toHaveText('2');
});

test('paste is undoable', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(elementCount(page)).toHaveText('2');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(elementCount(page)).toHaveText('1');
});

test('grouped boxes select together', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await drawShape(page, 'Rect', 300, 100, 400, 180);
  await expect(elementCount(page)).toHaveText('2');

  // Marquee-select both, then group them.
  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(460, 240, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+G');

  // Deselect, then click just the first box: the group comes along.
  await page.mouse.click(500, 300);
  await page.mouse.click(150, 140);
  await page.waitForTimeout(50);

  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
});

test('grouped boxes move together', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 160, 160);
  await drawShape(page, 'Rect', 400, 100, 460, 160);
  await expect(elementCount(page)).toHaveText('2');

  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(520, 240, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+G');
  await page.waitForTimeout(50);

  // Drag the first box +200px; the second box must follow.
  await page.mouse.move(130, 130);
  await page.mouse.down();
  await page.mouse.move(330, 130, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  // Second box moved from x=400..460 to x=600..660.
  expect((await colorsNear(page, 600, 130, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 400, 130, 2)).some(isDark)).toBe(false);
});

test('ungroup lets boxes be selected individually again', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await drawShape(page, 'Rect', 300, 100, 400, 180);
  await expect(elementCount(page)).toHaveText('2');

  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(460, 240, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+G');
  await page.keyboard.press('ControlOrMeta+Shift+G');

  // After ungrouping, clicking one box selects only it.
  await page.mouse.click(500, 300);
  await page.mouse.click(150, 140);
  await page.waitForTimeout(50);

  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('1');
});
