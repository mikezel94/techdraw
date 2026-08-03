import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  colorsNear,
  elementCount,
  firstDarkX,
  isDark,
  touchDrag,
  touchPan,
  touchPinch,
} from './helpers';

const PHONE = { width: 375, height: 667 };

test.use({
  viewport: PHONE,
  hasTouch: true,
});

async function dismissNotice(page: Page): Promise<void> {
  await page.getByTestId('mobile-notice-try-anyway').click();
  await expect(page.getByTestId('mobile-notice')).toBeHidden();
}

test('small screens see the desktop notice on first load', async ({ page }) => {
  await page.goto('/');

  const notice = page.getByTestId('mobile-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('TechDraw works best on desktop');
  await expect(notice).toContainText('a computer with a mouse/trackpad');

  await dismissNotice(page);
  const flag = await page.evaluate(() =>
    localStorage.getItem('techdraw-mobile-notice-dismissed'),
  );
  expect(flag).not.toBeNull();

  await page.reload();
  await expect(notice).toBeHidden();
});

test('the notice does not appear on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByTestId('mobile-notice')).toHaveCount(0);
});

test('single-finger touch draws with the active tool', async ({ page }) => {
  await page.goto('/');
  await dismissNotice(page);

  await page.getByTestId('tool-rectangle').tap();
  await touchDrag(page, 80, 200, 280, 340);

  await expect(elementCount(page)).toHaveText('1');
  // The rectangle's top edge (y=200) leaves dark stroke pixels on the canvas.
  const colors = await colorsNear(page, 180, 200, 2);
  expect(colors.some(isDark)).toBe(true);
});

test('two-finger pinch zooms the canvas', async ({ page }) => {
  await page.goto('/');
  await dismissNotice(page);
  await page.getByTestId('tool-select').tap();

  const zoomLevel = page.locator('.zoom-level');
  await expect(zoomLevel).toHaveText('100%');

  await touchPinch(page, 187, 300, 100, 220);
  const zoomedOut = parseInt((await zoomLevel.textContent()) ?? '', 10);
  expect(zoomedOut).toBeGreaterThanOrEqual(180);

  // Pinching back inward returns to (roughly) the original zoom.
  await touchPinch(page, 187, 300, 220, 100);
  const zoomedBack = parseInt((await zoomLevel.textContent()) ?? '', 10);
  expect(zoomedBack).toBeGreaterThanOrEqual(90);
  expect(zoomedBack).toBeLessThanOrEqual(110);
});

test('two-finger pan moves the canvas without zooming', async ({ page }) => {
  await page.goto('/');
  await dismissNotice(page);

  // Draw a box so the pan has something to move on screen.
  await page.getByTestId('tool-rectangle').tap();
  await touchDrag(page, 80, 200, 280, 340);
  await expect(elementCount(page)).toHaveText('1');

  const beforeX = await firstDarkX(page, 270, 0, 375);
  expect(beforeX).toBeGreaterThanOrEqual(78);
  expect(beforeX).toBeLessThanOrEqual(82);

  await touchPan(page, 150, 450, 250, 450, 60, 0);

  const afterX = await firstDarkX(page, 270, 0, 375);
  expect(afterX).toBeGreaterThanOrEqual(beforeX + 55);
  expect(afterX).toBeLessThanOrEqual(beforeX + 65);
  await expect(page.locator('.zoom-level')).toHaveText('100%');
});

test('toolbar docks to the bottom and fits a 375px screen', async ({ page }) => {
  await page.goto('/');
  await dismissNotice(page);

  const toolbar = page.locator('.toolbar');
  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox).not.toBeNull();
  // Bottom-sheet: the toolbar sits in the lower half, flush with the bottom.
  expect(toolbarBox!.y).toBeGreaterThan(PHONE.height / 2);
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(PHONE.height + 1);

  // Tools stay tappable from the sheet.
  await page.getByTestId('tool-pencil').tap();
  await expect(page.getByTestId('tool-pencil')).toHaveClass(/active/);
});

test('all touch targets meet the 44px minimum', async ({ page }) => {
  await page.goto('/');
  await dismissNotice(page);

  for (const selector of ['.toolbar button', '.zoom-controls button', '.grid-controls button']) {
    const buttons = page.locator(selector);
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box, `target ${selector}[${i}] has no box`).not.toBeNull();
      expect(box!.width, `target ${selector}[${i}] too narrow`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `target ${selector}[${i}] too short`).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    }
  }
});
