# Atlantis KB Platform

Internal B2B sales intelligence and commodity pricing platform for electrical supply reps targeting electrical contractors in Metro Atlanta and North Georgia.

Two product areas ship in one codebase: **Leads** (contractor intelligence) and **COMEX** (metals pricing + RAG agent). All routes are Clerk-authenticated. The runnable app is in `atlantiskb-home/`.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Repository Layout](#repository-layout)
3. [Data Models](#data-models)
4. [Feature Modules](#feature-modules)
   - [Leads](#leads-module)
   - [COMEX](#comex-module)
5. [Library Reference](#library-reference)
6. [API Routes](#api-routes)
7. [Components](#components)
8. [External Integrations](#external-integrations)
9. [Environment Variables](#environment-variables)
10. [Scoring System](#scoring-system)
11. [Data Flow Diagrams](#data-flow-diagrams)
12. [Scheduled Jobs](#scheduled-jobs)
13. [Local Setup](#local-setup)
14. [Database Workflow](#database-workflow)
15. [Deployment](#deployment)
16. [Known Limitations & Roadmap](#known-limitations--roadmap)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| ORM / DB | Prisma 5 + PostgreSQL + pgvector (optional) |
| Auth | Clerk (`@clerk/nextjs`) |
| AI | Anthropic (default) / OpenAI (opt-in), Voyage AI embeddings |
| Charts | Recharts |
| CSS | Tailwind CSS 4 + inline styles |
| Scraping | node-html-parser, Playwright Core (browser automation for permit portals) |
| Feed parsing | rss-parser, csv-parse |
| Security | AES-GCM encryption (phone numbers), HMAC tokens, CSP headers |
| Rate limiting | Upstash Redis (optional) |
| Deployment | Vercel (cron jobs configured in `vercel.json`) |

---

## Repository Layout

```
atlantiskb-home/
├── app/
│   ├── layout.tsx                        # Root layout — Clerk provider
│   ├── page.tsx                          # Tool launchpad (home)
│   ├── sign-in/[[...sign-in]]/           # Clerk sign-in
│   ├── account/                          # Clerk account management
│   ├── api/
│   │   └── clerk-proxy/[[...path]]/      # Reverse proxy for Clerk frontend API
│   ├── leads/
│   │   ├── (protected)/                  # Auth-guarded page routes
│   │   │   ├── dashboard/                # Permit signals, top leads, territory map
│   │   │   ├── companies/                # Company list + detail
│   │   │   ├── permits/                  # Permit browser + slide-over
│   │   │   ├── jobs/                     # Job execution history
│   │   │   ├── import/                   # CSV import flow
│   │   │   ├── prospecting/              # Google Places prospecting
│   │   │   └── settings/                 # App settings
│   │   └── api/                          # 30+ REST endpoints (see API Routes)
│   └── comex/
│       ├── page.tsx                      # Price charts + indicators + agent panel
│       ├── components/AgentPanel/        # RAG chat UI
│       └── api/                          # COMEX endpoints (see API Routes)
├── components/
│   ├── dashboard/                        # TerritoryMap, TopLeads, PermitSignals, NewsFeed, CountyPanel
│   ├── companies/                        # CompaniesTable, FilterBar, EnrichButton, WebsiteEditor
│   ├── permits/                          # PermitsBrowser, PermitSlideOver
│   ├── prospecting/                      # ProspectingView, CountyMap
│   ├── import/                           # ImportFlow
│   ├── jobs/                             # JobHistoryList, JobControlPanel
│   ├── comex/                            # TechnicalChart, IndicatorPanel, ScenarioChart, ScenarioTable
│   ├── layout/                           # Sidebar, NavLink
│   ├── ui/                               # Badge, EmptyState
│   └── Topbar.tsx
├── lib/
│   ├── ai/                               # Provider-agnostic LLM calls
│   ├── comex/                            # Prices, indicators, embeddings, RAG, news
│   ├── enrichment/                       # Website scraping + enrichment pipeline
│   ├── scoring/                          # Lead scoring engine
│   ├── sources/                          # Pluggable source adapters
│   ├── permits/                          # County-specific permit fetchers
│   ├── jobs/                             # Job runner + sync orchestration
│   ├── signals/                          # Job posting signals
│   ├── normalization/                    # Name/domain/phone/address normalization
│   ├── dedupe/                           # Duplicate detection + merge
│   ├── validation/                       # Zod API schemas
│   ├── companies/                        # Company merge helpers
│   ├── crypto.ts                         # AES-GCM + HMAC
│   ├── db.ts                             # Prisma singleton
│   ├── format.ts                         # Date/phone formatting
│   ├── pagination.ts                     # Paginated response builder
│   ├── rate-limit.ts                     # Upstash Redis rate limiter
│   ├── tools.config.ts                   # Tool launchpad config
│   └── startup-checks.ts                 # Env var validation at boot
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── instrumentation.ts                    # Next.js boot hook (startup checks)
├── next.config.ts                        # Security headers, CSP, rewrites
└── vercel.json                           # Cron schedules
```

---

## Data Models

### Company
Lead/account entity. The central record everything else references.

| Field | Type | Notes |
|---|---|---|
| `id` | String | CUID |
| `name` | String | Display name |
| `normalizedName` | String | Lowercased, stripped for deduplication |
| `website` | String? | Homepage URL |
| `domain` | String? | Extracted domain — **unique index** |
| `phone` | String? | AES-GCM encrypted at rest |
| `email` | String? | |
| `address` | String? | |
| `county` | String? | Target counties: Gwinnett, Hall, Forsyth, Cobb, Fulton, Cherokee |
| `segments` | String[] | e.g. `["commercial", "industrial"]` |
| `specialties` | String[] | e.g. `["switchgear", "data centers"]` |
| `description` | String? | AI-generated summary |
| `leadScore` | Int | 0–100 composite score |
| `activeScore` | Int | 0–100 activity/recency score |
| `status` | CompanyStatus | NEW / QUALIFYING / ACTIVE / INACTIVE / DO_NOT_CONTACT |
| `doNotContact` | Boolean | Blocks enrichment and outreach |
| `googlePlaceId` | String? | For Places API |
| `permitSignalScore` | Float? | Derived from matched permit activity |
| `recordOrigin` | RecordOrigin | DEMO / DISCOVERED / IMPORTED / MANUAL / PERMIT_DISCOVERY |
| `lastEnrichedAt` | DateTime? | |

### Signal
Activity evidence linked to a company. Drives `activeScore`.

| Field | Type | Notes |
|---|---|---|
| `signalType` | SignalType | JOB_POSTING / PERMIT / LICENSE / BUSINESS_REGISTRY / NEWS / WEBSITE_CONTENT / MANUAL / DISCOVERY |
| `relevanceScore` | Float? | 0–1 |
| `signalDate` | DateTime? | When the activity occurred |
| `county`, `city` | String? | Geography |
| `metadata` | Json? | Source-specific payload |

### Permit
Normalized permit record from county portals.

| Field | Type | Notes |
|---|---|---|
| `source` | String | County identifier |
| `externalId` | String | Portal ID — unique with `source` |
| `permitType` | String? | e.g. "Electrical", "Commercial" |
| `jobValue` | Float? | Dollar value from portal |
| `isResidential` | Boolean | Filtered by keyword heuristic |
| `estimatedValueBucket` | String? | e.g. "<$10k", "$10k–$50k" |
| `companyId` | String? | FK → Company (nullable until matched) |
| `matchConfidence` | Float? | 0–1 matching confidence |

### COMEX Models

| Model | Purpose |
|---|---|
| `CommodityPrice` | Daily OHLC for copper/aluminum. Unique per `(metal, settlementDate)`. |
| `NewsArticle` | Ingested news snippets with optional `embedding vector(512)` for semantic search. |
| `PriceEvent` | Detected significant price moves: `direction` (up/down), `magnitude` (medium/large), `changePercent`. |

### CRM Models

| Model | Purpose |
|---|---|
| `Contact` | People associated with a company (name, title, email, phone, LinkedIn) |
| `UserNote` | Freeform annotations with `authorUserId` |
| `Tag` + `CompanyTag` | Custom labels with color |
| `CrawlJob` | Execution log for all sync/import/enrichment jobs |

### Enums

```
CompanyStatus:  NEW | QUALIFYING | ACTIVE | INACTIVE | DO_NOT_CONTACT
SignalType:     JOB_POSTING | PERMIT | LICENSE | BUSINESS_REGISTRY | NEWS | WEBSITE_CONTENT | MANUAL | DISCOVERY
SourceType:     COMPANY_WEBSITE | PERMIT | LICENSE | CSV_IMPORT | MANUAL | COMPANY_DISCOVERY
RecordOrigin:   DEMO | DISCOVERED | IMPORTED | MANUAL | PERMIT_DISCOVERY
CrawlJobStatus: PENDING | RUNNING | COMPLETED | FAILED
NewsMetal:      copper | aluminum | both
PriceDirection: up | down
PriceMagnitude: medium | large
```

---

## Feature Modules

### Leads Module

#### Dashboard (`/leads/dashboard`)
- **TerritoryMap**: Interactive county map overlaid with permit density and company pins.
- **TopLeads**: Companies sorted by `leadScore`, inline contact update.
- **PermitSignals**: Recent permit activity feed.
- **CountyPanel**: Per-county company count, permit count, score distribution.
- **NewsFeed**: Georgia construction news pulled dynamically.

#### Company Management (`/leads/companies`)
- Paginated, filterable list (search, county, segment, score, website/email flags).
- Detail view: edit fields, trigger enrichment, merge duplicates, manage contacts/signals/notes/tags.
- Score breakdown panel showing which factors contributed.

#### Enrichment Pipeline
1. Find or confirm website URL (Google CSE if unknown).
2. Fetch HTML across up to 4 pages, respecting `robots.txt`.
3. Extract text, emails, phone numbers, addresses.
4. Call AI (Anthropic or OpenAI) to classify: segments, specialties, service areas, employee size, buyer profile, outreach angle.
5. If AI unavailable → keyword classifier fallback.
6. Persist enrichment fields, create `WEBSITE_CONTENT` signal, recompute score.

#### Permit Ingestion
Multi-source permit fetchers coordinated by `syncPermitSignals()`:
- **Accela REST API**: Gwinnett, Hall, Atlanta
- **Accela ACA portal**: HTML scraping
- **DeKalb ArcGIS**: FeatureServer query
- **Cherokee PHP portal**: scraper
- **Cobb ACA**: scraper (requires credentials)
- **EnerGov API**: Forsyth, Jackson
- **Playwright browser automation**: fallback for JS-rendered portals

After fetch: normalize → match to companies by phone/name → create `PERMIT` signals → estimate value bucket → compute `permitSignalScore` → recompute company score.

#### Google Places Prospecting (`/leads/prospecting`)
1. Search by keyword + county via Places API.
2. Duplicate check against existing companies by `domain` and `normalizedName`.
3. Bulk add new discoveries with `recordOrigin = PERMIT_DISCOVERY`.

#### CSV Import (`/leads/import`)
1. Upload CSV → preview with validation (Zod schema per row).
2. Commit: upsert by domain, dedup by normalized name, merge fields.

#### Job Runner
`runJob(sourceType, params)` executes any registered `SourceAdapter`, creates/updates a `CrawlJob` record, and returns `{ recordsFound, recordsCreated, recordsUpdated }`.

---

### COMEX Module

#### Price Data
- **Sync** (`POST /comex/api/prices/sync`): fetches daily OHLC from Yahoo Finance for copper (`GC=F`) and aluminum (`ALI=F`), stores as `CommodityPrice`, computes MA30, detects price events (>0.5% move = medium, >2% = large).
- **History** (`GET /comex/api/prices`): returns 1-year of OHLC + MA30 overlay + 30/60/90-day linear regression predictions per metal.

#### Technical Indicators (`GET /comex/api/technicals`)
Computed on-the-fly from stored price history:

| Indicator | Function | Parameters |
|---|---|---|
| SMA | `sma(prices, window)` | 10, 30, 50 day |
| EMA | `ema(prices, window)` | Configurable |
| RSI | `rsi(prices, period)` | 14-period |
| MACD | `macd(prices)` | 12/26/9 standard |
| Bollinger Bands | `bollingerBands(prices, window, stdDev)` | 20-day, 2σ |
| ATR | `atr(prices, period)` | 14-period |
| Stochastic | `stochastic(prices, kPeriod, dPeriod)` | %K/%D |
| Support/Resistance | `findSupportResistance(prices)` | Pivot-based |

`computeTechnicalSummary(prices)` returns all indicators plus a bias label (bullish / bearish / neutral).

#### Scenarios (`POST /comex/api/scenario`)
AI-generated bull / base / bear scenario outlook using the technical summary as input context. Returns price bands for 1-week, 30-day, and 90-day horizons, plus key support/resistance levels, narrative catalysts per scenario, and a current price bias. Rendered as a fan chart in `ScenarioChart` with a y-axis domain computed from the actual price range (not zero-based). The scenario generation is wired to "Generate Copper/Aluminum Outlook" buttons on the COMEX page and feeds both the chart and `ScenarioTable` (price targets + catalyst bullets per horizon).

#### News & RAG Agent
1. **News sync** (`POST /comex/api/news/sync`): fetches RSS from configured feeds, filters by relevance keywords, embeds each snippet via Voyage AI (`embedText()`), stores in `NewsArticle.embedding` (pgvector).
2. **RAG agent** (`POST /comex/api/agent`): retrieves semantically similar articles via vector search + related `PriceEvent` rows → injects as context → streams LLM answer via Anthropic/OpenAI.
3. **Fallback**: if pgvector not configured, falls back to keyword-based retrieval.

#### Schema Health (`GET /comex/api/health/schema`)
Reports pgvector readiness: extension installed, `embedding` column present, dimension configured (512), dimension match. Required before enabling news embedding sync in non-dev environments.

---

## Library Reference

### `lib/ai/index.ts`

| Export | Signature | Purpose |
|---|---|---|
| `enrichWithAI` | `(name: string, text: string, source: string) => Promise<AIEnrichmentOutput>` | Single LLM call → structured JSON. Falls back to keyword classifier on failure. |
| `AIEnrichmentSchema` | Zod schema | Validates: `primarySegment`, `secondarySegments`, `specialties`, `serviceAreas`, `employeeSizeEstimate`, `summary`, `likelyBuyerProfile`, `confidence`, `recommendedFollowUpAngle` |

AI provider selected by `AI_PROVIDER` env var (`anthropic` default, `openai` opt-in). Model selected by `AI_MODEL`.

---

### `lib/enrichment/`

| Export | Signature | Purpose |
|---|---|---|
| `enrichFromWebsite` | `(url: string) => Promise<ExtractedData>` | Fetches up to 4 pages of HTML. Respects `robots.txt`. Extracts text, emails, phones, address. |
| `enrichCompany` | `(companyId: string, url: string) => Promise<void>` | Orchestrates scrape → AI call → DB update for a single company. |
| `isRobotsBlocked` | `(url: string, path: string) => boolean` | Returns true if path is disallowed by robots.txt. |
| `runFullEnrichment` | `(companyId: string) => Promise<PipelineResult>` | Full pipeline: find website → scrape or Places fallback → AI → county derivation → `scoreCompany()`. |
| `classifyText` | `(text: string) => ClassificationResult` | Keyword classifier fallback. Returns segments + specialties without an LLM call. |

---

### `lib/scoring/index.ts`

| Export | Signature | Purpose |
|---|---|---|
| `scoreCompany` | `(input: ScoringInput) => ScoreOutput` | Computes `leadScore` (0–100) + `activeScore` (0–100) + sales metadata. |

`ScoringInput` includes: county, segments, specialties, description, website/email/phone flags, contacts, signals (with dates), permitSignalScore, aiConfidence.

`ScoreOutput` adds: `reasons[]` (per-factor breakdown), `likelyProductDemandCategories`, `likelySalesMotion`, `likelyBuyerValue`, `outreachAngle`.

See [Scoring System](#scoring-system) for weight breakdown.

---

### `lib/comex/`

| Module | Export | Purpose |
|---|---|---|
| `fetch-prices.ts` | `fetchYahooPrices(symbol)` | Daily OHLC from Yahoo Finance public API. |
| `moving-average.ts` | `computeMA(prices, window)` | Rolling simple moving average. |
| `predictions.ts` | `linearRegression(prices)` | Returns 30/60/90-day price predictions via OLS. |
| `technical-indicators.ts` | `sma`, `ema`, `rsi`, `macd`, `bollingerBands`, `atr`, `stochastic`, `findSupportResistance`, `computeTechnicalSummary` | Full indicator suite (see above). |
| `embeddings.ts` | `embedText(text)`, `embedBatch(texts)` | Voyage AI semantic embeddings (1536-dim, stored as 512). |
| `rag.ts` | `buildRAGContext(query, metal)` | Vector search → fallback → returns `RetrievedArticle[]` + `RAGContext`. |
| `price-events.ts` | `syncPriceEvents(metal)` | Scans `CommodityPrice` for ≥0.5% daily moves, stores `PriceEvent`. |
| `news-sources.ts` | `NEWS_SOURCES`, `isRelevant(article)`, `inferMetal(text)` | RSS feed list + relevance filter + copper/aluminum inference. |
| `schema-readiness.ts` | `getComexSchemaReadiness()` | Returns table presence, vector config, dimension match. |
| `constants.ts` | `METAL_CONFIG`, `METAL_KEYS` | Symbol mapping: `copper → GC=F`, `aluminum → ALI=F`. |

---

### `lib/permits/`

| Module | Adapter | County/Source |
|---|---|---|
| `accela.ts` | `accelaAdapter()` | Gwinnett, Hall, Atlanta (Accela REST API) |
| `accela-aca.ts` | `accelaAcaAdapter()` | ACA portal HTML scraper |
| `dekalb.ts` | `fetchDekalbPermits()` | DeKalb ArcGIS FeatureServer |
| `cherokee.ts` | `fetchCherokeePermits()` | Cherokee PHP portal |
| `cobb.ts` | `fetchCobbPermits()` | Cobb ACA (requires credentials) |
| `energov.ts` | `fetchEnergovPermits()` | Forsyth, Jackson (EnerGov API) |
| `browser.ts` | `findChromiumPath()` | Playwright Chromium auto-detection |
| `base.ts` | `isResidential(permit)`, `normalizeStatus(raw)` | Shared permit utilities |

---

### `lib/jobs/`

| Export | Signature | Purpose |
|---|---|---|
| `runJob` | `(sourceType, params) => Promise<RunJobResult>` | Executes a source adapter; creates and finalizes a `CrawlJob` record. |
| `syncPermitSignals` | `() => Promise<SyncSummary>` | Runs all permit adapters, matches to companies, creates signals, rescores. |
| `estimatePermitValue` | `(permit) => string` | Returns value bucket string (`"<$10k"`, `"$10k–$50k"`, etc.). |
| `cleanupStaleJobs` | `() => Promise<void>` | Marks stale PENDING/RUNNING jobs as FAILED after `JOB_STALE_MINUTES`. |

---

### `lib/sources/`

All sources implement `SourceAdapter`:

```ts
interface SourceAdapter {
  sourceType: SourceType
  discover(params): Promise<DiscoveryResult[]>
  fetchDetails?(id: string): Promise<RawRecord>
  normalize(raw: RawRecord): NormalizedRecord
  persist(record: NormalizedRecord): Promise<PersistResult>
  isDemoMode?: boolean
  demoReason?: string
}
```

| Adapter | Key Function | Notes |
|---|---|---|
| `google-places.ts` | `searchPlaces(query, county)`, `findPlaceForCompany(name)`, `buildPlaceText(place)` | Returns structured place data. `isGooglePlacesConfigured()` gate. |
| `website-finder.ts` | `findWebsiteForCompany(name, county)` | Google CSE query to find homepage. |
| `company-discovery.ts` | `companyDiscoveryAdapter` | Wraps Places for discovery jobs. |
| `company-site.ts` | `companySiteAdapter` | Wraps enrichment pipeline for job runner. |
| `business-registry.ts` | `licenseAdapter` | OpenCorporates (demo if no API key). |

---

### `lib/normalization/`

| Export | Purpose |
|---|---|
| `normalizeName(name)` | Lowercase, strip punctuation/suffixes (LLC, Inc, Co) for dedup |
| `normalizeDomain(url)` | Extract naked domain, strip www/path |
| `normalizePhone(phone)` | E.164 normalization |
| `normalizeAddress(addr)` | Trim, consistent casing |
| `extractDomain(url)` | Hostname extraction |
| `deriveCountyFromCity(city)` | Static `GEORGIA_CITY_TO_COUNTY` lookup |
| `geocodeCountyFromAddress(addr)` | Google Geocoding API fallback |

---

### `lib/dedupe/index.ts`

| Export | Signature | Purpose |
|---|---|---|
| `findExistingCompany` | `(name, domain, phone) => Promise<Company \| null>` | Match by domain (exact) or normalizedName (fuzzy). |
| `mergeCompanyData` | `(target, source) => MergedFields` | Field-level merge: prefer non-null, prefer higher confidence. |

---

### `lib/crypto.ts`

| Export | Purpose |
|---|---|
| `encrypt(plaintext)` | AES-GCM encryption. Returns `iv:ciphertext` base64 string. |
| `decrypt(ciphertext)` | Reverses encrypt. |
| `hmacToken(value)` | SHA-256 HMAC for use in WHERE lookups without decrypting. |

Phone numbers are stored encrypted. Lookups use HMAC token to avoid full-table decrypt.

---

### `lib/signals/`

| Export | Purpose |
|---|---|
| `fetchElectricianJobPostings(county)` | Google CSE search for electrician job postings in a county. |
| `extractCompanyFromTitle(title)` | Parses contractor name from job title string. |
| `syncJobPostingSignals()` | Creates `JOB_POSTING` signals, updates `activeScore`. |

---

### `lib/validation/schemas.ts`

Zod schemas for all API inputs:

| Schema | Used By |
|---|---|
| `PaginationSchema` | All list endpoints |
| `CompanyFiltersSchema` | `GET /leads/api/companies` |
| `ImportRowSchema` | CSV import preview/commit |
| `RunJobSchema` | `POST /leads/api/jobs/run` |
| `PlacesAddSchema` | `POST /leads/api/places/add` |
| `EnrichBatchSchema` | `POST /leads/api/enrich/batch` |
| `PermitSyncSchema` | `POST /leads/api/permits/sync` |

---

## API Routes

### Companies

| Method | Route | Purpose |
|---|---|---|
| GET | `/leads/api/companies` | Paginated list with filters (search, county, segment, minScore, hasWebsite, hasEmail) |
| POST | `/leads/api/companies` | Create company |
| GET | `/leads/api/companies/[id]` | Company detail with signals, contacts, notes, tags |
| PATCH | `/leads/api/companies/[id]` | Update fields |
| DELETE | `/leads/api/companies/[id]` | Delete company |
| POST | `/leads/api/companies/merge` | Merge two companies (target absorbs source) |
| POST | `/leads/api/companies/batch-delete` | Delete multiple by ID array |
| POST | `/leads/api/companies/find-websites` | Batch website discovery via Google CSE |

### Import

| Method | Route | Purpose |
|---|---|---|
| POST | `/leads/api/import/csv/preview` | Parse + validate CSV, return row preview with error flags |
| POST | `/leads/api/import/csv/commit` | Upsert validated rows into DB with dedup |

### Enrichment

| Method | Route | Purpose |
|---|---|---|
| POST | `/leads/api/enrich/company/[id]` | Enrich single company (scrape → AI → score) |
| POST | `/leads/api/enrich/batch` | Batch enrich up to 500 companies sequentially |

### Jobs

| Method | Route | Purpose |
|---|---|---|
| GET | `/leads/api/jobs` | Paginated `CrawlJob` history |
| POST | `/leads/api/jobs/run` | Execute a source adapter by type |

### Permits

| Method | Route | Purpose |
|---|---|---|
| POST | `/leads/api/permits/sync` | Full multi-source permit sync |
| GET | `/leads/api/permits/list` | Paginated permit browser (filter by county, status, date, value) |
| GET | `/leads/api/permits/stats` | County-level permit aggregates |
| POST | `/leads/api/permits/bulk-sync` | Per-county sync with source selection |
| PATCH | `/leads/api/permits/[id]` | Update single permit (match override, status) |
| POST | `/leads/api/permits/rematch` | Re-run matching for unmatched permits |
| GET | `/leads/api/permits/signals` | Permit-based signal feed |

### Prospecting (Google Places)

| Method | Route | Purpose |
|---|---|---|
| GET | `/leads/api/places/search` | Search Places by keyword + county |
| GET | `/leads/api/places/check` | Check if Place already exists as a company |
| POST | `/leads/api/places/add` | Bulk add Place results as companies |

### Signals

| Method | Route | Purpose |
|---|---|---|
| POST | `/leads/api/signals/job-postings/sync` | Sync job posting signals via Google CSE |

### Dashboard

| Method | Route | Purpose |
|---|---|---|
| GET | `/leads/api/dashboard/top-leads` | Top companies by `leadScore` with contact data |
| GET | `/leads/api/dashboard/map-data` | Permit + company density per county for map overlay |
| GET | `/leads/api/dashboard/county/[county]` | County-level metrics (companies, permits, score bands) |
| GET | `/leads/api/dashboard/news` | Curated Georgia construction news |
| PATCH | `/leads/api/dashboard/company/[id]/contact` | Inline contact update from dashboard |

### Admin / System

| Method | Route | Purpose |
|---|---|---|
| POST | `/leads/api/rescore` | Rescore all companies (full table scan) |
| POST | `/leads/api/admin/backfill-encryption` | Encrypt unencrypted legacy phone numbers |
| GET | `/leads/api/health` | Health check (DB ping, env var presence) |

### COMEX

| Method | Route | Purpose |
|---|---|---|
| POST | `/comex/api/prices/sync` | Fetch Yahoo Finance → store `CommodityPrice` + detect `PriceEvent` (cron target) |
| GET | `/comex/api/prices` | 1-year OHLC + MA30 + 30/60/90d predictions per metal |
| POST | `/comex/api/news/sync` | Ingest RSS → embed → store vectors (cron target) |
| POST | `/comex/api/agent` | Streaming RAG chat response |
| GET | `/comex/api/technicals` | All technical indicators for a metal |
| POST | `/comex/api/scenario` | Bull/base/bear scenario projections |
| GET | `/comex/api/health/schema` | pgvector readiness + dimension check |

---

## Components

### Dashboard
| Component | Type | Purpose |
|---|---|---|
| `TerritoryMap` | Client | SVG county map with permit/company density overlay |
| `TopLeads` | Client | Top companies by leadScore, inline contact update |
| `PermitSignals` | Client | Real-time permit activity feed |
| `NewsFeed` | Server | Georgia construction news (dynamic fetch) |
| `CountyPanel` | Client | Per-county stats cards |

### Companies
| Component | Type | Purpose |
|---|---|---|
| `CompaniesTable` | Client | Paginated, sortable company list |
| `FilterBar` | Client | Search + county + segment + score + flag filters |
| `EnrichButton` | Client | Single or batch enrichment trigger |
| `FindWebsitesButton` | Client | Batch website discovery trigger |
| `WebsiteEditor` | Client | Inline website URL editor with validation |

### Permits
| Component | Type | Purpose |
|---|---|---|
| `PermitsBrowser` | Client | Paginated permit list with filters |
| `PermitSlideOver` | Client | Permit detail + match/rematch controls + value estimation |

### COMEX
| Component | Type | Purpose |
|---|---|---|
| `TechnicalChart` | Client | Historical close + MA30 + predictions (Recharts ComposedChart) |
| `IndicatorPanel` | Client | RSI / MACD / Bollinger / ATR / Stochastic sub-panels |
| `ScenarioChart` | Client | Bull/base/bear fan chart with dynamic y-axis domain |
| `ScenarioTable` | Client | Scenario price targets + catalysts by horizon |
| `AgentPanel` | Client | Streaming RAG chat interface |

---

## External Integrations

| Service | Purpose | Required | Fallback |
|---|---|---|---|
| **Clerk** | Authentication + session management | Yes | None |
| **PostgreSQL** | Primary datastore | Yes | None |
| **Anthropic** | AI enrichment + RAG answers | Recommended | OpenAI or keyword classifier |
| **OpenAI** | AI enrichment + RAG answers (alt) | No | Anthropic or keyword classifier |
| **Voyage AI** | News semantic embeddings | No | Keyword-based retrieval |
| **Google Places API (New)** | Company discovery + phone/website | No | Skipped |
| **Google Maps API** | Territory map rendering | No | Map won't render |
| **Google Custom Search (CSE)** | Website finder + job posting signals | No | Skipped |
| **Yahoo Finance** | COMEX daily OHLC | No API key | Public endpoint — no auth |
| **Accela REST API** | Gwinnett/Hall/Atlanta permits | No | Demo mode |
| **Cobb ACA Portal** | Cobb permit scraping | No | Skipped |
| **EnerGov API** | Forsyth/Jackson permits | No | Demo mode |
| **OpenCorporates** | Business registry | No | Demo mode |
| **Google Geocoding API** | County inference from address | No | City→County static table |
| **Upstash Redis** | Rate limiting | No | Rate limiting disabled |
| **Playwright Core** | JS-rendered permit portals | No | HTML-only fallback |

---

## Environment Variables

### Core
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma connection string |
| `DIRECT_URL` | Yes | Direct DB URL for migrations |
| `NEXT_PUBLIC_APP_URL` | Yes | App base URL |
| `NODE_ENV` | — | development / production |

### Clerk
| Variable | Required |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes |
| `CLERK_SECRET_KEY` | Yes |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Yes |
| `NEXT_PUBLIC_CLERK_PROXY_URL` | Yes |

### AI / Embeddings
| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `AI_MODEL` | `claude-3-5-sonnet-20241022` | LLM model ID |
| `ANTHROPIC_API_KEY` | — | Required if `AI_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | — | Required if `AI_PROVIDER=openai` |
| `VOYAGE_API_KEY` | — | Voyage AI embeddings for COMEX RAG |
| `CRON_SECRET` | — | Auth header for cron endpoints |

### Google
| Variable | Purpose |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Places API (New) |
| `GOOGLE_MAPS_API_KEY` | Maps API (server-side) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps API (client-side) |
| `GOOGLE_CSE_API_KEY` | Custom Search API |
| `GOOGLE_CSE_ENGINE_ID` | CSE engine ID |

### Permits / Sources
| Variable | Default | Purpose |
|---|---|---|
| `ACCELA_APP_ID` | — | Accela REST API |
| `ACCELA_APP_SECRET` | — | Accela REST API |
| `COBB_ACA_USERNAME` | — | Cobb ACA portal |
| `COBB_ACA_PASSWORD` | — | Cobb ACA portal |
| `OPENCORPORATES_API_KEY` | — | Business registry |
| `CHROME_PATH` | Auto-detected | Playwright Chromium path |
| `PERMIT_LOOKBACK_DAYS` | `30` | Permit sync window |
| `ENRICHMENT_MAX_PAGES` | `4` | Max pages scraped per website |
| `ENRICHMENT_TIMEOUT_MS` | `10000` | Website fetch timeout |
| `JOB_STALE_MINUTES` | `30` | Stale job cleanup threshold |

---

## Scoring System

`scoreCompany(input)` in `lib/scoring/index.ts`. All weights in `lib/scoring/config.ts`.

### `leadScore` (0–100)

| Factor | Max Points | Notes |
|---|---|---|
| Geography | +15 | Target counties (Gwinnett, Hall, Forsyth, Cobb, Fulton, Cherokee); +5 for other GA |
| Segment | +20 | Industrial (+20), commercial (+15), mixed (+10), residential (+5) |
| Specialties | +15 | +6 per high-value specialty (capped), +2 per standard (capped at 6) |
| Completeness | +15 | +5 website, +5 email, +3 phone, +2 address |
| Contacts | +10 | +5 has any contact, +5 contact email, +3 contact phone |
| Language | +8 | +4 industrial terms in description, +4 commercial terms |
| AI Confidence | +3 | +3 if ≥0.75, +1 if ≥0.50 |
| Signals | +20 | +4 per signal (capped), +12/7/3 recency bonus (30/90/180 days) |
| Permits | +25 | From `permitSignalScore` |

### `activeScore` (0–100)
Weighted toward recent signal activity and permit frequency. Decays with age.

### Derived Sales Metadata
- `likelyProductDemandCategories`: switchgear, panelboards, conduit, wire, MRO, etc.
- `likelySalesMotion`: MRO / project-based / service+volume / mixed
- `likelyBuyerValue`: High / Medium-High / Medium / Low
- `outreachAngle`: specific opening line for a sales rep

---

## Data Flow Diagrams

### Enrichment Pipeline

```
Company record
    │
    ├─ Has website? ──No──► Google CSE website finder
    │                              │
    │◄─────────────────────────────┘
    │
    ▼
enrichFromWebsite(url)
    │
    ├─ Parse robots.txt → skip disallowed paths
    ├─ Fetch up to 4 pages (HTML only)
    └─ Extract: text, emails, phones, addresses
    │
    ▼
enrichWithAI(name, text, source)
    │
    ├─ Anthropic / OpenAI → structured JSON
    └─ Failure → classifyText() keyword fallback
    │
    ▼
DB update (segments, specialties, description, serviceAreas,
           employeeSizeEstimate, notes, lastEnrichedAt)
    │
    ▼
deriveCountyFromCity() or geocodeCountyFromAddress()
    │
    ▼
scoreCompany() → leadScore + activeScore written to Company
```

### Permit Sync Pipeline

```
syncPermitSignals()
    │
    ├─ Accela (Gwinnett, Hall, Atlanta)
    ├─ ACA portal scrapers
    ├─ DeKalb ArcGIS
    ├─ Cherokee PHP portal
    ├─ Cobb ACA
    └─ EnerGov (Forsyth, Jackson)
    │
    ▼
Normalize each permit record
    │
    ├─ isResidential() filter
    ├─ Upsert by (source, externalId)
    └─ Match to Company by contractorPhone HMAC → normalizedName fuzzy
    │
    ▼
Create PERMIT signal → estimatePermitValue()
    │
    ▼
Compute permitSignalScore → scoreCompany() for matched companies
```

### COMEX Data Pipeline

```
Vercel Cron (weekdays)
    │
    ├─ /comex/api/prices/sync
    │       │
    │       ├─ fetchYahooPrices(symbol) [Yahoo Finance]
    │       ├─ Upsert CommodityPrice rows
    │       ├─ computeMA(prices, 30)
    │       └─ syncPriceEvents(metal) → detect ≥0.5% moves → PriceEvent
    │
    └─ /comex/api/news/sync
            │
            ├─ Fetch RSS feeds → isRelevant() filter → inferMetal()
            ├─ embedText(snippet) [Voyage AI]
            └─ Upsert NewsArticle with embedding vector
```

```
User: POST /comex/api/agent { query, metal }
    │
    ▼
buildRAGContext(query, metal)
    ├─ Vector search: NewsArticle.embedding <=> queryEmbedding (pgvector)
    │   └─ Fallback: keyword match if pgvector unavailable
    └─ Related PriceEvent rows for metal
    │
    ▼
Inject context → Anthropic/OpenAI → stream response to client
```

---

## Scheduled Jobs

Configured in `vercel.json`:

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /comex/api/prices/sync` | 1 PM, 5 PM, 10 PM ET (weekdays) | Fetch + store daily OHLC |
| `POST /comex/api/news/sync` | 11 AM ET (weekdays) | Ingest + embed RSS news |

Leads syncs (permits, enrichment, import, job postings) are on-demand HTTP triggers from the UI. All jobs log to `CrawlJob`.

---

## Local Setup

```bash
cd atlantiskb-home
npm install
cp .env.local.example .env.local
# Fill in required env vars (DATABASE_URL, DIRECT_URL, Clerk keys at minimum)
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open `http://localhost:3000`.

Minimum required env vars to boot: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_PROXY_URL`, `NEXT_PUBLIC_APP_URL`.

All other integrations degrade gracefully (log a warning, return empty results, or enter demo mode).

---

## Database Workflow

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Apply migrations to dev DB
npx prisma migrate dev

# Apply migrations to production (also runs at build/start time)
npx prisma migrate deploy

# Optional: seed demo data
npx prisma db seed
```

### pgvector for COMEX RAG

The COMEX semantic retrieval path requires:
1. PostgreSQL `vector` extension installed.
2. `NewsArticle.embedding vector(512)` column + IVFFlat index (applied by migration).
3. `VOYAGE_API_KEY` set for embedding generation.

Check readiness at `GET /comex/api/health/schema`. The agent falls back to keyword retrieval if any condition fails.

---

## Deployment

- Target: **Vercel**.
- Build command: `npx prisma generate && npx prisma migrate deploy && next build`.
- Start command: `npx prisma migrate deploy && next start`.
- Migrations run automatically before traffic is served — never skip `migrate deploy`.
- All runtime env vars must be set in the Vercel dashboard.
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy) configured in `next.config.ts`.

### Security Hardening
- **CSP / security headers**: `next.config.ts` sets Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, and Permissions-Policy on every response.
- **Cron endpoint auth**: `/comex/api/prices/sync` and `/comex/api/news/sync` require a `CRON_SECRET` bearer token, preventing unauthorized calls to those sync endpoints.
- **PII encryption**: Contact phone numbers are encrypted at rest with AES-GCM (`lib/crypto.ts`). Lookups use a separate HMAC token so phone numbers are never decrypted for WHERE queries.
- **robots.txt compliance**: Website enrichment respects `robots.txt` disallow rules and fails closed (unreachable robots.txt = no crawl).
- **Clerk proxy**: Frontend Clerk API calls are routed through `/__clerk/*` → `/api/clerk-proxy/*` to avoid exposing the Clerk publishable key origin directly.

---

## Known Limitations

- Several permit adapters are in demo/limited mode. Live portal schemas are not confirmed for all counties.
- Long-running sync endpoints (permit sync, batch enrichment) block HTTP connections. No durable job queue.
- `* 2.ts` duplicate files exist from editor backups — not in active code paths.
- Auth checks are duplicated (middleware + per-route `auth()`), which is robust but repetitive.
- COMEX vector setup requires manual pgvector extension beyond base migration lifecycle.

## Roadmap

Planned features (in rough priority order):

1. **Lighting integration** — extend enrichment and segment classification to capture lighting contractor activity; surface as a separate demand category in scoring.
2. **Pricing from ADC / PRISM** — pull distributor pricing data into company detail views so reps can see margin context alongside lead scores.
3. **Submittal PDF generation** — generate product submittal packages from company profile + segment data for use in sales calls.
4. **Fixture schedule upload** — parse uploaded fixture schedules (PDF/Excel) and match line items to products, auto-creating signals and enriching company specialties.
