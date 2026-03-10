import type { SupplierAccount, SupplierAccountUpsertInput } from "@package/shared";
import { randomUUID } from "node:crypto";
import { getDbPool } from "../db/postgres.js";
import { ensureCompanySettings } from "./company-settings-repository.js";

type DbSupplierAccountRow = {
  id: string;
  company_id: string;
  supplier_name: "Home Depot Pro" | "Copper Electric Supply" | "HZ Electric Supply";
  username: string | null;
  encrypted_password: string | null;
  api_token: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbSupplierAccountRow): SupplierAccount {
  return {
    id: row.id,
    companyId: row.company_id,
    supplierName: row.supplier_name,
    username: row.username,
    encryptedPassword: row.encrypted_password,
    apiToken: row.api_token,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listSupplierAccounts(companyId: string): Promise<SupplierAccount[]> {
  const pool = getDbPool();
  await ensureCompanySettings(companyId);

  const result = await pool.query<DbSupplierAccountRow>(
    `
    SELECT
      id,
      company_id,
      supplier_name,
      username,
      encrypted_password,
      api_token,
      last_login,
      created_at,
      updated_at
    FROM supplier_accounts
    WHERE company_id = $1
    ORDER BY supplier_name ASC
    `,
    [companyId]
  );

  return result.rows.map(mapRow);
}

export async function upsertSupplierAccount(
  companyId: string,
  input: SupplierAccountUpsertInput
): Promise<SupplierAccount> {
  const pool = getDbPool();
  await ensureCompanySettings(companyId);
  const id = `sup-${randomUUID()}`;

  const result = await pool.query<DbSupplierAccountRow>(
    `
    INSERT INTO supplier_accounts (
      id,
      company_id,
      supplier_name,
      username,
      encrypted_password,
      api_token,
      last_login
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (company_id, supplier_name) DO UPDATE
      SET username = EXCLUDED.username,
          encrypted_password = EXCLUDED.encrypted_password,
          api_token = EXCLUDED.api_token,
          last_login = EXCLUDED.last_login,
          updated_at = NOW()
    RETURNING
      id,
      company_id,
      supplier_name,
      username,
      encrypted_password,
      api_token,
      last_login,
      created_at,
      updated_at
    `,
    [
      id,
      companyId,
      input.supplierName,
      input.username ?? null,
      input.encryptedPassword ?? null,
      input.apiToken ?? null,
      input.lastLogin ?? null
    ]
  );

  if (result.rows.length === 0) {
    throw new Error("Could not save supplier account.");
  }

  return mapRow(result.rows[0]);
}
