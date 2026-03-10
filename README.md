# ElectricalEstimator AI

Production-minded monorepo for electrical contractors to automate blueprint scanning, takeoff, estimating, load calculations, panel schedules, utility service design, and material monitoring.

## Standards and Ruleset Coverage
This platform is structured around:
- 2023 National Electrical Code (NEC)
- 2026 Central Hudson Blue Book
- NYSEG service requirement workflows

Important: This release provides rule-driven automation scaffolding and calculations for estimating workflows. Final utility and AHJ approval is still required for permitting and construction sign-off.

## Monorepo Layout
- `apps/web`: Next.js + TypeScript desktop web app
- `apps/mobile`: Expo React Native mobile companion app
- `services/api`: Fastify + TypeScript API service
- `backend/api`: target architecture scaffold for API boundaries (incremental migration bridge)
- `services/scanner`: FastAPI Python scanner service
- `packages/types`: shared domain schemas
- `packages/shared`: shared workflow engines, mocks, and calculations
- `infrastructure/migrations`: PostgreSQL schema migrations

## Future Platform Preparation
- `mobile-ios`: reserved for a future dedicated iOS application
- `desktop-app`: reserved for a future desktop shell
- `frontend`: reserved for future shared frontend extraction/planning
- `ai-services`: reserved for future AI service separation
- `database`: reserved for future database-specific tooling and documentation

These placeholder folders do not merge this app with any other application. They only prepare this project for future expansion.

## Implemented Platform Modules
- Blueprint import + scanner pipeline (mock and real mode interfaces)
- Project and Job workflow (multiple jobs per project)
- AI symbol/room/legend extraction interfaces
- Room-based electrical takeoff
- Point-based estimating engine with finish-level multipliers
- Cost metrics (price per point, price per sq ft)
- Dedicated circuit estimator
- Panel schedule generator
- Load calculator (NEC Article 220 style workflow)
- Service size recommendation
- Utility service design (Central Hudson / NYSEG workflow)
- Grounding system design helper
- Material price monitoring (supplier snapshots)
- Material list generator
- Utility compliance report scaffold
- Dashboard and export workflow foundation

## Requirements
- Node.js 20.x or 22.x (LTS recommended)
- Python 3.11+
- PostgreSQL 15+

Notes:
- Node 24 may cause unstable Next.js dev startup (`spawn EPERM`) in this project.
- `pnpm` is optional for daily use here; root scripts now use npm-compatible workspace runner.

## Local Setup
1. Install JavaScript workspace dependencies:
   - Preferred: `pnpm install`
   - Fallback: `npm install`
2. Install Python scanner dependencies:
   - `python -m pip install -r services/scanner/requirements.txt`
3. Install native scanner tools for real PDF/OCR processing:
   - Poppler (`pdfinfo` must be in PATH)
   - Tesseract OCR (`tesseract` must be in PATH)
4. Copy environment template:
   - `copy .env.example .env`
5. Confirm web-to-API URL (for Next.js proxy routes):
   - `API_BASE_URL=http://127.0.0.1:4000`
6. Optional mobile direct API URL (Expo app fetches API directly):
   - `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000`

## API Authentication and Tenant Isolation
- API routes under `/api/*` resolve tenant context from JWT claims first.
- Required JWT claims:
  - `sub` (user id)
  - `company_id` (tenant id)
  - `role` (user role string)
- `x-company-id` header is ignored by default and can only be used when `ALLOW_DEV_TENANT_HEADER=true`.

Environment flags:
- `APP_TENANCY_MODE=single_company` keeps single-company behavior using `PRIMARY_COMPANY_ID`.
- `APP_TENANCY_MODE=multi_company` requires valid JWT auth for API requests.
- `AUTH_REQUIRED=true` forces auth checks even in single-company mode.
- `RBAC_ENFORCED=true` enables role checks (`viewer` for read routes, `estimator`+ for write routes).
  - `POST /api/projects/:projectId/exports/jobtread-sync` requires `admin`.
- `DB_SCHEMA_CHECK_ENABLED=true` validates required database schema on API startup and exits fast if migrations are missing.
- `MATERIAL_PRICE_SCHEDULER_ENABLED=true` enables automatic 30-day material snapshot job in API process.
- `MATERIAL_PRICE_SCHEDULER_INTERVAL_MS=3600000` sets scheduler polling interval (minimum 60s).
- `SCANNER_REAL_REQUIRE_YOLO=true` forces real scanner mode to fail if YOLO model is unavailable.

## Run Services
- Run environment diagnostics:
  - `npm run doctor`
- Start API:
  - `npm run dev:api`
- Start scanner:
  - `npm run dev:scanner`
  - Windows quick start: double-click `Start Scanner Service.cmd`
- Start only web:
  - `npm run dev:web`
  - Windows quick start: double-click `Start Web App.cmd`
- Start only mobile:
  - `npm run dev:mobile`
- Start full local app:
  - double-click `Open Full App.cmd`
  - or run `powershell -ExecutionPolicy Bypass -File .\scripts\open-blueprint-app.ps1`
- Start services without keeping PowerShell windows open:
  - double-click `Open Full App (Background).cmd`
  - or use `Start API Server (Background).cmd`, `Start Scanner Service (Background).cmd`, and `Start Web App (Background).cmd`
  - background logs are written to `api-runtime.log`, `scanner-runtime.log`, and `web-runtime.log`
- Open the separate second app:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\open-second-app.ps1`
- Open both applications in separate PowerShell windows:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\open-both-apps.ps1`

Validation scripts:
- `npm run typecheck`
- `npm run build`
- `npm run test`

## Scanner Modes
Scanner endpoints support `scan_mode`:
- `mock` (default): deterministic outputs for fast testing
- `real`: uses real PDF parsing (`pdfplumber`) and OCR (`pytesseract`) modules through adapter interfaces
- In real mode, YOLO/OpenCV fallback behavior can be restricted by setting `SCANNER_REAL_REQUIRE_YOLO=true` (request fails if YOLO model is unavailable)

Example payload for extraction:
```json
{
  "project_id": "p-001",
  "sheet_id": "E1.1",
  "file_name": "C:/plans/project.pdf",
  "scan_mode": "real"
}
```

## Automatic Scanner Import Flow
When importing plans from the web flow or API, the system now automatically:
1. Splits the PDF into sheets using scanner `/scan/split-sheets`
2. Runs extraction for each sheet using scanner `/scan/extract`
3. Ingests detected sheets, rooms, symbols, notes, and legends into project data

If the scanner service or database is unavailable, import fails with a clear API error. No mock fallback import is written.

Core workflow endpoints now require real persisted project data:
- `/api/projects`
- `/api/projects/:projectId/dashboard`
- `/api/projects/:projectId/takeoff`
- `/api/projects/:projectId/estimate` (POST)
- `/api/projects/:projectId/material-list` (POST)

## Database Schema
Initial PostgreSQL schema is in:
- `infrastructure/migrations/001_initial_schema.sql`

Recent workflow tables and hardening migrations are in:
- `infrastructure/migrations/006_project_workflow_text_tables.sql`
- `infrastructure/migrations/012_project_exports_and_symbol_library_text.sql`
- `infrastructure/migrations/013_text_tenant_company_fk.sql`
- `infrastructure/migrations/README.md` (canonical active migration order)

## API Startup Guard
On startup, the API checks required workflow schema before accepting requests:
- required tables
- required columns
- required indexes
- required tenant FK constraints for text workflow tables
- `project_symbol_library` unique key on `(company_id, symbol_key)`

If checks fail, the process exits with an error telling you to run migrations first.

Schema status endpoint:
- `GET /health/schema` returns read-only schema check details (`ok/error` plus missing tables/columns/indexes/FK constraints).


## Web API Proxies
Next.js routes under `apps/web/src/app/api/*` proxy browser requests to Fastify (`API_BASE_URL`) and forward tenant/auth headers (`Authorization`, optional `x-company-id` when enabled).

## Project -> Job Workflow
Core hierarchy now supported:
- Company
- Projects
- Jobs
- Plans / Takeoffs / Estimates / Load + Service workflows / Reports

New API endpoints:
- `POST /api/projects` create project
- `GET /api/projects/:projectId/jobs` list jobs for project
- `POST /api/projects/:projectId/jobs` create job in project
- `GET /api/projects/:projectId/jobs/:jobId/workspace` load job-scoped workspace summary

Job-scoped endpoints accept `jobId` (query for GET, JSON field for POST) so calculations and AI results can be isolated per job.

## Field-Test Readiness Check
Before internal field testing (real plan import + AI takeoff), run:

- `powershell -ExecutionPolicy Bypass -File .\scripts\field-test-preflight.ps1`

This verifies:
- Node.js available
- Python runtime available (required for scanner service)
- `.env` exists
- Web app responds on `http://127.0.0.1:3000`
- API health responds on `http://127.0.0.1:4000/health`
- API schema endpoint responds on `http://127.0.0.1:4000/health/schema`
- Scanner health responds on `http://127.0.0.1:8001/health`

If any check fails, fix those first. Real import and takeoff processing requires all checks to pass.

Detailed test flow checklist:
- `docs/field-test-checklist.md`

Platform roadmap reference:
- `docs/platform-strategy.md`
