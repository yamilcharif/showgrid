# ShowGrid

B2B marketplace for live-event gear and crew. Rental houses list inventory synced from Rentman or Flex; techs and engineers list their skills. Search by problem, place and dates. Live at show-grid.com (not deployed yet).

## Run it

Copy `.env.example` to `.env.local` and fill in the Supabase values, then:

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## What's here

- `src/app` — pages (Next.js 16 App Router)
- `src/components` — search bar, location type-ahead, results, gear list drawer
- `src/lib/search.ts` — query parsing, distance, availability, money formatting
- `src/lib/sample-data.ts` — example companies, gear and crew (replaced by Supabase later)
- `src/lib/places.ts` — city/country list (replaced by a geocoding service later)
- `supabase/migrations` — database schema (applied to the Supabase project)
- `prototype/showgrid.html` — the original clickable mockup

## Next

1. ~~Connect Supabase: sign-in by email link, company and crew profiles.~~ Done (`/sign-in`, `/account`).
2. ~~Messages~~ Done. Next: sending gear lists as requests.
3. ~~Rentman sync (server-side, encrypted tokens)~~ Done: token in Supabase Vault, `src/lib/rentman.ts`, nightly via `/api/cron/sync` (Vercel Cron, needs `CRON_SECRET`). Flex next.
4. Deploy to Vercel on show-grid.com.
