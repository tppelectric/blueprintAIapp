import type { SupabaseClient } from "@supabase/supabase-js";

export type InsertInventoryTx = {
  asset_id?: string | null;
  material_id?: string | null;
  employee_id: string;
  employee_name: string;
  transaction_type:
    | "checkout"
    | "checkin"
    | "move"
    | "use"
    | "deliver"
    | "report_issue";
  from_location_id?: string | null;
  to_location_id?: string | null;
  job_id?: string | null;
  quantity?: number | null;
  notes?: string | null;
  photo_url?: string | null;
};

export async function insertInventoryTransaction(
  sb: SupabaseClient,
  row: InsertInventoryTx,
): Promise<void> {
  const { error } = await sb.from("asset_transactions").insert({
    asset_id: row.asset_id ?? null,
    material_id: row.material_id ?? null,
    employee_id: row.employee_id,
    employee_name: row.employee_name || null,
    transaction_type: row.transaction_type,
    from_location_id: row.from_location_id ?? null,
    to_location_id: row.to_location_id ?? null,
    job_id: row.job_id ?? null,
    quantity: row.quantity ?? null,
    notes: row.notes ?? null,
    photo_url: row.photo_url ?? null,
  });
  if (error) throw error;
}
