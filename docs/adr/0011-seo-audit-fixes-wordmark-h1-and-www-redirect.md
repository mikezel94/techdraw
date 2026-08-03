# 0011. SEO audit fixes: wordmark H1, trimmed description, www redirect

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** AI agent

## Context

A Seobility audit of `https://techdraw.pages.dev/` flagged, beyond the issues
already handled by ADR 0010:

- The meta description exceeded the snippet pixel budget (1240px vs 1000px).
- No `<h1>`, no headings, and effectively zero indexable words — crawlers that
  execute JavaScript see only the canvas UI, and crawlers that don't ignore
  `<noscript>` content.
- Both `www.techdraw.pages.dev` and `techdraw.pages.dev` resolve, risking
  duplicate content.

Constraint from ADR 0010: no SSR/prerendering — discoverability metadata is
static, the app is a single-URL SPA.

## Decision

- Trim the meta description to within the ~160-character snippet budget while
  keeping the `browser-based technical drawing` phrase the title and tests
  rely on.
- Give the rendered app a real, visible `<h1>`: a compact `TechDraw` wordmark
  as the first item of the top toolbar, styled to toolbar scale. It is genuine
  UI, not hidden text (hidden/cloaked text risks penalties).
- Enrich the `<noscript>` block with structured copy — `<h2>` sections
  (Features, Source and feedback), paragraphs, a feature list, and an external
  link to the GitHub repository — so no-JS crawlers index real content. The
  repo URL is hard-coded in `index.html` like the other static SEO tags.
- Add `public/_redirects` with a single rule 301-redirecting
  `https://www.techdraw.pages.dev/*` to `https://techdraw.pages.dev/:splat`.
  Cloudflare Pages applies `_redirects` from the build output; Vite copies
  `public/` into it verbatim. The canonical link already points at the apex.

## Alternatives considered

- **Visually hidden SEO text block** — rejected: cloaked content violates
  search-engine guidelines and risks penalties.
- **A separate marketing landing page or prerendered copy section** — rejected
  for now: ADR 0010 already declined prerendering for a single-URL app; a
  landing page is a larger product decision, not an audit fix.
- **Redirecting via Cloudflare dashboard rules** — rejected: a committed
  `_redirects` file keeps the behavior versioned and preview-testable.

## Consequences

- The toolbar gains a wordmark; any toolbar layout change must keep it.
- The noscript copy is now a third place (with title and description) where
  product phrasing must stay roughly in sync.
- The audit's 250-word content recommendation is only partially met: the
  rendered DOM is still mostly a canvas. Fully satisfying it requires the
  landing-page/prerendering route deferred above.
- Remaining audit items are not fixable in code: subdomain hosting (needs a
  custom domain), backlinks, and social sharing plugins.
