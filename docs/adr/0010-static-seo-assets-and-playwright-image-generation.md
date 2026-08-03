# 0010. Static SEO assets and Playwright-generated social images

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context

Issue #20: the SPA shipped with a bare `<title>`, no meta description, no
Open Graph / Twitter tags, no favicon, no robots.txt or sitemap, so crawlers
and link-preview services saw nothing. The app deploys as a static bundle to
Cloudflare Pages at `https://techdraw.pages.dev`.

## Decision

- All discoverability metadata lives statically in `index.html`: descriptive
  title, description, keywords, canonical, Open Graph, Twitter card, favicon
  and apple-touch-icon links, `theme-color`. OG/Twitter image and canonical
  URLs are absolute, hard-coded to the production origin (crawlers require
  absolute `og:image` URLs).
- `public/favicon.svg` is a hand-authored static asset using the app's visual
  identity (ink tile, blue box, red ellipse, bound arrow).
- `public/og-image.png` (1200x630) and `public/apple-touch-icon.png`
  (180x180) are produced by `scripts/generate-social-images.mjs`
  (`npm run generate:social-images`), which renders the **real app** in
  headless Chromium — bundled example drawing plus an injected wordmark
  badge — and rasterizes the favicon SVG for the touch icon. The PNGs are
  committed so the static host serves them with no build-time rasterization.
- `public/robots.txt` (allow all, sitemap pointer) and `public/sitemap.xml`
  (single URL) ship as static assets.
- A `<noscript>` block inside `#root` gives crawlers and no-JS users a text
  description; React replaces it on mount.

## Alternatives considered

- **SSR / prerendering the React tree** (react-snap, prerender plugins) —
  changes the build architecture for a single-URL app whose content is fully
  described by static meta tags.
- **Rasterizing with sharp / node-canvas** — new native dependencies, and the
  og-image would be a mock instead of the real product UI. Playwright is
  already a dev dependency and renders the actual app.
- **Hand-drawn og-image.png** — drifts from the real UI on every redesign.

## Consequences

- Regenerate the social images whenever the UI identity or example drawing
  changes materially (`npm run generate:social-images`).
- OG/canonical URLs point at production even on preview deployments; that is
  deliberate — previews should not mint their own canonical identity.
- The noscript copy is a second description string to keep in sync with the
  meta description.
