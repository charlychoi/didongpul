# Dashboard v2 Deployment Checklist

v2 production must be deployed from the `dashboard-v2-poc` branch to the Vercel
project `didongpul-dashboard`.

Do not treat a GitHub push as a completed deployment. The Vercel production site
must be verified after deployment because this project may be deployed manually.

## Required Checks Before Deployment

```bash
npm run test:v2-db-isolation
npm run build
```

## Production Deployment

Deploy only the v2 project:

```bash
vercel deploy --prod --scope charlychoi
```

The deployment must show:

- Project: `charlychoi/didongpul-dashboard`
- Target: `production`
- Git ref or source branch: `dashboard-v2-poc`
- Alias: `https://didongpul-dashboard.vercel.app`

## Required Checks After Deployment

```bash
npm run test:v2-production
```

This check fails if production still serves the old login form with
`type="email"` or if the v2 API returns a non-JSON error response.

## Manual Browser Check

Open:

```text
https://didongpul-dashboard.vercel.app/login
```

Confirm the login field shows `아이디` and accepts IDs such as `sangsang1`
without a browser email validation warning.

## v1 Isolation

Do not deploy this worktree to `https://ssw-dashboard-two.vercel.app/`.
That domain is the existing v1 operation site.
