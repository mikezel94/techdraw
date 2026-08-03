import { test, expect } from '@playwright/test';

const SITE = 'https://techdraw.pages.dev';

test('page title and core meta tags are descriptive', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('TechDraw — Free Browser-Based Technical Drawing Tool');

  const description = page.locator('meta[name="description"]');
  await expect(description).toHaveAttribute('content', /browser-based technical drawing/);

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/`);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#ffffff',
  );
});

test('Open Graph and Twitter card tags are present', async ({ page }) => {
  await page.goto('/');

  const og = (name: string) => page.locator(`meta[property="og:${name}"]`);
  await expect(og('title')).toHaveAttribute(
    'content',
    'TechDraw — Free Browser-Based Technical Drawing Tool',
  );
  await expect(og('description')).toHaveAttribute('content', /infinite canvas/);
  await expect(og('url')).toHaveAttribute('content', `${SITE}/`);
  await expect(og('type')).toHaveAttribute('content', 'website');
  await expect(og('image')).toHaveAttribute('content', `${SITE}/og-image.png`);
  await expect(og('image:width')).toHaveAttribute('content', '1200');
  await expect(og('image:height')).toHaveAttribute('content', '630');

  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    `${SITE}/og-image.png`,
  );
});

test('favicon, apple-touch-icon and og-image resolve as real assets', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );

  const favicon = await page.request.get('/favicon.svg');
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');

  const appleIcon = await page.request.get('/apple-touch-icon.png');
  expect(appleIcon.ok()).toBe(true);
  expect(appleIcon.headers()['content-type']).toContain('image/png');

  const ogImage = await page.request.get('/og-image.png');
  expect(ogImage.ok()).toBe(true);
  expect(ogImage.headers()['content-type']).toContain('image/png');
});

test('robots.txt allows all and points at the sitemap', async ({ page }) => {
  const response = await page.request.get('/robots.txt');
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain('User-agent: *');
  expect(body).toContain('Allow: /');
  expect(body).toContain(`${SITE}/sitemap.xml`);
});

test('sitemap.xml lists the site URL', async ({ page }) => {
  const response = await page.request.get('/sitemap.xml');
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain('<urlset');
  expect(body).toContain(`<loc>${SITE}/</loc>`);
});

test('served HTML carries a noscript fallback for crawlers and no-JS users', async ({
  page,
}) => {
  const response = await page.request.get('/');
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('<noscript>');
  expect(html).toContain('TechDraw — Free Browser-Based Technical Drawing Tool');
  expect(html).toContain('Please enable JavaScript to use TechDraw.');
});
