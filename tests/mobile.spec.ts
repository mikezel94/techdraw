import { test, expect } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { drawShape, firstDarkX } from './helpers';

const PHONE_VIEWPORT = { width: 375, height: 667 };

// Multi-touch helpers: Playwright's touchscreen API is single-touch, so two
// concurrent fingers are dispatched through CDP. Chromium translates these into
// pointer events with pointerType "touch".
type TouchPoint = { x: number; y: number };

async function touchStart(client: CDPSession, points: TouchPoint[]): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
}

async function touchMove(client: CDPSession, points: TouchPoint[]): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
}

async function touchEnd(client: CDPSession, remaining: TouchPoint[] = []): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: remaining });
}

async function zoomPercent(page: Page): Promise<number> {
  const text = (await page.locator('.zoom-level').textContent()) ?? '';
  return parseInt(text, 10);
}

// Opens the bottom-sheet toolbar, picks a tool, and drags it out with the
// mouse (tools are one-shot, so the sheet closes itself after the pick).
async function drawShapeOnPhone(
  page: Page,
  toolName: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  await page.getByTestId('toolbar-toggle').click();
  await drawShape(page, toolName, x1, y1, x2, y2);
}

test.describe('small-screen notice', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('shows on first load and is dismissible', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('mobile-notice')).toBeVisible();
    await expect(page.getByText('TechDraw works best on desktop')).toBeVisible();
    await expect(
      page.getByText('For the full experience, please use a computer with a mouse/trackpad.'),
    ).toBeVisible();

    await page.getByTestId('mobile-notice-try-anyway').click();
    await expect(page.getByTestId('mobile-notice')).toBeHidden();
    const flag = await page.evaluate(() =>
      localStorage.getItem('techdraw-mobile-notice-dismissed'),
    );
    expect(flag).not.toBeNull();
  });

  test('stays dismissed after a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('mobile-notice')).toBeVisible();
    await page.getByTestId('mobile-notice-try-anyway').click();
    await expect(page.getByTestId('mobile-notice')).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('mobile-notice')).toHaveCount(0);
  });

  test('does not appear on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByTestId('mobile-notice')).toHaveCount(0);
  });
});

test.describe('touch gestures', () => {
  test.use({ viewport: PHONE_VIEWPORT, hasTouch: true });

  test('single-finger drag draws with the active tool', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mobile-notice-try-anyway').click();

    const client = await page.context().newCDPSession(page);
    // Default tool is pencil: one finger drags a stroke.
    await touchStart(client, [{ x: 120, y: 300 }]);
    for (let i = 1; i <= 4; i++) {
      await touchMove(client, [{ x: 120 + 35 * i, y: 300 + 15 * i }]);
      // Space the moves out so Chromium does not coalesce them into one.
      await page.waitForTimeout(20);
    }
    await touchEnd(client);

    await expect(page.locator('[data-testid="element-count"]')).toHaveText('1');
  });

  test('pinch-to-zoom changes the zoom level', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mobile-notice-try-anyway').click();
    expect(await zoomPercent(page)).toBe(100);

    const client = await page.context().newCDPSession(page);
    // Two fingers spread apart: distance triples, so zoom should climb.
    await touchStart(client, [
      { x: 150, y: 300 },
      { x: 225, y: 300 },
    ]);
    for (let i = 1; i <= 5; i++) {
      const spread = 15 * i;
      await touchMove(client, [
        { x: 150 - spread, y: 300 },
        { x: 225 + spread, y: 300 },
      ]);
      // Space the moves out so Chromium does not coalesce them into one.
      await page.waitForTimeout(20);
    }
    await touchEnd(client);

    expect(await zoomPercent(page)).toBeGreaterThan(150);
  });

  test('two-finger pan shifts the canvas content', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mobile-notice-try-anyway').click();

    await drawShapeOnPhone(page, 'Rect', 100, 140, 220, 260);
    const row = 200;
    const before = await firstDarkX(page, row, 0, 374);
    expect(before).toBeGreaterThan(0);

    const client = await page.context().newCDPSession(page);
    // Two fingers swipe 100px to the right.
    await touchStart(client, [
      { x: 120, y: 420 },
      { x: 240, y: 420 },
    ]);
    for (let i = 1; i <= 5; i++) {
      const dx = 20 * i;
      await touchMove(client, [
        { x: 120 + dx, y: 420 },
        { x: 240 + dx, y: 420 },
      ]);
      // Space the moves out so Chromium does not coalesce them into one.
      await page.waitForTimeout(20);
    }
    await touchEnd(client);

    const after = await firstDarkX(page, row, 0, 374);
    expect(after - before).toBeGreaterThanOrEqual(97);
    expect(after - before).toBeLessThanOrEqual(103);
  });
});

test.describe('toolbar at phone width', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('collapsed toolbar opens into a sheet with 44px targets', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mobile-notice-try-anyway').click();

    const toggle = page.getByTestId('toolbar-toggle');
    await expect(toggle).toBeVisible();
    // Collapsed: the tool buttons are hidden until the sheet opens.
    await expect(page.getByTestId('tool-rectangle')).toBeHidden();

    await toggle.click();
    await expect(page.getByTestId('tool-rectangle')).toBeVisible();

    const groups = ['.toolbar button', '.zoom-controls button', '.grid-controls button'];
    for (const selector of groups) {
      const buttons = page.locator(selector);
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await buttons.nth(i).boundingBox();
        expect(box, `small target: ${selector} #${i}`).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('tool buttons in the sheet activate tools and close the sheet', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mobile-notice-try-anyway').click();

    await page.getByTestId('toolbar-toggle').click();
    await page.getByTestId('tool-rectangle').click();

    await expect(page.getByTestId('tool-rectangle')).toHaveClass(/active/);
    // Tools are one-shot picks: the sheet drops back down for drawing.
    await expect(page.getByTestId('toolbar-toggle')).toBeVisible();
    await expect(page.getByTestId('tool-pencil')).toBeHidden();
  });
});
