# Migration Baseline (Stabilization)

To keep runtime stable, use the active project-workflow migration chain:

1. `005_blueprint_processing_runs.sql`
2. `006_project_workflow_text_tables.sql`
3. `007_project_estimates_text.sql`
4. `008_project_panel_schedules_text.sql`
5. `009_project_service_designs_text.sql`
6. `010_project_material_lists_text.sql`
7. `011_project_material_price_snapshots_text.sql`
8. `012_project_exports_and_symbol_library_text.sql`
9. `013_text_tenant_company_fk.sql`
10. `014_legend_symbols_and_symbol_learning.sql`
11. `015_legend_symbol_image_nullable.sql`
12. `016_company_settings_and_supplier_accounts.sql`
13. `017_project_jobs_and_job_scoping.sql`
14. `018_project_load_calculations_text.sql`
15. `019_project_wifi_designs_text.sql`
16. `020_auth_users_text.sql`
17. `021_auth_password_resets_text.sql`
18. `022_tally_and_fixture_library.sql`
19. `023_project_scan_jobs.sql`
20. `024_company_wifi_network_scans.sql`

Notes:
- `001` to `004` are legacy baseline migrations and are not the canonical runtime schema for current app routes.
- Schema guard in `services/api/src/db/schema-guard.ts` validates the active chain tables/columns/indexes/FKs.
- Run migrations in order on a fresh database for predictable startup behavior.
