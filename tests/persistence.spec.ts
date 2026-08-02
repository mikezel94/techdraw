import { test, expect } from '@playwright/test';
import { drawShape, elementCount } from './helpers';

test('drawing survives a page refresh via auto-save', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 200, 200, 360, 300);
  await expect(elementCount(page)).toHaveText('1');

  // Debounced auto-save flashes the indicator within ~1s of the edit.
  const indicator = page.locator('[data-testid="save-indicator"]');
  await expect(indicator).toHaveClass(/visible/);

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('techdraw-project');
    return raw ? (JSON.parse(raw) as { version: number; elements: unknown[] }) : null;
  });
  expect(saved?.version).toBe(1);
  expect(saved?.elements).toHaveLength(1);

  await page.reload();

  await expect(elementCount(page)).toHaveText('1');
  const toast = page.locator('[data-testid="restore-toast"]');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Restored your drawing from');

  // Toast is dismissible.
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toBeHidden();
});

test('New Drawing clears the canvas and the saved copy after confirmation', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 200, 200, 360, 300);
  await expect(page.locator('[data-testid="save-indicator"]')).toHaveClass(/visible/);

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('new-drawing').click();

  await expect(elementCount(page)).toHaveText('0');
  const stored = await page.evaluate(() => localStorage.getItem('techdraw-project'));
  expect(stored).toBeNull();

  // Nothing to restore on reload, and no spurious toast.
  await page.reload();
  await expect(elementCount(page)).toHaveText('0');
  await expect(page.locator('[data-testid="restore-toast"]')).toBeHidden();
});

test('declining the New Drawing confirmation keeps the drawing', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 200, 200, 360, 300);
  await expect(elementCount(page)).toHaveText('1');

  page.on('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId('new-drawing').click();

  await expect(elementCount(page)).toHaveText('1');
});
