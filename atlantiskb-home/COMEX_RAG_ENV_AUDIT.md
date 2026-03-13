# COMEX + RAG Environment Variable Audit

Scope reviewed:
- `app/comex/api/*`
- `lib/comex/*`
- Prisma DB setup (`prisma/schema.prisma`, `lib/db.ts`)
- Auth setup (`@clerk/nextjs` usage and Clerk proxy route)
- External clients used by COMEX/RAG flows (Anthropic, Voyage)

## 1) Required new env vars (add in Vercel)

- `ANTHROPIC_API_KEY` — required for `app/comex/api/agent` to call Anthropic Messages API.
- `DATABASE_URL` — required by Prisma datasource for COMEX/RAG reads/writes.
- `DIRECT_URL` — required by Prisma datasource (`directUrl`) for direct DB access in Prisma operations.
- `NEXT_PUBLIC_CLERK_PROXY_URL` — required only if using the custom Clerk proxy route (`/api/clerk-proxy`) in production.

## 2) Optional env vars

- None in COMEX/RAG scope.

## 3) Already-existing env vars the feature depends on

- `VOYAGE_API_KEY` — used by `lib/comex/embeddings.ts` to create embeddings for RAG ingestion/retrieval.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — required for Clerk client/auth initialization.
- `CLERK_SECRET_KEY` — required for Clerk server-side auth and Clerk proxy headers.

## 4) Referenced-in-code but missing from `.env.local.example`

- `ANTHROPIC_API_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_CLERK_PROXY_URL`

Notes:
- `NODE_ENV` is referenced in `lib/db.ts` but is provided by Vercel automatically.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` exist in `.env.local.example`; they are auth UX settings, not COMEX/RAG-specific runtime dependencies.
