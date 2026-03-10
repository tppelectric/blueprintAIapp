# ElectricalEstimator AI - Architecture

## Overview
ElectricalEstimator AI is a monorepo platform for blueprint-driven electrical estimating and service design.

Primary runtime layers:
1. Web UI (`apps/web`) and Mobile UI (`apps/mobile`)
2. API layer (`services/api`)
3. Scanner pipeline (`services/scanner`)
4. Shared domain/contracts (`packages/types`, `packages/shared`)
5. Data/persistence (`PostgreSQL`, migrations under `infrastructure/migrations`)

## Repository Structure
- `apps/web`: Next.js UI and API proxy routes for browser-safe backend access.
- `apps/mobile`: Expo companion app for field and quick estimate views.
- `services/api`: Fastify service exposing project workflows and platform calculation endpoints.
- `backend/api`: architecture scaffold mirror for API boundaries (re-export bridge during migration).
- `services/scanner`: FastAPI service for sheet split, OCR extraction, and symbol detection.
- `packages/types`: Shared TypeScript interfaces used by web/API/shared engines.
- `packages/shared`: Business logic engines (estimating, load calc, utility design, mock state).
- `infrastructure/migrations`: SQL schema migration files.

## Request Flow
### Project workflow (web)
1. User action in web page.
2. Web calls Next.js API route under `apps/web/src/app/api/*`.
3. Route proxies to Fastify (`API_BASE_URL`).
4. Fastify processes request and returns normalized JSON.
5. UI renders updated state.

### Import + scanner flow
1. Web/API receives import request.
2. API calls scanner `/scan/split-sheets`.
3. API loops through detected sheets and calls `/scan/extract`.
4. API ingests sheets/rooms/symbols/notes/legends into project state layer.
5. Dashboard/takeoff/review pages refresh with new results.

## Scanner Architecture
Scanner supports two modes through adapter interfaces:
- `mock`: deterministic outputs for stable test flow.
- `real`: PDF parsing + OCR + CV/YOLO symbol detection path.

Key abstractions:
- `ScannerAdapter` interface (`pipelines/interfaces.py`)
- Adapter factory (`pipelines/factory.py`)
- Pipeline entry (`pipelines/blueprint_pipeline.py`)

## Platform Engine Architecture
Core calculations live in `packages/shared/src/platform-engine.ts`.

Rule-domain modules (Phase 1 stabilization):
- NEC/domain logic: `packages/shared/src/modules/electrical-code/*`
- Utility profile logic: `packages/shared/src/modules/utility-rules/*`
- Target architecture scaffolds:
  - `backend/modules/electrical_code/*`
  - `backend/modules/utility_rules/*`

Main engines:
- Estimating engine
- Dedicated circuit estimator
- Panel schedule generator
- Load calculator
- Service size recommendation
- Utility service design
- Grounding design
- Material pricing monitor
- Material list generation
- Compliance report generation

API exposure:
- `services/api/src/routes/platform.ts`

## Data Model
Baseline entities:
- projects
- sheets
- rooms
- symbols
- legends
- notes
- panel_schedules
- fixture_schedules
- takeoffs
- material_estimates
- export_jobs

See:
- `infrastructure/migrations/001_initial_schema.sql`

## Integration Boundaries
- JobTread integration is represented by export and sync queue endpoints.
- Utility logic is encoded in service design workflows and will be expanded with deeper rule engines.
- Material price monitoring currently uses snapshot logic and can be replaced by scheduled collectors.

## Reliability and Fallbacks
- Scanner import does not write fallback records when scanner/database is unavailable; import fails with explicit API error.
- Web-to-API proxy decouples browser from direct backend host settings.
- Shared type contracts reduce UI/API shape drift.

## Deployment Notes
- Web and API can run independently with `API_BASE_URL` for proxy routing.
- Scanner runs as separate service and is referenced by API via `SCANNER_URL`.
- PostgreSQL should be provisioned for production persistence as the next phase.
- Optional material price scheduler can run in API process (`MATERIAL_PRICE_SCHEDULER_ENABLED=true`) and capture due 30-day snapshots.

## Domain Hierarchy
```
Company
  ├── Users
  ├── Projects
  │      ├── Blueprints
  │      ├── Takeoffs
  │      ├── Estimates
  │      ├── Load Calculations
  │      ├── Panel Schedules
  │      ├── Service Designs
  │      └── Material Lists
  └── Supplier Integrations
```

Database mapping:
- Company: `companies`
- Users: `users`, `company_users`
- Projects: `projects` (now linked to company/user)
- Blueprints: `sheets`
- Takeoffs: `takeoffs`
- Estimates: `estimates`
- Load Calculations: `load_calculations`
- Panel Schedules: `panel_schedules`
- Service Designs: `service_designs`
- Material Lists: `material_lists`
- Supplier Integrations: `supplier_integrations`
