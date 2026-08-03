// Generates public/og-image.png (1200x630) and public/apple-touch-icon.png
// (180x180) by rendering the real app (and the favicon SVG) in headless
// Chromium. Run with: npm run generate:social-images
//
// The generated PNGs are committed so the static host can serve them without
// a build-time rasterization step.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite dev server did not start at ${url}`);
}

const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore' },
);

let browser;
try {
  await waitForServer(BASE_URL);
  browser = await chromium.launch();

  // ---- og-image.png: the bundled example drawing + wordmark badge ----------
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [{ name: 'techdraw-onboarded', value: 'seen' }],
        },
      ],
    },
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('[data-testid="load-example"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="element-count"]')?.textContent !== '0',
  );
  await page.waitForTimeout(400); // let the canvas repaint settle

  await page.evaluate(() => {
    const badge = document.createElement('div');
    badge.style.cssText = [
      'position: fixed',
      'right: 28px',
      'bottom: 24px',
      'background: #1e1e1e',
      'color: #ffffff',
      'padding: 14px 22px',
      'border-radius: 12px',
      'font-family: system-ui, -apple-system, sans-serif',
      'line-height: 1.25',
      'box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25)',
      'z-index: 9999',
    ].join(';');
    const name = document.createElement('div');
    name.textContent = 'TechDraw';
    name.style.cssText = 'font-size: 30px; font-weight: 700; letter-spacing: 0.01em';
    const tagline = document.createElement('div');
    tagline.textContent = 'Free technical drawing in your browser';
    tagline.style.cssText = 'font-size: 14px; opacity: 0.85; margin-top: 2px';
    badge.append(name, tagline);
    document.body.appendChild(badge);
  });
  await page.screenshot({ path: `${ROOT}public/og-image.png` });
  await context.close();

  // ---- apple-touch-icon.png: favicon design, full-bleed square -------------
  // Apple ignores alpha and applies its own corner mask, so the rounded
  // favicon tile is rendered with square corners here.
  const faviconSvg = readFileSync(`${ROOT}public/favicon.svg`, 'utf8').replace(
    'rx="14"',
    'rx="0"',
  );
  const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await iconPage.setContent(
    `<!doctype html><html><head><style>body{margin:0}</style></head><body>${faviconSvg.replace(
      '<svg ',
      '<svg width="180" height="180" ',
    )}</body></html>`,
  );
  await iconPage.screenshot({ path: `${ROOT}public/apple-touch-icon.png` });
} finally {
  if (browser) await browser.close();
  vite.kill('SIGTERM');
}

console.log('Wrote public/og-image.png and public/apple-touch-icon.png');
