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
const isWhite = ([r, g, b]: RGB) => r > 230 && g > 230 && b > 230;

test('drawn box is auto-selected with a color palette and recolors its stroke', async ({ page }) => {
  await page.goto('/');

  // Draw a box at (140,140)-(320,260).
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(140, 140);
  await page.mouse.down();
  await page.mouse.move(320, 260, { steps: 5 });
  await page.mouse.up();

  // The tool drops back to select and the new box is auto-selected,
  // so the palette surfaces immediately above it.
  await expect(page.getByRole('button', { name: 'Select' })).toHaveClass(/active/);
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

test('fill swatches paint the shape background', async ({ page }) => {
  await page.goto('/');

  // Draw a box at (140,140)-(320,260); center is (230,200).
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(140, 140);
  await page.mouse.down();
  await page.mouse.move(320, 260, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('color-palette')).toBeVisible();

  // Interior starts unfilled (no red inside the box).
  expect((await colorsNear(page, 230, 200, 3)).some(isRed)).toBe(false);

  // Picking a red fill paints the interior, and the swatch shows active.
  await page.locator('[data-fill="#dc2626"]').click();
  expect((await colorsNear(page, 230, 200, 3)).some(isRed)).toBe(true);
  await expect(page.locator('[data-fill="#dc2626"]')).toHaveClass(/active/);

  // The stroke stays ink unless recolored: the top edge is still dark.
  expect((await colorsNear(page, 230, 140, 3)).some(isDark)).toBe(true);

  // "No fill" clears the background again.
  await page.locator('[data-fill="none"]').click();
  expect((await colorsNear(page, 230, 200, 3)).some(isRed)).toBe(false);
  await expect(page.locator('[data-fill="none"]')).toHaveClass(/active/);
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
  // between the right edge x=260 and the ghost left edge x=360).
  await chip.hover();
  await page.waitForTimeout(50);
  expect((await colorsNear(page, 310, 150, 2)).some(isPreviewBlue)).toBe(true);

  // Clicking creates the next box (same size, gap of 100) plus a bound arrow.
  await chip.click();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('3');
  // Ghost became real: new box spans x=360..520.
  expect((await colorsNear(page, 360, 150, 2)).some(isDark)).toBe(true);
  expect((await colorsNear(page, 520, 150, 2)).some(isDark)).toBe(true);

  // The suggestion moves to the newest box, so chaining continues.
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator('[data-testid="element-count"]')).toHaveText('5');
  expect((await colorsNear(page, 780, 150, 2)).some(isDark)).toBe(true);
});

test('tools are one-shot and double-click labels a box even with a shape tool', async ({ page }) => {
  await page.goto('/');

  // Drawing a box returns to select mode with the box selected.
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(120, 120);
  await page.mouse.down();
  await page.mouse.move(280, 220, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Select' })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'Rect' })).not.toHaveClass(/active/);

  // Double-clicking the selected box means "add text".
  await page.mouse.dblclick(200, 170);
  const input = page.locator('textarea.text-input');
  await expect(input).toBeVisible();
  await input.fill('pump');
  await input.press('Enter');
  await expect(input).not.toBeVisible();

  // With a shape tool active, double-clicking a box still means "label it".
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.dblclick(200, 170);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('pump');

  // Cancelling also lands back in select mode.
  await input.press('Escape');
  await expect(input).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Select' })).toHaveClass(/active/);
});

// Vertical extent of dark ink in the box's center column — a proxy for the
// rendered label's font size.
async function labelInkSpan(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return 0;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const dpr = window.devicePixelRatio || 1;
    const x = Math.round(200 * dpr);
    const y0 = Math.round(110 * dpr);
    const y1 = Math.round(210 * dpr);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let y = y0; y <= y1; y++) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (d[3] > 128 && d[0] < 100 && d[1] < 100 && d[2] < 100) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxY >= minY ? (maxY - minY) / dpr : 0;
  });
}

test('label size selector rescales box text (small / medium / large)', async ({ page }) => {
  await page.goto('/');

  // Draw a roomy box at (100,100)-(300,220) and label it.
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(300, 220, { steps: 5 });
  await page.mouse.up();
  await page.mouse.dblclick(200, 160);
  const input = page.locator('textarea.text-input');
  await expect(input).toBeVisible();
  await input.fill('pump');
  await input.press('Enter');
  await expect(input).not.toBeVisible();

  // The palette offers S/M/L sizes; medium is the default.
  const small = page.getByTestId('font-scale-small');
  const medium = page.getByTestId('font-scale-medium');
  const large = page.getByTestId('font-scale-large');
  await expect(medium).toHaveClass(/active/);
  const mediumSpan = await labelInkSpan(page);
  expect(mediumSpan).toBeGreaterThan(0);

  // Large renders noticeably taller text, small noticeably shorter.
  await large.click();
  await expect(large).toHaveClass(/active/);
  const largeSpan = await labelInkSpan(page);

  await small.click();
  await expect(small).toHaveClass(/active/);
  const smallSpan = await labelInkSpan(page);

  expect(largeSpan).toBeGreaterThan(mediumSpan);
  expect(mediumSpan).toBeGreaterThan(smallSpan);
  expect(largeSpan).toBeGreaterThan(smallSpan * 1.5);
});

test('text color can be set to white, independent of border and fill', async ({ page }) => {
  await page.goto('/');

  // Draw a box at (140,140)-(320,260); center is (230,200).
  await page.getByRole('button', { name: 'Rect' }).click();
  await page.mouse.move(140, 140);
  await page.mouse.down();
  await page.mouse.move(320, 260, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('color-palette')).toBeVisible();

  // Fill it dark blue so white text will be visible against the interior.
  await page.locator('[data-fill="#2563eb"]').click();

  // Label the box.
  await page.mouse.dblclick(230, 200);
  const input = page.locator('textarea.text-input');
  await expect(input).toBeVisible();
  await input.fill('pump');
  await input.press('Enter');
  await expect(input).not.toBeVisible();

  // No white inside the box yet (default label matches the ink border).
  expect((await colorsNear(page, 230, 200, 6)).some(isWhite)).toBe(false);

  // Picking white text paints the label white on the blue fill.
  await page.locator('[data-text-color="#ffffff"]').click();
  await expect(page.locator('[data-text-color="#ffffff"]')).toHaveClass(/active/);
  expect((await colorsNear(page, 230, 200, 6)).some(isWhite)).toBe(true);

  // The border stays ink — text color is independent of the stroke.
  expect((await colorsNear(page, 230, 140, 3)).some(isDark)).toBe(true);

  // "Auto" returns the label to following the border color (no white left).
  await page.locator('[data-text-color="auto"]').click();
  await expect(page.locator('[data-text-color="auto"]')).toHaveClass(/active/);
  expect((await colorsNear(page, 230, 200, 6)).some(isWhite)).toBe(false);
});
