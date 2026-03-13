# atlantiskb-home

Private tool launchpad for Atlantis KB — an electrical distribution operation serving Metro Atlanta and North Georgia. Auth-gated via Clerk. One page, no database, no API routes. Tools are defined in a single config file; adding a new entry renders a new card automatically.

---

## Tools

| Index | Name | Status | URL | Category |
|-------|------|--------|-----|----------|
| 01 | Leads | Live | leads.atlantiskb.com | Lead Generation |

**Leads** — Permit-driven contractor lead engine. Scores, enriches, and surfaces electrical contractors ready to buy, based on permit activity in Metro Atlanta and North Georgia.

---

## Stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- **Clerk v7** — authentication, session management, user identity
- No database. No API routes. No ORM.

---

## Getting started

**1. Install dependencies**

```bash
npm install
```

**2. Create a Clerk application**

Go to [dashboard.clerk.com](https://dashboard.clerk.com), create a new application, and copy the API keys from the **API Keys** tab.

**3. Configure environment variables**

Create `.env.local` in the project root:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (starts with `pk_`) |
| `CLERK_SECRET_KEY` | Clerk secret key (starts with `sk_`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in route — set to `/sign-in` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Post-login redirect — set to `/` |

**4. Run locally**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated requests are redirected to `/sign-in`.

---

## Adding a tool

Edit `lib/tools.config.ts`. Add an entry to the `tools` array:

```ts
{
  id: 'quotes',           // unique identifier, kebab-case
  index: '02',            // display number shown on the card
  name: 'Quotes',         // card title
  description: 'Generate and track job quotes for commercial electrical projects.',
  tag: 'Sales',           // category label shown at card bottom
  url: 'https://quotes.atlantiskb.com',  // null if not yet deployed
  status: 'live',         // 'live' | 'coming-soon'
}
```

That is the only change needed. The card renders automatically. Setting `status: 'coming-soon'` renders a dashed placeholder instead of a clickable card.

---

## Deployment

Deploy to Vercel. Connect the repository, add the four environment variables from `.env.local` to the Vercel project settings, and set the custom domain to `atlantiskb.com`.

Each tool runs on its own subdomain (`leads.atlantiskb.com`, etc.) as a separate application. This launchpad only links to them — it does not host them.

Available scripts:

```bash
npm run build   # production build
npm run start   # run production build locally
npm run lint    # ESLint
```

---

## COMEX setup (pgvector + Prisma)

When enabling COMEX semantic search, run these steps in this exact order:

1. Enable `pgvector` **before** Prisma migrations:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. Run the Prisma migration.

3. Execute the SQL below:

   ```sql
   ALTER TABLE "NewsArticle" ADD COLUMN IF NOT EXISTS embedding vector(512);
   CREATE INDEX ON "NewsArticle" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
   ```

> **Important:** Voyage model embeddings are **512 dimensions**, so the database column must be `vector(512)` to match.

---

## Design system

The UI follows a Microsoft Fluent-inspired aesthetic: utilitarian, white-surface, red accent. Key rules:

- **Font**: `'Segoe UI', system-ui, -apple-system` — no external font imports
- **No border-radius**: Cards, buttons, and inputs use `border-radius: 0`
- **Red accent** (`#d13438`): Used only for the topbar background, live card top border, submit button, and focus rings
- **Shadows over borders**: Cards use `box-shadow` for depth, not visible borders
- **Body background**: `#f3f3f3` — not white

All values are defined as CSS variables in `app/globals.css`:

```css
--bg: #f3f3f3
--surface: #ffffff
--accent: #d13438
--accent-dark: #a4262c
--live: #107c10
--live-bg: #dff6dd
--shadow-sm / --shadow-md / --shadow-lg
--text-primary / --text-secondary / --text-muted
```

Changes to layout, spacing, or component styling should use these variables rather than hardcoded values.
