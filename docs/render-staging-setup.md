# Render Staging Setup

## Purpose
This setup creates a separate staging environment for outside testers while keeping local development unchanged.

Use branch:
- `staging-prep`

## Services Included
- `blueprint-staging-web`
- `blueprint-staging-api`
- `blueprint-staging-scanner`
- `blueprint-staging-db`

Files:
- `render.yaml`
- `infrastructure/docker/web.Dockerfile`
- `infrastructure/docker/api.Dockerfile`
- `infrastructure/docker/scanner.Dockerfile`

## Local Safety
This does not replace local development.

Your local setup stays:
- web on `127.0.0.1:3000`
- API on `127.0.0.1:4000`
- scanner on `127.0.0.1:8001`

## Render Deployment Order
1. Push the `staging-prep` branch to GitHub.
2. In Render, create a new Blueprint from the repo using `render.yaml`.
3. Let Render provision the database and three services.
4. After Render creates public URLs, fill in the unsynced environment values:
   - `WEB_URL`
   - `API_PUBLIC_URL`
   - `API_BASE_URL`
   - `SCANNER_URL`
   - `CORS_ALLOWED_ORIGINS`
5. Redeploy the API and web services after those values are set.

## Required URL Mapping
- `WEB_URL`
  - the public URL of `blueprint-staging-web`
- `API_PUBLIC_URL`
  - the public URL of `blueprint-staging-api`
- `API_BASE_URL`
  - for the web service, set this to the public URL of `blueprint-staging-api`
- `SCANNER_URL`
  - for the API service, set this to the public URL of `blueprint-staging-scanner`
- `CORS_ALLOWED_ORIGINS`
  - set this to the public URL of `blueprint-staging-web`

## Staging Behavior
- local remains on `PLAN_STORAGE_MODE=local`
- staging uses `PLAN_STORAGE_MODE=api_proxy`
- uploads from outside testers go to the API
- the scanner receives a signed URL and downloads each file for processing

## Notes
- The scanner Docker image installs `poppler-utils` and `tesseract-ocr`
- `SCANNER_REAL_REQUIRE_YOLO` remains `false` by default for safer initial staging rollout
- use mock mode first, then enable real scanning with outside testers after scanner health is confirmed

## Recommended First Test
1. open staging sign-in page
2. create a company
3. create a project
4. upload a small plan from Project Controls
5. confirm the plan appears in:
   - project dashboard
   - reports page
6. test export generation

## Rollback
If this setup does not work as expected:
1. stay off `main`
2. revert to the previous commit on `staging-prep`
3. or delete the Render staging services

Local development will remain unchanged.
