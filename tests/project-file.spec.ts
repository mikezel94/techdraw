/// <reference types="node" />
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { colorsNear, countGridPixels, drawShape, elementCount, isRed } from './helpers';

interface SavedFile {
  format: string;
  version: number;
  title: string;
  createdAt: string;
  modifiedAt: string;
  appVersion: string;
  elements: unknown[];
  camera: { x: number; y: number; zoom: number };
  gridEnabled: boolean;
  snapEnabled: boolean;
}

// Clicks Save and returns the parsed contents of the downloaded `.tdraw` file.
async function saveAndRead(page: Page): Promise<{ name: string; data: SavedFile }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-project').click(),
  ]);
  const name = download.suggestedFilename();
  const data = JSON.parse(readFileSync(await download.path(), 'utf8')) as SavedFile;
  return { name, data };
}

// Feeds a `.tdraw` payload to the hidden Open file input.
async function openBuffer(page: Page, name: string, json: string): Promise<void> {
  await page.getByTestId('open-project-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(json, 'utf8'),
  });
}

test('save downloads a .tdraw file with the full project state', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 100, 100, 300, 260);
  // Give the box a red stroke so we can confirm properties serialize.
  await page.locator('[data-color="#dc2626"]').click();
  await expect(elementCount(page)).toHaveText('1');

  const { name, data } = await saveAndRead(page);

  expect(name).toMatch(/\.tdraw$/);
  expect(data.format).toBe('techdraw');
  expect(data.version).toBe(1);
  expect(typeof data.title).toBe('string');
  expect(typeof data.appVersion).toBe('string');
  expect(data.elements).toHaveLength(1);
  expect(data.camera.zoom).toBe(1);
  expect(typeof data.gridEnabled).toBe('boolean');
  expect(typeof data.snapEnabled).toBe('boolean');
  const rect = data.elements[0] as { type: string; color?: string };
  expect(rect.type).toBe('rect');
  expect(rect.color).toBe('#dc2626');
});

test('open restores the drawing, viewport, and grid settings', async ({ page }) => {
  await page.goto('/');
  // World rect (50,50)-(150,130) at zoom 2 lands at screen (100,100)-(300,260).
  const project = {
    format: 'techdraw',
    version: 1,
    title: 'Restored',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    appVersion: '0.0.0',
    elements: [
      { id: 'r1', type: 'rect', x: 50, y: 50, width: 100, height: 80, color: '#dc2626' },
    ],
    camera: { x: 0, y: 0, zoom: 2 },
    gridEnabled: false,
    snapEnabled: false,
  };

  await openBuffer(page, 'restored.tdraw', JSON.stringify(project));

  await expect(elementCount(page)).toHaveText('1');
  // Red stroke at the zoomed screen position proves elements + viewport loaded.
  expect((await colorsNear(page, 100, 100, 3)).some(isRed)).toBe(true);
  // Grid toggle was restored to off: no grid pixels in an empty region.
  expect(await countGridPixels(page, 400, 100, 500, 200)).toBe(0);
  // No error toast on a valid file.
  await expect(page.getByTestId('file-error')).toHaveCount(0);
});

test('drag-and-drop of a .tdraw file onto the canvas opens it', async ({ page }) => {
  await page.goto('/');
  const project = {
    format: 'techdraw',
    version: 1,
    title: 'Dropped',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    appVersion: '0.0.0',
    elements: [
      { id: 'r1', type: 'rect', x: 100, y: 100, width: 200, height: 160 },
      { id: 'r2', type: 'rect', x: 400, y: 100, width: 200, height: 160 },
    ],
    camera: { x: 0, y: 0, zoom: 1 },
    gridEnabled: true,
    snapEnabled: true,
  };

  await page.evaluate((json) => {
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'dropped.tdraw', { type: 'application/json' }));
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
  }, JSON.stringify(project));

  await expect(elementCount(page)).toHaveText('2');
  await expect(page.getByTestId('file-error')).toHaveCount(0);
});

test('invalid files show a clear error and leave the drawing untouched', async ({ page }) => {
  await page.goto('/');
  await drawShape(page, 'Rect', 100, 100, 300, 260);
  await expect(elementCount(page)).toHaveText('1');

  // Not JSON at all.
  await openBuffer(page, 'bad.tdraw', 'this is not json');
  const toast = page.getByTestId('file-error');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('not valid JSON');
  await expect(elementCount(page)).toHaveText('1');

  // Dismiss, then try a wrong schema version.
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);

  await openBuffer(
    page,
    'future.tdraw',
    JSON.stringify({ format: 'techdraw', version: 99, elements: [], camera: { x: 0, y: 0, zoom: 1 } }),
  );
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Unsupported file version');
  await expect(elementCount(page)).toHaveText('1');
});

test('dropping a non-.tdraw file reports an error', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  const toast = page.getByTestId('file-error');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('not a .tdraw project file');
});

test('save → open → save round-trips every element and setting losslessly', async ({ page }) => {
  await page.goto('/');
  // Two boxes with color + fill + label, joined by a bound arrow.
  await drawShape(page, 'Rect', 100, 100, 260, 220);
  await page.locator('[data-color="#dc2626"]').click();
  await page.locator('[data-fill="#2563eb"]').click();
  await page.mouse.dblclick(180, 160);
  const input = page.locator('textarea.text-input');
  await input.fill('pump');
  await input.press('Enter');

  await drawShape(page, 'Rect', 400, 100, 560, 220);
  await drawShape(page, 'Arrow', 260, 160, 400, 160);
  await expect(elementCount(page)).toHaveText('3');

  const first = await saveAndRead(page);

  // Reopen the saved file over a fresh state, then save again.
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('new-drawing').click();
  await expect(elementCount(page)).toHaveText('0');

  await openBuffer(page, first.name, JSON.stringify(first.data));
  await expect(elementCount(page)).toHaveText('3');

  const second = await saveAndRead(page);

  // Full fidelity: elements, viewport, and grid settings survive the round-trip.
  expect(second.data.elements).toEqual(first.data.elements);
  expect(second.data.camera).toEqual(first.data.camera);
  expect(second.data.gridEnabled).toBe(first.data.gridEnabled);
  expect(second.data.snapEnabled).toBe(first.data.snapEnabled);
});
