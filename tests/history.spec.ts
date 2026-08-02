import { test, expect } from '@playwright/test';
import { drawShape, elementCount } from './helpers';

test('undo and redo via keyboard restore element state', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 260, 200);
  await expect(elementCount(page)).toHaveText('1');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(elementCount(page)).toHaveText('0');

  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(elementCount(page)).toHaveText('1');
});

test('undo and redo via toolbar buttons', async ({ page }) => {
  await page.goto('/');

  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await drawShape(page, 'Rect', 100, 100, 260, 200);
  await expect(elementCount(page)).toHaveText('1');
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(elementCount(page)).toHaveText('0');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(elementCount(page)).toHaveText('1');
});

test('Delete removes the selected element', async ({ page }) => {
  await page.goto('/');

  // A freshly drawn shape is auto-selected.
  await drawShape(page, 'Rect', 100, 100, 260, 200);
  await expect(elementCount(page)).toHaveText('1');

  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
});

test('select-all then delete clears the canvas', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 200, 180);
  await drawShape(page, 'Ellipse', 300, 100, 420, 200);
  await expect(elementCount(page)).toHaveText('2');

  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
});
