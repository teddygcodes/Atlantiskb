# Atlantis KB Platform

## Overview
Atlantis KB is a private, authenticated internal web platform built with Next.js. It currently ships two working product areas inside one codebase:

1. **Leads**: a permit- and enrichment-driven contractor intelligence system focused on Georgia markets.
2. **COMEX**: a metals pricing workspace for copper/aluminum historical prices, trend indicators, and a retrieval-augmented chat assistant.

The actual runnable app is in `atlantiskb-home/`.

## What is currently implemented

### Leads (implemented)
- Auth-protected dashboards and working pages for dashboard, companies, jobs, permits, prospecting, import, and settings.
- CRUD and filtered listing APIs for companies.
- Bulk CSV preview/commit import pipeline.
- Company enrichment pipeline (website discovery, content extraction, AI + keyword fallback classification).
- Job execution framework with persisted crawl job history.
- Permit ingestion workflows with multi-source fetchers, matching, bulk-linking, rematch tools, and permit signal scoring.
- Google Places prospecting flow (search, duplicate check, add-to-company pipeline).

### COMEX (implemented)
- Price sync endpoint pulling market data and writing `CommodityPrice` rows.
- Price API returning 1y history + MA30 + simple 30/60/90 day linear-regression projections.
- News sync endpoint that ingests RSS, embeds snippets, stores vectors in Postgres/pgvector, and derives price events.
- RAG chat endpoint that retrieves semantically similar news + related price events and streams LLM answers.

### Tool shell / launchpad (implemented)
- Root `/` page renders tool cards from `lib/tools.config.ts`.
- Clerk-protected sign-in and account views.

## What appears partial / in-progress
- Several source adapters remain intentionally demo/limited mode (for example permit adapter in `lib/sources/permits.ts`).
- Some integrations rely on external credentials and will no-op or return configuration errors when not present.
- Duplicate backup-like files exist (e.g. `* 2.ts`) and are not clearly part of active production paths.
- COMEX RAG requires pgvector column/index setup beyond base Prisma schema migration lifecycle.

## Architecture at a glance
- **Framework**: Next.js App Router (`app/`) with server routes and server components.
- **Auth**: Clerk middleware + server auth checks per route.
- **Data layer**: Prisma ORM over PostgreSQL.
- **Background/sync model**: triggered HTTP endpoints + persisted `CrawlJob` records + Vercel cron for scheduled COMEX sync.
- **AI usage**:
  - Company enrichment classification (`lib/ai`).
  - COMEX embedding generation and RAG answer generation (`lib/comex`).

## Tech stack
- Next.js 16 + React 19 + TypeScript 5
- Prisma 5 + PostgreSQL
- Clerk (@clerk/nextjs)
- Tailwind CSS 4 (plus inline style usage in many components)
- Recharts (COMEX charts)
- Playwright core (permit browser scraping paths)
- RSS Parser, node-html-parser, csv-parse
- Voyage AI embeddings API (COMEX semantic retrieval)

## Repository and code organization

```text
atlantiskb-home/
  app/
    (UI routes + API routes)
    leads/
      (protected pages, lead APIs)
    comex/
      (COMEX UI + APIs)
  components/
    dashboard/, companies/, jobs/, permits/, prospecting/, import/, ui/, layout/
  lib/
    ai/, comex/, enrichment/, jobs/, normalization/, scoring/, signals/, permits/, sources/, validation/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  proxy.ts
  next.config.ts
  vercel.json
```

## Data model overview (Prisma)
Core entities:
- `Company`: lead/account entity with enrichment fields, scores, status, Google Place info, origin metadata.
- `Signal`: activity evidence linked to a company (permit/news/job posting/manual/etc.).
- `Contact`: people/contact methods associated with a company.
- `Permit`: normalized permit record, optional company match, value/status/date lifecycle.
- `CrawlJob`: execution log for sync/import/enrichment jobs.
- `NewsArticle`, `CommodityPrice`, `PriceEvent`: COMEX news + market time-series + derived events.
- `Tag`, `CompanyTag`, `UserNote`: CRM-style annotation layer.

Enums encode lead lifecycle and signal/source taxonomy (e.g. `CompanyStatus`, `SignalType`, `SourceType`, `RecordOrigin`).

## Route/API overview

### Product routes
- `/` tool launchpad
- `/sign-in/[[...sign-in]]`
- `/account`
- `/leads/*` (protected workspace)
- `/comex` (charting + agent panel)

### Leads APIs (selected groups)
- **Companies**: list/create, detail/update/delete, merge, batch delete, website discovery
- **Import**: CSV preview + commit
- **Enrichment**: batch and per-company enrichment
- **Jobs**: run source adapters + read job history
- **Permits**: sync, list, stats, signals, single-permit patch, rematch, bulk sync
- **Prospecting**: Google Places search/check/add
- **Dashboard data**: top leads, map data, county panels, curated news, company contact updates
- **System**: health, rescore, job-posting signal sync

### COMEX APIs
- `/comex/api/prices/sync` (cron-targeted)
- `/comex/api/prices`
- `/comex/api/news/sync`
- `/comex/api/agent`

### Auth/infra API
- `/api/clerk-proxy/[[...path]]` for Clerk frontend API proxying.

## Authentication and external integrations

### Authentication
- Clerk provider at app root.
- Middleware enforces auth globally except explicit public routes (`/sign-in`, Clerk proxy paths, cron sync endpoint).
- Most API routes also perform explicit server-side `auth()` checks.

### External integrations currently wired
- Clerk (auth/session)
- Google Places API + Google Maps API (prospecting/maps)
- Google Custom Search API (website finding + job-posting signal workflows)
- Multiple permit portal adapters (Accela/ACA/EnerGov + county-specific scrapers)
- OpenCorporates (business registry adapter)
- Voyage AI embeddings (COMEX semantic retrieval)
- LLM providers via configurable AI layer (OpenAI/Anthropic)
- Yahoo Finance fetch path used by COMEX price sync

## Environment variables
Set in `.env.local` (or deployment env):

### Core
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV`

### Clerk
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_PROXY_URL`

### AI / embeddings
- `AI_PROVIDER`
- `AI_MODEL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`

### Google
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_ENGINE_ID`

### Permit/source credentials and tuning
- `ACCELA_APP_ID`
- `ACCELA_APP_SECRET`
- `COBB_ACA_USERNAME`
- `COBB_ACA_PASSWORD`
- `OPENCORPORATES_API_KEY`
- `CHROME_PATH`
- `PERMIT_LOOKBACK_DAYS`
- `ENRICHMENT_MAX_PAGES`
- `ENRICHMENT_TIMEOUT_MS`
- `JOB_STALE_MINUTES`

## Local setup

```bash
cd atlantiskb-home
npm install
cp .env.local.example .env.local
# fill required env values
npm run dev
```

Open `http://localhost:3000`.

## Database / Prisma workflow

```bash
cd atlantiskb-home
npx prisma generate
npx prisma migrate deploy
# optional local seed data
npx prisma db seed
```

For development migrations:

```bash
npx prisma migrate dev
```

### COMEX agent schema readiness
The COMEX agent runs in normal mode only when all required COMEX tables exist: `CommodityPrice`, `NewsArticle`, and `PriceEvent`. If any required table is missing, schema readiness reports degraded mode and the agent falls back to a degraded response path until migrations are applied (`npx prisma migrate deploy`).

### pgvector note for COMEX RAG
The COMEX semantic retrieval path expects a `vector` extension and `NewsArticle.embedding` vector column. Confirm your database has the extension/column/index expected by migrations and raw SQL inserts before enabling news embedding sync in non-dev environments.

## Deployment notes
- Configured for Vercel deployment.
- Build script runs `prisma generate && npx prisma migrate deploy && next build`.
- `vercel-build` script runs `npx prisma migrate deploy && npm run build` for Vercel deployments so migrations run against the same `DATABASE_URL` used at runtime.
- Start script runs `npx prisma migrate deploy && next start` before serving traffic.
- **Required deploy step:** ensure migrations are never skipped (`npx prisma migrate deploy`) before production traffic is served.
- `vercel.json` configures cron schedules for COMEX sync endpoints.
- Ensure all runtime env vars are set in deployment target, especially database, Clerk, and API credentials.

## Scheduled jobs / sync flows
- Vercel cron schedules call:
  - `/comex/api/prices/sync` multiple times on weekdays.
  - `/comex/api/news/sync` on weekdays.
- Leads syncs (permits, enrichment, import, source jobs) are on-demand HTTP triggers from UI/API.
- Job history and status tracking are persisted in `CrawlJob`.

## Known limitations
- Some lead-source adapters remain demo mode or constrained by external portal/API access.
- Auth + middleware + per-route checks are duplicated in places; behavior is robust but somewhat repetitive.
- Multiple long-running endpoints depend on network calls and can be slow or brittle when upstreams change.
- Repository contains duplicate `* 2.ts` files, implying cleanup debt.
- README/legacy docs in previous state were materially outdated relative to the codebase.

## Suggested roadmap (separate from current implementation)
1. Consolidate/clean duplicate files and define explicit active adapter list.
2. Move long-running sync tasks to durable background jobs/queues.
3. Add end-to-end and contract tests around high-value APIs (permits sync, enrich pipeline, CSV import).
4. Add stricter observability: job-level metrics, structured logs, failure alerts.
5. Normalize environment variable documentation and provide a single authoritative `.env.example` covering all integrations.
6. Harden AI/rag safety and response grounding with explicit citation validation tests.
