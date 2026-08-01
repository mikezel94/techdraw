import { test, expect } from '@playwright/test';

test('standalone text: click with text tool, type, and commit', async ({ page }) => {
  await page.goto('/');

  // Select the Text tool
  await page.getByRole('button', { name: 'Text' }).click();

  // Click on the canvas to place text
  await page.mouse.click(300, 300);
  await page.waitForTimeout(100);

  // A textarea should appear — verify it exists and is focused
  const textarea = page.locator('textarea.text-input');
  await expect(textarea).toBeVisible({ timeout: 2000 });
  await expect(textarea).toBeFocused();

  // Type and commit
  await textarea.fill('Hello World');
  await textarea.press('Enter');
  await page.waitForTimeout(100);

  // Textarea should be gone
  await expect(textarea).not.toBeVisible();

  // Element count should be 1
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('1');

  // Verify ink (rendered text) exists near (300, 300)
  const hasInk = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const dpr = window.devicePixelRatio || 1;
    const x = Math.round(290 * dpr);
    const y = Math.round(295 * dpr);
    const size = Math.round(200 * dpr);
    const data = ctx.getImageData(x, y, size, Math.round(30 * dpr)).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasInk).toBe(true);
});

test('shape label: double-click a rect to add text inside it', async ({ page }) => {
  await page.goto('/');

  // Draw a rectangle
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(300, 250, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('1');

  // Switch to select tool
  await page.getByRole('button', { name: 'Select' }).click();
  await page.waitForTimeout(50);

  // Double-click inside the rect to edit its label
  await page.mouse.dblclick(200, 175);
  await page.waitForTimeout(100);

  // A centered textarea should appear
  const textarea = page.locator('textarea.text-input');
  await expect(textarea).toBeVisible({ timeout: 2000 });
  await expect(textarea).toBeFocused();

  // Type a label and commit
  await textarea.fill('My Box');
  await textarea.press('Enter');
  await page.waitForTimeout(100);

  // Textarea gone, element count unchanged (label is on the shape, not a new element)
  await expect(textarea).not.toBeVisible();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('1');

  // Verify text was rendered inside the rect (dark pixels near center)
  const hasLabel = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const dpr = window.devicePixelRatio || 1;
    const cx = Math.round(200 * dpr);
    const cy = Math.round(175 * dpr);
    const r = Math.round(40 * dpr);
    const data = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100 && data[i + 3] > 128) return true;
    }
    return false;
  });
  expect(hasLabel).toBe(true);
});

test('text tool: click on a rect to add a label directly', async ({ page }) => {
  await page.goto('/');

  // Draw a rectangle
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(300, 250, { steps: 5 });
  await page.mouse.up();

  // Switch to text tool and click on the rect
  await page.getByRole('button', { name: 'Text' }).click();
  await page.mouse.click(200, 175);
  await page.waitForTimeout(100);

  // A centered textarea should appear (shape label mode)
  const textarea = page.locator('textarea.text-input');
  await expect(textarea).toBeVisible({ timeout: 2000 });
  await expect(textarea).toBeFocused();

  // Type and commit
  await textarea.fill('Label');
  await textarea.press('Enter');
  await page.waitForTimeout(100);

  await expect(textarea).not.toBeVisible();
  // Still 1 element (label is stored on the rect)
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('1');
});
