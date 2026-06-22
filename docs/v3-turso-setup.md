# Dashboard v3 Turso/libSQL Setup

v3 uses Turso/libSQL as the long-term warehouse database.

## Required Environment Variables

Local development can use a file database:

```bash
V3_DATABASE_URL="file:./didong-v3-local-warehouse.db"
```

Production must use Turso:

```bash
V3_DATABASE_URL="libsql://didong-dashboard-v3-{org}.turso.io"
V3_DATABASE_AUTH_TOKEN="..."
```

`DATABASE_URL` is kept only for the existing auth/account compatibility layer and must not be reused as the v3 warehouse database.

## Recommended Turso Database

- Database name: `didong-dashboard-v3`
- Region: choose the closest region to the Vercel deployment region or Seoul/Korea users if available.
- Purpose: v3 raw API records, sync jobs, daily summaries, monthly summaries.

## Initialization

After setting Turso environment variables, initialize the v3 warehouse tables:

```bash
npm run db:v3:init
```

This creates:

- `dashboard_v3_api_cache`
- `dashboard_v3_sync_jobs`
- `dashboard_v3_raw_records`
- `dashboard_v3_daily_center_summary`
- `dashboard_v3_monthly_center_summary`

## Sync Test

Run a small sync first:

```bash
npm run sync:v3 -- --start=2026-06-19 --end=2026-06-19 --center=2
```

Expected behavior:

- raw records are upserted into `dashboard_v3_raw_records`
- daily summaries are updated in `dashboard_v3_daily_center_summary`
- monthly summaries are updated in `dashboard_v3_monthly_center_summary`

For 2026-06-19 Gangdong, the current deduped visit count should be 172.

To verify that repeated dashboard queries reuse the warehouse:

```bash
npm run test:v3-warehouse-cache
```

The first lookup may store API results in the warehouse. The second lookup must return from `db` with no additional API fetch.

## Production Checks

```bash
NODE_ENV=production npm run test:v3-turso-config
npm run test:v3-db-isolation
npm run build
```

Do not deploy v3 with `V3_DATABASE_URL=file:...` in production.
