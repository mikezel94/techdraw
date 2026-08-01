import { test, expect } from '@playwright/test';

test('pencil stroke is committed to the scene and rendered', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Default tool is pencil: drag a stroke from (200,200) to (400,300).
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(240, 215);
  await page.mouse.move(280, 235);
  await page.mouse.move(320, 255);
  await page.mouse.move(360, 278);
  await page.mouse.move(400, 300);
  await page.mouse.up();

  await expect(page.locator('[data-testid="element-count"]')).toHaveText('1');

  const hasInk = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasInk).toBe(true);
});
