import type { CompanySettings, CompanySettingsUpdateInput } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

const DEFAULT_SETTINGS: Omit<
  CompanySettings,
  "id" | "companyId" | "createdAt" | "updatedAt"
> = {
  defaultLaborRate: 85,
  apprenticeLaborRate: 45,
  laborBurdenPercentage: 0,
  materialMarkupPercentage: 20,
  overheadPercentage: 10,
  profitMarginPercentage: 15,
  preferredWireBrand: null,
  preferredDeviceBrand: null,
  preferredBreakerBrand: null,
  defaultUtilityProvider: "Central Hudson",
  defaultVoltageSystem: "120/240",
  electricalCodeVersion: "NEC 2023",
  defaultPricePerPoint: 179.22,
  defaultCostPerSquareFoot: 6.94,
  defaultLaborHoursPerPoint: 0.55,
  defaultCrewSize: 2,
  loadCalculationMethod: "NEC Standard Method"
};

type DbSettingsRow = {
  id: string;
  company_id: string;
  default_labor_rate: number;
  apprentice_labor_rate: number;
  labor_burden_percentage: number;
  material_markup_percentage: number;
  overhead_percentage: number;
  profit_margin_percentage: number;
  preferred_wire_brand: string | null;
  preferred_device_brand: string | null;
  preferred_breaker_brand: string | null;
  default_utility_provider: "Central Hudson" | "NYSEG";
  default_voltage_system: "120/240" | "120/208" | "277/480";
  electrical_code_version: "NEC 2023";
  default_price_per_point: number;
  default_cost_per_square_foot: number;
  default_labor_hours_per_point: number;
  default_crew_size: number;
  load_calculation_method: "NEC Standard Method" | "NEC Optional Method";
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbSettingsRow): CompanySettings {
  return {
    id: row.id,
    companyId: row.company_id,
    defaultLaborRate: Number(row.default_labor_rate),
    apprenticeLaborRate: Number(row.apprentice_labor_rate),
    laborBurdenPercentage: Number(row.labor_burden_percentage),
    materialMarkupPercentage: Number(row.material_markup_percentage),
    overheadPercentage: Number(row.overhead_percentage),
    profitMarginPercentage: Number(row.profit_margin_percentage),
    preferredWireBrand: row.preferred_wire_brand,
    preferredDeviceBrand: row.preferred_device_brand,
    preferredBreakerBrand: row.preferred_breaker_brand,
    defaultUtilityProvider: row.default_utility_provider,
    defaultVoltageSystem: row.default_voltage_system,
    electricalCodeVersion: row.electrical_code_version,
    defaultPricePerPoint: Number(row.default_price_per_point),
    defaultCostPerSquareFoot: Number(row.default_cost_per_square_foot),
    defaultLaborHoursPerPoint: Number(row.default_labor_hours_per_point),
    defaultCrewSize: Number(row.default_crew_size),
    loadCalculationMethod: row.load_calculation_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureTenantCompany(companyId: string): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    INSERT INTO tenant_companies (id, display_name)
    VALUES ($1, $1)
    ON CONFLICT (id) DO NOTHING
    `,
    [companyId]
  );
}

export async function ensureCompanySettings(companyId: string): Promise<void> {
  const pool = getDbPool();
  await ensureTenantCompany(companyId);

  await pool.query(
    `
    INSERT INTO company_settings (
      id,
      company_id,
      default_labor_rate,
      apprentice_labor_rate,
      labor_burden_percentage,
      material_markup_percentage,
      overhead_percentage,
      profit_margin_percentage,
      preferred_wire_brand,
      preferred_device_brand,
      preferred_breaker_brand,
      default_utility_provider,
      default_voltage_system,
      electrical_code_version,
      default_price_per_point,
      default_cost_per_square_foot,
      default_labor_hours_per_point,
      default_crew_size,
      load_calculation_method
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    ON CONFLICT (company_id) DO NOTHING
    `,
    [
      `cfg-${companyId}`,
      companyId,
      DEFAULT_SETTINGS.defaultLaborRate,
      DEFAULT_SETTINGS.apprenticeLaborRate,
      DEFAULT_SETTINGS.laborBurdenPercentage,
      DEFAULT_SETTINGS.materialMarkupPercentage,
      DEFAULT_SETTINGS.overheadPercentage,
      DEFAULT_SETTINGS.profitMarginPercentage,
      DEFAULT_SETTINGS.preferredWireBrand,
      DEFAULT_SETTINGS.preferredDeviceBrand,
      DEFAULT_SETTINGS.preferredBreakerBrand,
      DEFAULT_SETTINGS.defaultUtilityProvider,
      DEFAULT_SETTINGS.defaultVoltageSystem,
      DEFAULT_SETTINGS.electricalCodeVersion,
      DEFAULT_SETTINGS.defaultPricePerPoint,
      DEFAULT_SETTINGS.defaultCostPerSquareFoot,
      DEFAULT_SETTINGS.defaultLaborHoursPerPoint,
      DEFAULT_SETTINGS.defaultCrewSize,
      DEFAULT_SETTINGS.loadCalculationMethod
    ]
  );
}

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  const pool = getDbPool();
  await ensureCompanySettings(companyId);

  const result = await pool.query<DbSettingsRow>(
    `
    SELECT
      id,
      company_id,
      default_labor_rate,
      apprentice_labor_rate,
      labor_burden_percentage,
      material_markup_percentage,
      overhead_percentage,
      profit_margin_percentage,
      preferred_wire_brand,
      preferred_device_brand,
      preferred_breaker_brand,
      default_utility_provider,
      default_voltage_system,
      electrical_code_version,
      default_price_per_point,
      default_cost_per_square_foot,
      default_labor_hours_per_point,
      default_crew_size,
      load_calculation_method,
      created_at,
      updated_at
    FROM company_settings
    WHERE company_id = $1
    LIMIT 1
    `,
    [companyId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Missing company settings for ${companyId}. Please complete Company Settings.`);
  }

  return mapRow(result.rows[0]);
}

const UPDATE_COLUMN_MAP: Record<keyof CompanySettingsUpdateInput, string> = {
  defaultLaborRate: "default_labor_rate",
  apprenticeLaborRate: "apprentice_labor_rate",
  laborBurdenPercentage: "labor_burden_percentage",
  materialMarkupPercentage: "material_markup_percentage",
  overheadPercentage: "overhead_percentage",
  profitMarginPercentage: "profit_margin_percentage",
  preferredWireBrand: "preferred_wire_brand",
  preferredDeviceBrand: "preferred_device_brand",
  preferredBreakerBrand: "preferred_breaker_brand",
  defaultUtilityProvider: "default_utility_provider",
  defaultVoltageSystem: "default_voltage_system",
  defaultPricePerPoint: "default_price_per_point",
  defaultCostPerSquareFoot: "default_cost_per_square_foot",
  defaultLaborHoursPerPoint: "default_labor_hours_per_point",
  defaultCrewSize: "default_crew_size",
  loadCalculationMethod: "load_calculation_method"
};

export async function updateCompanySettings(
  companyId: string,
  input: CompanySettingsUpdateInput
): Promise<CompanySettings> {
  const pool = getDbPool();
  await ensureCompanySettings(companyId);

  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return getCompanySettings(companyId);
  }

  const assignments: string[] = [];
  const values: unknown[] = [companyId];
  let nextParam = 2;

  for (const [key, value] of entries as Array<[keyof CompanySettingsUpdateInput, unknown]>) {
    const column = UPDATE_COLUMN_MAP[key];
    assignments.push(`${column} = $${nextParam}`);
    values.push(value);
    nextParam += 1;
  }

  assignments.push("updated_at = NOW()");

  await pool.query(
    `
    UPDATE company_settings
    SET ${assignments.join(", ")}
    WHERE company_id = $1
    `,
    values
  );

  return getCompanySettings(companyId);
}
