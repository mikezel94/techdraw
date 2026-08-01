import { test, expect } from '@playwright/test';

type RGB = [number, number, number];

// Returns the non-transparent pixel colors in a (2r x 2r) region around (x, y).
async function colorsNear(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  r: number,
): Promise<RGB[]> {
  return page.evaluate(
    ([cx, cy, rad]) => {
      const c = document.querySelector('canvas');
      if (!c) return [];
      const ctx = c.getContext('2d');
      if (!ctx) return [];
      const dpr = window.devicePixelRatio || 1;
      const size = Math.max(1, Math.round(2 * rad * dpr));
      const data = ctx.getImageData(
        Math.round((cx - rad) * dpr),
        Math.round((cy - rad) * dpr),
        size,
        size,
      ).data;
      const colors: [number, number, number][] = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 128) colors.push([data[i], data[i + 1], data[i + 2]]);
      }
      return colors;
    },
    [x, y, r],
  );
}

const isDark = ([r, g, b]: RGB) => r < 100 && g < 100 && b < 100;
// SELECT_COLOR #4a90d9, widened to accept anti-aliased blends with white
// (the 1.5px preview line only partially covers a pixel row).
const isPreviewBlue = ([r, g, b]: RGB) => b > 180 && r < 160 && g > r && b > g;
// Swatch #dc2626
const isRed = ([r, g, b]: RGB) => r > 150 && g < 100 && b < 100;

test('selected box offers a color palette and recolors its stroke', async ({ page }) => {
  await page.goto('/');

  // Draw a box at (140,140)-(320,260).
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(140, 140);
  await page.mouse.down();
  await page.mouse.move(320, 260, { steps: 5 });
  await page.mouse.up();

  // Nothing selected yet — no palette.
  await expect(page.getByTestId('color-palette')).toHaveCount(0);

  // Selecting the box surfaces the palette above it.
  await page.getByRole('button', { name: 'Select' }).click();
  await page.mouse.click(230, 200);
  await expect(page.getByTestId('color-palette')).toBeVisible();

  // Picking red recolors the stroke (top edge at y=140).
  await page.locator('[data-color="#dc2626"]').click();
  expect((await colorsNear(page, 230, 140, 3)).some(isRed)).toBe(true);
  await expect(page.locator('[data-color="#dc2626"]')).toHaveClass(/active/);

  // The ink swatch restores the default stroke.
  await page.locator('[data-color="ink"]').click();
  expect((await colorsNear(page, 230, 140, 3)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 230, 140, 3)).some(isRed)).toBe(false);

  // Deselecting hides the palette.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('color-palette')).toHaveCount(0);
});

test('each created box suggests extending into a connected next box', async ({ page }) => {
  await page.goto('/');

  // Draw a box at (100,100)-(260,200).
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(260, 200, { steps: 5 });
  await page.mouse.up();

  // The extend suggestion appears on the created box.
  const chip = page.getByTestId('extend-chip');
  await expect(chip).toBeVisible();

  // Hovering previews the next box and its connector (solid segment at y=150
  // between the right edge x=260 and the ghost left edge x=320).
  await chip.hover();
  await page.waitForTimeout(50);
  expect((await colorsNear(page, 290, 150, 2)).some(isPreviewBlue)).toBe(true);

  // Clicking creates the next box (same size, gap of 60) plus a bound arrow.
  await chip.click();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('3');
  // Ghost became real: new box spans x=320..480.
  expect((await colorsNear(page, 320, 150, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 480, 150, 2)).some(isDark)).toBe(true);

  // The suggestion moves to the newest box, so chaining continues.
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('5');
  expect((await colorsNear(page, 700, 150, 2)).some(isDark)).toBe(true);
});
