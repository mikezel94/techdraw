import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { elementCount } from './helpers';

// First-visit state: drop the project-level "onboarded" flag.
test.use({ storageState: { cookies: [], origins: [] } });

const EXAMPLE_ELEMENT_COUNT = '10';

function overlay(page: Page) {
  return page.getByTestId('onboarding-overlay');
}

async function advanceToStep(page: Page, step: number): Promise<void> {
  for (let current = 1; current < step; current++) {
    await page.getByTestId('onboarding-next').click();
  }
}

test('first-time visitors see a 4-step guided overlay', async ({ page }) => {
  await page.goto('/');

  await expect(overlay(page)).toBeVisible();
  await expect(page.getByTestId('onboarding-step-count')).toHaveText('Step 1 of 4');
  await expect(page.getByTestId('onboarding-spotlight')).toBeVisible();

  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding-step-count')).toHaveText('Step 2 of 4');
  await expect(page.getByTestId('onboarding-back')).toBeVisible();

  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding-step-count')).toHaveText('Step 3 of 4');

  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding-step-count')).toHaveText('Step 4 of 4');

  // The final step offers the example drawing.
  await expect(page.getByTestId('onboarding-load-example')).toBeVisible();
  await expect(page.getByTestId('onboarding-start')).toBeVisible();
});

test('overlay is not shown again on subsequent visits', async ({ page }) => {
  await page.goto('/');
  await expect(overlay(page)).toBeVisible();

  await page.getByTestId('onboarding-skip').click();
  await expect(overlay(page)).toBeHidden();
  const flag = await page.evaluate(() => localStorage.getItem('techdraw-onboarded'));
  expect(flag).not.toBeNull();

  await page.reload();
  await expect(overlay(page)).toBeHidden();
});

test('Escape skips the tour', async ({ page }) => {
  await page.goto('/');
  await expect(overlay(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(overlay(page)).toBeHidden();
  const flag = await page.evaluate(() => localStorage.getItem('techdraw-onboarded'));
  expect(flag).not.toBeNull();
});

test('Load Example Drawing populates the canvas', async ({ page }) => {
  await page.goto('/');
  await advanceToStep(page, 4);

  await page.getByTestId('onboarding-load-example').click();

  await expect(overlay(page)).toBeHidden();
  await expect(elementCount(page)).toHaveText(EXAMPLE_ELEMENT_COUNT);

  // Wait for the debounced auto-save, then check the tour stays gone and the
  // example survives the reload.
  await expect(page.locator('[data-testid="save-indicator"]')).toHaveClass(/visible/);
  await page.reload();
  await expect(overlay(page)).toBeHidden();
  await expect(elementCount(page)).toHaveText(EXAMPLE_ELEMENT_COUNT);
});

test('example drawing is available from the toolbar file actions after onboarding', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
  await expect(overlay(page)).toBeHidden();

  await page.getByTestId('load-example').click();
  await expect(elementCount(page)).toHaveText(EXAMPLE_ELEMENT_COUNT);
});
