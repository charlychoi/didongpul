# Dashboard v3 Deployment Checklist

v3 production must be deployed from the `dashboard-v3-poc` branch to the Vercel
project `didongpul-dashboard-v3`.

Do not treat a GitHub push as a completed deployment. The Vercel production site
must be verified after deployment because this project may be deployed manually.

## Required Checks Before Deployment

```bash
npm run test:v3-db-isolation
NODE_ENV=production npm run test:v3-turso-config
npm run test:v3-warehouse-cache
npm run build
```

Production environment variables must include:

- `V3_DATABASE_URL=libsql://...`
- `V3_DATABASE_AUTH_TOKEN=...`
- `V3_SYNC_SECRET=...`
- `DIDONG_API_KEY=...`

Initialize the Turso warehouse before the first sync:

```bash
npm run db:v3:init
```

## Production Deployment

Deploy only the v3 project:

```bash
vercel deploy --prod --scope charlychoi
```

The deployment must show:

- Project: `charlychoi/didongpul-dashboard-v3`
- Target: `production`
- Git ref or source branch: `dashboard-v3-poc`
- Alias: `https://didongpul-dashboard-v3.vercel.app`

## Required Checks After Deployment

```bash
npm run test:v3-production
```

This check fails if production still serves the old login form with
`type="email"` or if the v3 API returns a non-JSON error response.

## Manual Browser Check

Open:

```text
https://didongpul-dashboard-v3.vercel.app/login
```

Confirm the login field shows `아이디` and accepts IDs such as `sangsang1`
without a browser email validation warning.

## v1 Isolation

Do not deploy this worktree to `https://ssw-dashboard-two.vercel.app/`.
That domain is the existing v1 operation site.
