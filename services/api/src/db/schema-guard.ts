import { getDbPool } from "./postgres.js";

const REQUIRED_TABLE_COLUMNS: Record<string, readonly string[]> = {
  tenant_companies: ["id", "display_name", "created_at", "updated_at"],
  project_jobs: ["id", "company_id", "project_id", "job_name", "job_type", "description", "status", "created_at"],
  project_blueprints: ["id", "company_id", "project_id", "job_id", "source", "file_name", "created_at"],
  project_rooms: ["id", "company_id", "project_id", "job_id", "name", "area_sq_ft", "created_at"],
  project_symbol_detections: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "symbol_type",
    "confidence",
    "needs_review",
    "bbox_json",
    "page_number",
    "detection_source",
    "ai_candidate_type",
    "legend_similarity_score",
    "created_at"
  ],
  project_notes: ["id", "company_id", "project_id", "job_id", "category", "note_text", "impacts_scope", "created_at"],
  project_estimates: ["id", "company_id", "project_id", "job_id", "points_json", "pricing_json", "estimate_json", "created_at"],
  project_panel_schedules: ["id", "company_id", "project_id", "job_id", "source_json", "schedule_json", "created_at"],
  project_service_designs: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "provider",
    "service_amps",
    "installation_type",
    "service_size",
    "design_json",
    "created_at"
  ],
  project_material_lists: ["id", "company_id", "project_id", "job_id", "source", "items_json", "created_at"],
  project_material_price_snapshots: ["id", "company_id", "project_id", "job_id", "source", "prices_json", "created_at"],
  blueprint_processing_runs: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "source_file_name",
    "scan_mode",
    "processed_sheets",
    "detected_rooms_json",
    "device_counts_json",
    "extraction_payload_json",
    "created_at"
  ],
  blueprint_processing_sheet_results: [
    "id",
    "run_id",
    "company_id",
    "project_id",
    "job_id",
    "symbols_detected",
    "rooms_detected",
    "notes_detected",
    "created_at"
  ],
  project_scan_jobs: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "source",
    "file_name",
    "scan_mode",
    "status",
    "progress_percent",
    "current_step",
    "error_message",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at"
  ],
  company_wifi_network_scans: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "scan_name",
    "input_json",
    "result_json",
    "created_at"
  ],
  project_export_jobs: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "export_type",
    "status",
    "details",
    "created_at",
    "updated_at"
  ],
  project_symbol_library: ["id", "company_id", "symbol_key", "confirmed_symbol_type", "notes", "created_at"],
  project_legend_symbols: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "blueprint_id",
    "symbol_image",
    "symbol_description",
    "symbol_class",
    "source_page_number",
    "needs_review",
    "created_at"
  ],
  project_symbol_corrections: [
    "id",
    "company_id",
    "project_id",
    "job_id",
    "detection_id",
    "previous_symbol_type",
    "corrected_symbol_type",
    "created_at"
  ],
  company_settings: [
    "id",
    "company_id",
    "default_labor_rate",
    "apprentice_labor_rate",
    "labor_burden_percentage",
    "material_markup_percentage",
    "overhead_percentage",
    "profit_margin_percentage",
    "preferred_wire_brand",
    "preferred_device_brand",
    "preferred_breaker_brand",
    "default_utility_provider",
    "default_voltage_system",
    "electrical_code_version",
    "default_price_per_point",
    "default_cost_per_square_foot",
    "default_labor_hours_per_point",
    "default_crew_size",
    "load_calculation_method",
    "created_at",
    "updated_at"
  ],
  supplier_accounts: [
    "id",
    "company_id",
    "supplier_name",
    "username",
    "encrypted_password",
    "api_token",
    "last_login",
    "created_at",
    "updated_at"
  ],
  auth_users: [
    "id",
    "company_id",
    "email",
    "full_name",
    "role",
    "password_hash",
    "is_active",
    "created_at",
    "updated_at"
  ],
  auth_password_resets: [
    "id",
    "company_id",
    "user_id",
    "email",
    "token_hash",
    "expires_at",
    "used_at",
    "created_at"
  ]
};

const REQUIRED_INDEX_NAMES = [
  "idx_project_jobs_company_id",
  "idx_project_jobs_project_id",
  "idx_project_jobs_company_project",
  "idx_project_blueprints_company_id",
  "idx_project_blueprints_project_id",
  "idx_project_blueprints_job_id",
  "idx_project_rooms_company_id",
  "idx_project_rooms_project_id",
  "idx_project_rooms_job_id",
  "idx_project_symbol_detections_company_id",
  "idx_project_symbol_detections_project_id",
  "idx_project_symbol_detections_job_id",
  "idx_project_notes_company_id",
  "idx_project_notes_project_id",
  "idx_project_notes_job_id",
  "idx_project_estimates_company_id",
  "idx_project_estimates_project_id",
  "idx_project_estimates_job_id",
  "idx_project_panel_schedules_company_id",
  "idx_project_panel_schedules_project_id",
  "idx_project_panel_schedules_job_id",
  "idx_project_service_designs_company_id",
  "idx_project_service_designs_project_id",
  "idx_project_service_designs_job_id",
  "idx_project_material_lists_company_id",
  "idx_project_material_lists_project_id",
  "idx_project_material_lists_job_id",
  "idx_project_material_price_snapshots_company_id",
  "idx_project_material_price_snapshots_project_id",
  "idx_project_material_price_snapshots_job_id",
  "idx_blueprint_processing_runs_company_id",
  "idx_blueprint_processing_runs_project_id",
  "idx_blueprint_processing_runs_job_id",
  "idx_blueprint_processing_sheet_results_run_id",
  "idx_blueprint_processing_sheet_results_company_id",
  "idx_blueprint_processing_sheet_results_project_id",
  "idx_blueprint_processing_sheet_results_job_id",
  "idx_project_scan_jobs_company_id",
  "idx_project_scan_jobs_project_id",
  "idx_project_scan_jobs_job_id",
  "idx_project_scan_jobs_company_project_job",
  "idx_company_wifi_network_scans_company_id",
  "idx_company_wifi_network_scans_project_id",
  "idx_company_wifi_network_scans_job_id",
  "idx_company_wifi_network_scans_created_at",
  "idx_project_export_jobs_company_id",
  "idx_project_export_jobs_project_id",
  "idx_project_export_jobs_job_id",
  "idx_project_symbol_library_company_id",
  "idx_project_legend_symbols_company_id",
  "idx_project_legend_symbols_project_id",
  "idx_project_legend_symbols_job_id",
  "idx_project_symbol_corrections_company_id",
  "idx_project_symbol_corrections_project_id",
  "idx_project_symbol_corrections_job_id",
  "idx_company_settings_company_id",
  "idx_supplier_accounts_company_id",
  "idx_supplier_accounts_company_supplier",
  "uq_supplier_accounts_company_supplier",
  "idx_auth_users_company_id",
  "idx_auth_users_company_email",
  "idx_auth_password_resets_company_id",
  "idx_auth_password_resets_user_id",
  "idx_auth_password_resets_email"
] as const;

const REQUIRED_TENANT_FK_CONSTRAINTS = [
  "fk_project_jobs_tenant_companies",
  "fk_project_blueprints_tenant_companies",
  "fk_project_rooms_tenant_companies",
  "fk_project_symbol_detections_tenant_companies",
  "fk_project_notes_tenant_companies",
  "fk_project_estimates_tenant_companies",
  "fk_project_panel_schedules_tenant_companies",
  "fk_project_service_designs_tenant_companies",
  "fk_project_material_lists_tenant_companies",
  "fk_project_material_price_snapshots_tenant_companies",
  "fk_blueprint_processing_runs_tenant_companies",
  "fk_blueprint_processing_sheet_results_tenant_companies",
  "project_scan_jobs_company_id_fkey",
  "company_wifi_network_scans_company_id_fkey",
  "fk_project_export_jobs_tenant_companies",
  "fk_project_symbol_library_tenant_companies",
  "project_legend_symbols_company_id_fkey",
  "project_symbol_corrections_company_id_fkey",
  "fk_company_settings_tenant_companies",
  "fk_supplier_accounts_tenant_companies",
  "fk_auth_users_tenant_companies",
  "fk_auth_password_resets_tenant_companies",
  "fk_auth_password_resets_auth_users"
] as const;

const COMPANY_SYMBOL_UNIQUE_FRAGMENT = "(company_id, symbol_key)";

type ExistingTableRow = { table_name: string };
type ExistingColumnRow = { table_name: string; column_name: string };
type ExistingIndexRow = { indexname: string };
type ConstraintRow = { constraint_definition: string };
type ConstraintNameRow = { conname: string };

export type DbSchemaStatus = {
  enabled: boolean;
  ok: boolean;
  checkedAt: string;
  missingTables: string[];
  missingColumns: string[];
  missingIndexes: string[];
  missingTenantForeignKeys: string[];
  uniqueConstraints: {
    projectSymbolLibraryCompanySymbolKey: boolean;
  };
};

function schemaCheckEnabled(): boolean {
  return process.env.DB_SCHEMA_CHECK_ENABLED !== "false";
}

function buildMissingColumnsList(existingColumns: Set<string>): string[] {
  const missing: string[] = [];
  for (const [tableName, expectedColumns] of Object.entries(REQUIRED_TABLE_COLUMNS)) {
    for (const columnName of expectedColumns) {
      const key = `${tableName}.${columnName}`;
      if (!existingColumns.has(key)) {
        missing.push(key);
      }
    }
  }
  return missing;
}

function buildSchemaError(status: DbSchemaStatus): Error {
  const parts: string[] = [];
  if (status.missingTables.length > 0) {
    parts.push(`missing table(s): ${status.missingTables.join(", ")}`);
  }
  if (status.missingColumns.length > 0) {
    parts.push(`missing column(s): ${status.missingColumns.join(", ")}`);
  }
  if (status.missingIndexes.length > 0) {
    parts.push(`missing index(es): ${status.missingIndexes.join(", ")}`);
  }
  if (status.missingTenantForeignKeys.length > 0) {
    parts.push(`missing tenant FK constraint(s): ${status.missingTenantForeignKeys.join(", ")}`);
  }
  if (!status.uniqueConstraints.projectSymbolLibraryCompanySymbolKey) {
    parts.push("missing unique constraint on project_symbol_library(company_id, symbol_key)");
  }

  return new Error(
    `Database schema check failed: ${parts.join("; ")}. Run infrastructure migrations before starting the API.`
  );
}

export async function getDbSchemaStatus(): Promise<DbSchemaStatus> {
  const enabled = schemaCheckEnabled();
  const checkedAt = new Date().toISOString();
  const requiredTables = Object.keys(REQUIRED_TABLE_COLUMNS);

  if (!enabled) {
    return {
      enabled,
      ok: true,
      checkedAt,
      missingTables: [],
      missingColumns: [],
      missingIndexes: [],
      missingTenantForeignKeys: [],
      uniqueConstraints: {
        projectSymbolLibraryCompanySymbolKey: true
      }
    };
  }

  const pool = getDbPool();

  const tablesResult = await pool.query<ExistingTableRow>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );
  const existingTables = new Set(tablesResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

  const columnsResult = await pool.query<ExistingColumnRow>(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );
  const existingColumns = new Set(columnsResult.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = buildMissingColumnsList(existingColumns);

  const indexesResult = await pool.query<ExistingIndexRow>(
    `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY($1::text[])
    `,
    [requiredTables]
  );
  const existingIndexes = new Set(indexesResult.rows.map((row) => row.indexname));
  const missingIndexes = REQUIRED_INDEX_NAMES.filter((indexName) => !existingIndexes.has(indexName));

  const fkConstraintResult = await pool.query<ConstraintNameRow>(
    `
    SELECT conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND conname = ANY($1::text[])
    `,
    [REQUIRED_TENANT_FK_CONSTRAINTS]
  );
  const existingTenantFks = new Set(fkConstraintResult.rows.map((row) => row.conname));
  const missingTenantForeignKeys = REQUIRED_TENANT_FK_CONSTRAINTS.filter(
    (constraintName) => !existingTenantFks.has(constraintName)
  );

  const uniqueConstraintResult = await pool.query<ConstraintRow>(
    `
    SELECT pg_get_constraintdef(c.oid) AS constraint_definition
    FROM pg_constraint c
    INNER JOIN pg_class t ON t.oid = c.conrelid
    INNER JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'project_symbol_library'
      AND c.contype = 'u'
    `
  );
  const hasCompanySymbolUniq = uniqueConstraintResult.rows.some((row) =>
    row.constraint_definition.includes(COMPANY_SYMBOL_UNIQUE_FRAGMENT)
  );

  const ok =
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    missingIndexes.length === 0 &&
    missingTenantForeignKeys.length === 0 &&
    hasCompanySymbolUniq;

  return {
    enabled,
    ok,
    checkedAt,
    missingTables,
    missingColumns,
    missingIndexes,
    missingTenantForeignKeys,
    uniqueConstraints: {
      projectSymbolLibraryCompanySymbolKey: hasCompanySymbolUniq
    }
  };
}

export async function ensureRequiredDbSchema(): Promise<void> {
  const status = await getDbSchemaStatus();
  if (!status.ok) {
    throw buildSchemaError(status);
  }
}
