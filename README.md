# Google Brand Presence Scan

A one-touch SEO audit tool for operators selling productized "Google Visibility Snapshot" audits to local businesses.

Enter a brand name + website + city → the tool scans how the brand appears across Google Search, Maps, and AI-driven search, then produces:

1. **A client-ready, scored report** (web page with one-click PDF export)
2. **A Top-10 Roadmap** of fixes ranked by impact vs. effort
3. **A Fix-It Kit** of ready-to-apply assets: LocalBusiness JSON-LD, canonical NAP block, GBP description copy, meta title/description rewrites, robots/sitemap fixes

## Checks

| Check | Data source | Without a key |
|---|---|---|
| Indexability (robots, sitemap, noindex, canonicals) | Site crawl | always works |
| On-page technical SEO (titles, descriptions, H1s, HTTPS, OG) | Site crawl | always works |
| Structured data (LocalBusiness, reviews, services) | Site crawl | always works |
| Speed & mobile (Lighthouse) | PageSpeed Insights API | works keyless at low quota |
| Google Business Profile completeness | Places API (`GOOGLE_API_KEY`) | printable manual checklist |
| NAP consistency (site ↔ GBP) | Crawl + Places | intra-site consistency only |
| Keyword opportunities | Crawl + GBP categories | works (heuristic) |
| Branded SERP ownership | `SerpProvider` adapter (none in V1) | printable manual checklist |
| AI search visibility | Anthropic API (`ANTHROPIC_API_KEY`) | printable manual checklist |

Every external dependency degrades to a manual-review section — the report never looks broken.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev
```

Env vars (all optional — see `.env.example`):

- `OPERATOR_PASSWORD` — gates the UI behind a shared password (recommended in production)
- `GOOGLE_API_KEY` — Google Cloud key with **Places API (New)** and **PageSpeed Insights API** enabled
- `ANTHROPIC_API_KEY` — enables AI-visibility check + generated copy and narrative
- `SERP_PROVIDER` — leave unset (manual stub); implement `src/lib/serp/` adapter to plug in SerpAPI/DataForSEO

## Usage

1. `/` — enter brand, website, city, category, optional Place ID
2. `/scan` — checks run in parallel with live progress (~1–2 min)
3. `/report` — the deliverable. **Export PDF** = print dialog. **Download scan.json** to archive; re-open any scan later by uploading it on `/report`.

Scans are stored in the browser (localStorage) — no database.

## Development

```bash
npm test          # unit tests (fixtures with planted defects)
npm run smoke -- https://some-local-business.com "Brand" "City"   # live smoke test
npm run build
```

## Architecture

The browser orchestrates the scan: each check is an independent serverless route (`/api/checks/[checkId]`) implementing a shared `Check` interface (`src/lib/registry.ts`). The crawl runs once (`/api/checks/crawl`) and its bundle is passed into dependent checks. Scoring and Top-10 prioritization are pure functions (`src/lib/scoring/`). Fix assets are generated deterministically, with optional LLM copy (`src/lib/fixkit/`).
