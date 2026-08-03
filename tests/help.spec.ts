import { test, expect } from '@playwright/test';

test('help modal shows keyboard shortcuts and the repository link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();

  await page.getByTestId('help-button').click();

  const modal = page.getByTestId('help-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Keyboard shortcuts');
  await expect(modal.locator('.shortcut-table tbody tr')).toHaveCount(15);
  await expect(modal).toContainText('Ctrl / ⌘ + Z');
  await expect(modal).toContainText('Space + drag');
  await expect(page.getByTestId('help-repo-link')).toHaveAttribute(
    'href',
    'https://github.com/mikezel94/techdraw',
  );

  await page.getByTestId('help-close').click();
  await expect(modal).toBeHidden();
});

test('Escape closes the help modal', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('help-button').click();

  const modal = page.getByTestId('help-modal');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});
