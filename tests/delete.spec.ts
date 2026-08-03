import { test, expect } from '@playwright/test';
import { colorsNear, drawShape, elementCount, isDark } from './helpers';

test('Delete and Backspace remove the selected element; undo restores it', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 220, 180);
  await expect(elementCount(page)).toHaveText('1');

  // The new shape is auto-selected, so Delete removes it and hides the palette.
  await page.keyboard.press('Delete');
  await expect(elementCount(page)).toHaveText('0');
  await expect(page.getByTestId('color-palette')).toHaveCount(0);

  // Deletion is undoable.
  await page.keyboard.press('Control+Z');
  await expect(elementCount(page)).toHaveText('1');

  // Backspace works too. Re-select first: undo clears the selection.
  await page.mouse.click(160, 140);
  await page.keyboard.press('Backspace');
  await expect(elementCount(page)).toHaveText('0');
});

test('Delete does not fire while typing in a text field', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 300, 250);

  // Double-click the selected box to edit its label; the box stays selected
  // while the textarea is open, so an unguarded Delete would remove it.
  await page.getByRole('button', { name: 'Select' }).click();
  await page.mouse.dblclick(200, 175);
  const textarea = page.locator('textarea.text-input');
  await expect(textarea).toBeFocused({ timeout: 2000 });

  await page.keyboard.type('Box');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await textarea.press('Enter');

  await expect(elementCount(page)).toHaveText('1');
});

test('trash button in the palette deletes the selection and undo restores it', async ({
  page,
}) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 220, 180);
  const del = page.getByTestId('delete-selection');
  await expect(del).toBeVisible();

  await del.click();
  await expect(elementCount(page)).toHaveText('0');

  await page.keyboard.press('Control+Z');
  await expect(elementCount(page)).toHaveText('1');
});

test('trash button appears for non-shape selections too', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Line', 100, 100, 250, 200);
  await expect(page.getByTestId('color-palette')).toBeVisible();

  await page.getByTestId('delete-selection').click();
  await expect(elementCount(page)).toHaveText('0');
});

test('deleting a shape removes dimensions bound to it', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 300, 200);

  // Both anchors land on the box, so both bind to it.
  await page.getByRole('button', { name: 'Dim' }).click();
  await page.mouse.click(120, 200);
  await page.waitForTimeout(50);
  await page.mouse.click(280, 200);
  await expect(elementCount(page)).toHaveText('2');

  await page.getByRole('button', { name: 'Select' }).click();
  await page.mouse.click(200, 150);
  await page.keyboard.press('Delete');

  // The box and its dependent dimension are both gone.
  await expect(elementCount(page)).toHaveText('0');
});

test('deleting a shape detaches bound arrows instead of deleting them', async ({ page }) => {
  await page.goto('/');

  await drawShape(page, 'Rect', 100, 100, 300, 250);
  // Arrow end snaps to the box edge and binds to it.
  await drawShape(page, 'Arrow', 420, 320, 312, 240);
  await expect(elementCount(page)).toHaveText('2');

  await page.getByRole('button', { name: 'Select' }).click();
  await page.mouse.click(200, 175);
  await page.keyboard.press('Delete');

  // Only the box is gone; the arrow survives, unbound — its filled head still
  // renders at the snapped endpoint (300,240).
  await expect(elementCount(page)).toHaveText('1');
  await page.waitForTimeout(50);
  expect((await colorsNear(page, 305, 240, 4)).some(isDark)).toBe(true);
});

test('deleting more than 10 elements asks for confirmation', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 11; i++) {
    await drawShape(page, 'Rect', 60 + i * 50, 100, 90 + i * 50, 130);
  }
  await expect(elementCount(page)).toHaveText('11');

  await page.keyboard.press('Control+A');

  // Accepting the dialog deletes everything. The modal blocks the keypress
  // until dismissed, so await the dialog before the press settles.
  const dialogPromise = page.waitForEvent('dialog');
  const pressed = page.keyboard.press('Delete');
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('Delete 11 elements');
  await dialog.accept();
  await pressed;

  await expect(elementCount(page)).toHaveText('0');
});

test('dismissing the confirmation keeps the elements', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 11; i++) {
    await drawShape(page, 'Rect', 60 + i * 50, 100, 90 + i * 50, 130);
  }
  await expect(elementCount(page)).toHaveText('11');

  await page.keyboard.press('Control+A');
  page.on('dialog', (dialog) => void dialog.dismiss());
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);

  await expect(elementCount(page)).toHaveText('11');
});
