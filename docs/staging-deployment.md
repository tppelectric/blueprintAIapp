# Staging Deployment Plan

## Goal
Create a separate staging environment for outside testers without changing or replacing the local development setup.

Local development remains:
- web on `http://127.0.0.1:3000`
- API on `http://127.0.0.1:4000`
- scanner on `http://127.0.0.1:8001`

Staging becomes:
- a separate web URL
- a separate API URL
- a separate database
- optionally a separate scanner URL

## Recommended Hosting Layout
- Web: a hosted Node-capable platform for `apps/web`
- API: Railway or Render for `services/api`
- Database: hosted PostgreSQL attached to the staging API
- Scanner: separate Python service only if outside testers need plan import and AI scan flow

## Important Constraint
The current web import route writes uploaded files to local disk before forwarding them to the API.

File:
- `apps/web/src/app/api/projects/imports/plans/route.ts`

This means staging should use a host that supports a writable runtime path, or the upload flow should be moved to object storage in a later phase.

## Minimum Safe Staging Settings
- `NODE_ENV=production`
- `APP_TENANCY_MODE=multi_company`
- `AUTH_REQUIRED=true`
- `RBAC_ENFORCED=true`
- `ALLOW_DEV_TENANT_HEADER=false`
- explicit `JWT_SECRET`
- explicit `SESSION_SECRET`
- explicit `RESET_TOKEN_SECRET`
- explicit `CORS_ALLOWED_ORIGINS`
- separate staging `DATABASE_URL`

Use:
- `.env.staging.example`

Do not reuse:
- local `.env`
- local database
- local upload directory

## Rollback Protection
- staging work should stay on a separate branch until approved
- keep staging environment variables separate from local `.env`
- use a separate staging database
- do not remove current local startup scripts
- merge only after staging passes review

If staging does not work correctly:
1. stop using the staging branch
2. revert only staging-related commits
3. keep local development unchanged

## Recommended Rollout Order
1. Deploy API and staging database
2. Run database migrations on staging
3. Deploy web app with staging `API_BASE_URL`
4. Confirm sign-in, project creation, and reports
5. Add scanner service only if outside testers need imports and scan processing

## Suggested First External Test Scope
Start with:
- sign-in
- projects
- jobs
- dashboard
- estimates
- reports

Delay until later if needed:
- live plan upload
- scanner extraction
- OCR/CV processing

## Local Development Protection
Nothing in staging should replace local commands or local URLs.

Continue using local commands for development:
- `npm run dev:web`
- `npm run dev:api`
- `npm run dev:scanner`
- `Open Full App.cmd`
- `Open Full App (Background).cmd`
