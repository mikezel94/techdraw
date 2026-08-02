/// <reference types="node" />
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { drawShape, elementCount } from './helpers';

// Reads the IHDR width/height (big-endian) from a PNG buffer.
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('export button is disabled on an empty canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('export-button')).toBeDisabled();
});

test('exports a cropped, scaled PNG of the drawing', async ({ page }) => {
  await page.goto('/');
  // Rect (100,100)-(300,260): 200x160 world units.
  await drawShape(page, 'Rect', 100, 100, 300, 260);
  await expect(elementCount(page)).toHaveText('1');

  await page.getByTestId('export-button').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-png-2x').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^techdraw-\d{8}-\d{6}\.png$/);
  const buf = readFileSync(await download.path());
  // Content bbox (200x160) + 24px padding each side = 248x208, at 2x scale.
  expect(pngSize(buf)).toEqual({ width: 496, height: 416 });
});

test('exports an SVG containing the drawing primitives', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 100, 100, 300, 260);
  await drawShape(page, 'Arrow', 320, 180, 480, 180);
  await expect(elementCount(page)).toHaveText('2');

  await page.getByTestId('export-button').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-svg').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^techdraw-\d{8}-\d{6}\.svg$/);
  const svg = readFileSync(await download.path(), 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('viewBox=');
  expect(svg).toContain('<rect');
  expect(svg).toContain('<path');
  expect(svg).toContain('<polygon');
});
