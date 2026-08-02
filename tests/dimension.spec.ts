import { test, expect } from '@playwright/test';
import { colorsNear, isRed, elementCount } from './helpers';

test('dimension tool: two clicks create a measurement annotation', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Dim' }).click();

  // First click sets the start anchor (snapped to the grid); nothing commits yet.
  await page.mouse.click(100, 300);
  await page.waitForTimeout(50);
  await expect(elementCount(page)).toHaveText('0');

  // Second click sets the end anchor and commits the dimension.
  await page.mouse.click(300, 300);
  await expect(elementCount(page)).toHaveText('1');
  await page.waitForTimeout(50);

  // The dimension line renders in red, offset 30px below the measured points
  // (y = 330), with a distance label between the arrowheads...
  expect((await colorsNear(page, 150, 330, 3)).some(isRed)).toBe(true);
  expect((await colorsNear(page, 250, 330, 3)).some(isRed)).toBe(true);
  // ...and an extension line dropping down from the first anchor at x = 100.
  expect((await colorsNear(page, 100, 315, 3)).some(isRed)).toBe(true);
});
