/// <reference types="node" />
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { colorsNear, drawShape, elementCount, isDark } from './helpers';

// Scale bar geometry: drawn in screen space at x = 16, y = viewport 720 - 72.
const BAR_Y = 720 - 72;

// Places a 200px dimension line with two clicks (snap lands both anchors on
// the 20px grid, so the measured length is exactly 200 canvas px).
async function drawDimension(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Dim' }).click();
  await page.mouse.click(100, 300);
  await page.waitForTimeout(50);
  await page.mouse.click(300, 300);
  await expect(elementCount(page)).toHaveText('1');
}

test('unit selector offers all six unit types', async ({ page }) => {
  await page.goto('/');
  const select = page.getByTestId('unit-select');
  await expect(select).toHaveValue('px');
  const values = await select
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(['px', 'mm', 'cm', 'm', 'in', 'ft']);
});

test('dimension labels show converted real-world values', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('unit-select').selectOption('mm');
  await page.getByTestId('scale-input').fill('0.5');
  await drawDimension(page);

  // The SVG export carries the dimension label text: 200 px at 0.5 mm/px.
  await page.getByTestId('export-button').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-svg').click(),
  ]);
  const svg = readFileSync(await download.path(), 'utf8');
  expect(svg).toContain('100.0 mm');
});

test('scale bar is visible in the bottom-left corner', async ({ page }) => {
  await page.goto('/');
  // Default unit px, zoom 1: the bar spans 100px from x = 16 to x = 116.
  expect((await colorsNear(page, 60, BAR_Y, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 115, BAR_Y, 2)).some(isDark)).toBe(true);
  // The bar ends before x = 140: only the white knockout remains there.
  expect((await colorsNear(page, 140, BAR_Y, 2)).some(isDark)).toBe(false);
});

test('scale bar length follows the pixel-to-unit scale', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('unit-select').selectOption('mm');
  // 4 mm/px: the nice reference length becomes 200 mm = a 50px screen bar.
  await page.getByTestId('scale-input').fill('4');
  expect((await colorsNear(page, 64, BAR_Y, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 100, BAR_Y, 2)).some(isDark)).toBe(false);
});

test('unit and scale persist in localStorage across reloads', async ({ page }) => {
  await page.goto('/');
  // Auto-save only writes while the drawing has elements.
  await drawShape(page, 'Rect', 200, 200, 360, 300);
  await page.getByTestId('unit-select').selectOption('mm');
  await page.getByTestId('scale-input').fill('0.5');

  // Auto-save is debounced; poll until the settings land in localStorage.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('techdraw-project');
        const saved = raw ? (JSON.parse(raw) as { unit?: string; scale?: number }) : null;
        return saved ? `${saved.unit}:${saved.scale}` : null;
      }),
    )
    .toBe('mm:0.5');

  await page.reload();
  await expect(page.getByTestId('unit-select')).toHaveValue('mm');
  await expect(page.getByTestId('scale-input')).toHaveValue('0.5');
});

test('unit and scale round-trip through .tdraw files', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 100, 100, 300, 260);
  await page.getByTestId('unit-select').selectOption('in');
  await page.getByTestId('scale-input').fill('0.25');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-project').click(),
  ]);
  const data = JSON.parse(readFileSync(await download.path(), 'utf8')) as {
    unit?: string;
    scale?: number;
  };
  expect(data.unit).toBe('in');
  expect(data.scale).toBe(0.25);

  // Reset, then open the saved file and check the settings come back.
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('new-drawing').click();
  await expect(elementCount(page)).toHaveText('0');

  await page.getByTestId('open-project-input').setInputFiles({
    name: 'units.tdraw',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data), 'utf8'),
  });
  await expect(page.getByTestId('unit-select')).toHaveValue('in');
  await expect(page.getByTestId('scale-input')).toHaveValue('0.25');
});

test('invalid scale input is rejected and reverted', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('unit-select').selectOption('mm');
  const input = page.getByTestId('scale-input');
  await input.fill('2');
  await input.fill('');
  // Blur commits nothing and restores the last valid value.
  await page.mouse.click(600, 400);
  await expect(input).toHaveValue('2');
});
