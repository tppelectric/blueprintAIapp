# API Specification

## Health
- `GET /health`
- `GET /health/schema`

## Authentication and Tenant Scope
- API routes under `/api/*` are tenant-scoped.
- Company is resolved in this order:
1. JWT `company_id` claim
2. `x-company-id` header only when `ALLOW_DEV_TENANT_HEADER=true`
3. `PRIMARY_COMPANY_ID` fallback for single-company mode
- Strict auth is enabled when:
1. `APP_TENANCY_MODE=multi_company`, or
2. `AUTH_REQUIRED=true`
- Optional RBAC can be enabled with `RBAC_ENFORCED=true`:
1. `viewer` minimum for `GET` routes
2. `estimator` minimum for write routes (`POST/PUT/PATCH/DELETE`)
3. `admin` required for `/api/projects/:projectId/exports/jobtread-sync`

## Project Dashboard
- `GET /api/projects`
- `GET /api/projects/:projectId/dashboard`

## Blueprint Processing
- `POST /api/projects/:projectId/blueprint-processing`
  - body: `{ fileName, scanMode? }`
  - Runs scanner split + extraction, persists run results, and returns detected rooms + device counts + runId
- `GET /api/projects/:projectId/blueprint-processing-runs`
  - Returns recent persisted runs for project + company scope

## Plan Imports
- `POST /api/imports/plans`
  - body: `{ projectId, source, fileName?, scanMode? }`
  - `scanMode`: `mock` (default) or `real`
  - Runs scanner split/extract per detected sheet and persists project workflow records
  - If scanner/database is unavailable, request fails (no mock import fallback write)

## Symbol Review
- `GET /api/projects/:projectId/symbol-review`
- `POST /api/projects/:projectId/symbol-review/confirm`
  - body: `{ detectionId, confirmedType }`

## Takeoff
- `GET /api/projects/:projectId/takeoff`
  - Returns persisted/project-derived takeoff summary

## Estimate
- `GET /api/projects/:projectId/estimate`
- `POST /api/projects/:projectId/estimate`
  - body (optional defaults): `{ laborCostPerPoint, materialCostPerPoint, markupMultiplier, baseLaborHoursPerPoint, finishLevel }`
  - Requires scanned room/symbol data
- `GET /api/projects/:projectId/estimate/metrics`

## Panel Schedule
- `GET /api/projects/:projectId/panel-schedule`
- `POST /api/projects/:projectId/panel-schedule`
  - body: `{ includeDefaults?: boolean }`

## Service Design
- `GET /api/projects/:projectId/service-design`
- `POST /api/projects/:projectId/service-design`
  - body: `{ provider, serviceAmps, continuousLoadAmps?, installationType }`
  - Central Hudson override applies when `continuousLoadAmps > 320` (forces CT metering)

## Material List
- `GET /api/projects/:projectId/material-list`
- `POST /api/projects/:projectId/material-list`
  - Generates from takeoff-derived materials
  - Returns `409` when required takeoff data is missing

## Material Prices
- `GET /api/projects/:projectId/material-prices`
- `POST /api/projects/:projectId/material-prices`
  - body: `{ source?: "manual" | "scheduled_30_day" }`

## JobTread Outputs
- `GET /api/projects/:projectId/exports`
- `POST /api/projects/:projectId/exports/csv`
- `POST /api/projects/:projectId/exports/jobtread-sync`

## Platform Reference Endpoints
These are company-scoped reference engines and not project-persisted workflow endpoints.
- `GET /api/platform/dashboard`
- `POST /api/platform/estimate`
- `POST /api/platform/load-calculator`
- `GET /api/platform/dedicated-circuits`
- `POST /api/platform/utility-service`
- `GET /api/platform/grounding`
- `GET /api/platform/material-prices`
- `GET /api/platform/material-list`
- `GET /api/platform/compliance-report`
