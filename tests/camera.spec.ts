import { test, expect } from '@playwright/test';
import {
  colorsNear,
  isDark,
  drawShape,
  countGridPixels,
  firstDarkX,
  elementCount,
} from './helpers';

test('zoom controls and keyboard shortcuts change the zoom level', async ({ page }) => {
  await page.goto('/');

  const level = page.locator('.zoom-level');
  await expect(level).toHaveText('100%');

  // Bottom-left zoom controls: zoom in.
  await page.locator('.zoom-controls button', { hasText: '+' }).click();
  await expect(level).toHaveText('125%');

  // Keyboard: '-' out, '=' in, '0' reset.
  await page.keyboard.press('-');
  await expect(level).toHaveText('100%');
  await page.keyboard.press('=');
  await expect(level).toHaveText('125%');
  await page.keyboard.press('0');
  await expect(level).toHaveText('100%');
});

test('mouse wheel zooms the canvas in', async ({ page }) => {
  await page.goto('/');

  const level = page.locator('.zoom-level');
  await expect(level).toHaveText('100%');

  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -100);
  await expect(level).toHaveText('120%');
});

test('middle-mouse drag pans the canvas', async ({ page }) => {
  await page.goto('/');

  // Box (100,100)-(200,180); left edge at x=100.
  await drawShape(page, 'Rect', 100, 100, 200, 180);
  expect((await colorsNear(page, 100, 140, 2)).some(isDark)).toBe(true);

  // Pan right by 100px with a middle-mouse drag on empty canvas.
  await page.mouse.move(500, 400);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(600, 400, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(50);

  // The whole scene shifted right: left edge now at x=200, old spot empty.
  expect((await colorsNear(page, 200, 140, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 100, 140, 2)).some(isDark)).toBe(false);
});

test('grid toggle shows and hides the background grid', async ({ page }) => {
  await page.goto('/');

  // Empty region clear of any UI control.
  expect(await countGridPixels(page, 220, 320, 420, 460)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Grid' }).click();
  await page.waitForTimeout(50);
  expect(await countGridPixels(page, 220, 320, 420, 460)).toBe(0);

  await page.getByRole('button', { name: 'Grid' }).click();
  await page.waitForTimeout(50);
  expect(await countGridPixels(page, 220, 320, 420, 460)).toBeGreaterThan(0);
});

test('snap-to-grid aligns new shapes; disabling it frees placement', async ({ page }) => {
  await page.goto('/');

  // Snap ON (default): start x=110 rounds out to the 120 grid line.
  await drawShape(page, 'Rect', 110, 110, 250, 210);
  const snappedEdge = await firstDarkX(page, 170, 100, 150);

  // Clear it, then turn snapping off.
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(elementCount(page)).toHaveText('0');
  await page.getByRole('button', { name: 'Snap' }).click();

  // Snap OFF: the same gesture keeps the raw x=110 start.
  await drawShape(page, 'Rect', 110, 110, 250, 210);
  const rawEdge = await firstDarkX(page, 170, 100, 150);

  expect(snappedEdge).toBeGreaterThan(rawEdge);
  expect(snappedEdge - rawEdge).toBeGreaterThanOrEqual(5);
});
