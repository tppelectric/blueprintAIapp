# ElectricalEstimator AI - System Specification

## 1. Purpose
ElectricalEstimator AI is a software platform for electrical contractors to automate blueprint scanning, electrical takeoff, estimating, load calculations, panel schedule generation, utility service design, and material price monitoring.

Primary user:
- Electrical contractors bidding residential, multifamily, and commercial projects.

Business priority:
- Immediate focus is single-company operation for the owner's electrical company.
- Architecture remains SaaS-ready for future subscription rollout.

Geographic/business context:
- Hudson Valley, NY workflows with Central Hudson and NYSEG utility considerations.

## 2. Standards and Regulatory Basis
The platform is designed to support workflows referencing:
- 2023 National Electrical Code (NEC)
- 2026 Central Hudson Blue Book
- NYSEG service requirements

Important:
- The platform provides engineering-assist automation and compliance checks.
- Final design approval remains subject to AHJ and utility review.
- Utility rules override generic assumptions when utility-specific requirements apply.

## 3. Product Scope
### Included
- Blueprint import from local, OneDrive, Google Drive, Apple Files
- Scanner pipeline with `mock` and `real` mode interfaces
- Room and symbol extraction workflow
- Legend and note extraction workflow
- Symbol review queue and confirmation
- Room-based takeoff and material estimate heuristics
- Estimating engine with finish-level multipliers
- Load calculator (NEC Article 220 style)
- Dedicated circuit estimator and panel schedule generation
- Utility service design recommendations
- Grounding design helper (NEC 250 workflow)
- Material price monitoring snapshots and brand-aware material list
- Utility compliance report scaffolding
- Dashboard and JobTread export architecture

### Not Fully Implemented Yet
- Production-trained YOLO model lifecycle and deployment
- Live supplier API integrations for automated monthly crawling
- Full utility rule engine with clause-level traceability and exception handling
- Persistent DB-backed platform outputs for all modules

## 4. System Architecture
Monorepo structure:
- `apps/web` - Next.js web application
- `apps/mobile` - Expo React Native mobile companion
- `services/api` - Fastify API service (TypeScript)
- `services/scanner` - FastAPI scanner service (Python)
- `packages/types` - shared domain schemas
- `packages/shared` - shared business logic/engines
- `infrastructure/migrations` - PostgreSQL schema migrations

### Runtime interaction
1. User interacts with web UI.
2. Web calls Next.js API proxy routes under `apps/web/src/app/api/*`.
3. Proxy forwards requests to Fastify API (`API_BASE_URL`).
4. For plan imports, API calls scanner service (`SCANNER_URL`) for split/extract.
5. API returns normalized results for UI display.

### Tenancy model
- `APP_TENANCY_MODE=single_company` (current default)
- `PRIMARY_COMPANY_ID` defines active company in single-company mode
- `x-company-id` header is only accepted when `ALLOW_DEV_TENANT_HEADER=true`; otherwise JWT tenant claim is used

## 5. Core Modules
### Module A - Blueprint Upload and Processing
- Input: PDF (current), image support path (PNG/JPG), DWG future.
- Sources: local, OneDrive, Google Drive, Apple Files.
- Processing pipeline:
  1. sheet split
  2. OCR / text extraction
  3. symbol detection
  4. room association
  5. device counts

### Module B - Symbol Detection and Legend Matching
- Mock mode: deterministic output for flow validation.
- Real mode: PDF parsing + OCR heuristics behind adapter interface.
- Symbol review queue supports user confirmation.
- Confirmed symbols can be stored as reusable mapping data.

### Module C - Takeoff and Estimating
- Room-based counts for key electrical items.
- Point-based estimating:
  - `price_per_point = labor_cost + material_cost + markup` (+ finish multiplier)
- Finish multipliers:
  - Builder Grade: `1.0`
  - Mid Range Residential: `1.3`
  - High End Residential: `1.7`
- Cost metrics include price/point and price/sqft.

### Module D - Circuits, Panel, and Load
- Dedicated circuit assignment for kitchen/laundry/bath/garage/HVAC.
- Panel schedule generation with breaker and wire descriptors.
- Load calculator supports:
  - single dwelling
  - multifamily
  - commercial
- Supported systems:
  - single 120/240
  - single 120/208
  - three 120/208
  - three 277/480

### Module E - Service and Utility Design
- Service size recommendation:
  - 150A, 200A, 320A, 400A, CT metering
- Utility service design output:
  - meter socket recommendation
  - CT cabinet requirement
  - service conductor recommendation
  - transformer coordination note
  - primary conduit installation notes
- Installation variants:
  - overhead (weatherhead/mast/drop)
  - underground (PVC/conduit/transformer pad)
- Utility logic:
  - Central Hudson Blue Book 2026 (authoritative where applicable)
  - NYSEG service requirements profile

### Module F - Grounding, Materials, Compliance, Export
- Grounding design helper for NEC 250 workflow.
- Material price monitoring snapshots with suppliers and brand references.
- Material list generation for estimate outputs.
- Compliance report scaffold with checks + status.
- Export architecture includes CSV and JobTread sync queue flow.

## 6. API Surface (Current)
Project and workflow routes:
- `GET /api/projects`
- `GET /api/projects/:projectId/dashboard`
- `POST /api/projects/:projectId/blueprint-processing`
- `POST /api/imports/plans`
- `GET /api/projects/:projectId/symbol-review`
- `POST /api/projects/:projectId/symbol-review/confirm`
- `GET /api/projects/:projectId/takeoff`
- `GET /api/projects/:projectId/exports`
- `POST /api/projects/:projectId/exports/csv`
- `POST /api/projects/:projectId/exports/jobtread-sync`

Platform routes:
- `GET /api/platform/dashboard`
- `POST /api/platform/estimate`
- `POST /api/platform/load-calculator`
- `GET /api/platform/dedicated-circuits`
- `POST /api/platform/utility-service`
- `GET /api/platform/grounding`
- `GET /api/platform/material-prices`
- `GET /api/platform/material-list`
- `GET /api/platform/compliance-report`

Scanner routes:
- `GET /health`
- `POST /scan/split-sheets`
- `POST /scan/extract`
- `POST /scan/classify-symbol`

## 7. Data Model Summary
Tenant model:
- Multi-company SaaS with `company_id` isolation
- Company-scoped user access
- Project-level data ownership by company

Core entities:
- companies
- users
- projects
- blueprints/sheets
- symbols
- takeoffs
- estimates
- load_calculations
- panel_schedules
- service_designs
- materials
- material_prices
- supplier_accounts

Migration references:
- `infrastructure/migrations/001_initial_schema.sql`
- `infrastructure/migrations/002_company_hierarchy.sql`
- `infrastructure/migrations/003_multitenant_core_tables.sql`
- `infrastructure/migrations/004_company_isolation_bridge.sql`
- `infrastructure/migrations/005_blueprint_processing_runs.sql`
- `infrastructure/migrations/006_project_workflow_text_tables.sql`
- `infrastructure/migrations/007_project_estimates_text.sql`
- `infrastructure/migrations/008_project_panel_schedules_text.sql`
- `infrastructure/migrations/009_project_service_designs_text.sql`
- `infrastructure/migrations/010_project_material_lists_text.sql`
- `infrastructure/migrations/011_project_material_price_snapshots_text.sql`
- `infrastructure/migrations/012_project_exports_and_symbol_library_text.sql`
- `infrastructure/migrations/013_text_tenant_company_fk.sql`

## 8. Configuration
Required environment variables:
- `API_PORT`
- `API_BASE_URL`
- `SCANNER_URL`
- `APP_TENANCY_MODE`
- `PRIMARY_COMPANY_ID`
- `DATABASE_URL`
- `JOBTREAD_API_KEY`
- `JOBTREAD_BASE_URL`

## 9. Non-Functional Requirements
- Security:
  - input validation on all API routes
  - controlled external integrations
- Reliability:
  - explicit fail-fast import errors if scanner or database is unavailable
- Maintainability:
  - scanner adapter interfaces for mode switching
  - shared type contracts across services
- Performance (target baseline):
  - responsive dashboard load under normal project sizes
  - asynchronous scanner processing path for large plan sets (future enhancement)

## 10. Known Gaps and Next Implementation Steps
1. Replace in-memory data layer with PostgreSQL repositories for all workflows.
2. Add production model-serving pipeline for YOLO/PyTorch inference.
3. Add scheduled material price collector (30-day cadence) with persistence and change history.
4. Expand compliance engine with clause-level traceability and report exports.
5. Add robust auth, role controls, and audit logs for production use.


