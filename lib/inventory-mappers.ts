import type {
  AssetLocationRow,
  AssetLocationType,
  AssetRow,
  AssetTransactionRow,
  InventoryAssetStatus,
  InventoryAssetType,
  MaterialRow,
} from "@/lib/inventory-types";

const LOC_TYPES = new Set<string>([
  "warehouse",
  "truck",
  "job_site",
  "boiler_room",
  "office",
  "fleet",
]);

const ASSET_TYPES = new Set<string>(["tool", "material", "equipment", "vehicle"]);

const STATUSES = new Set<string>([
  "available",
  "checked_out",
  "in_repair",
  "retired",
]);

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

export function normalizeLocationType(raw: unknown): AssetLocationType {
  const s = slug(String(raw ?? "warehouse"));
  if (s === "jobsite") return "job_site";
  if (LOC_TYPES.has(s)) return s as AssetLocationType;
  return "warehouse";
}

export function normalizeAssetType(raw: unknown): InventoryAssetType {
  const s = slug(String(raw ?? "tool"));
  if (s === "other") return "equipment";
  if (ASSET_TYPES.has(s)) return s as InventoryAssetType;
  return "equipment";
}

export function normalizeAssetStatus(raw: unknown): InventoryAssetStatus {
  let s = slug(String(raw ?? "available"));
  if (s === "checkedout") s = "checked_out";
  if (s === "inrepair") s = "in_repair";
  if (STATUSES.has(s)) return s as InventoryAssetStatus;
  return "available";
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function dateStrOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).slice(0, 10);
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function mapVehicleFleetFields(r: Record<string, unknown>) {
  const interval = intOrNull(r.oil_change_interval_miles);
  return {
    vehicle_year: intOrNull(r.vehicle_year),
    vehicle_make: strOrNull(r.vehicle_make),
    vehicle_model: strOrNull(r.vehicle_model),
    vehicle_color: strOrNull(r.vehicle_color),
    license_plate: strOrNull(r.license_plate),
    vin: strOrNull(r.vin),
    ezpass_id: strOrNull(r.ezpass_id),
    insurance_provider: strOrNull(r.insurance_provider),
    insurance_policy_number: strOrNull(r.insurance_policy_number),
    registration_expires: dateStrOrNull(r.registration_expires),
    inspection_expires: dateStrOrNull(r.inspection_expires),
    insurance_expires: dateStrOrNull(r.insurance_expires),
    current_mileage: intOrNull(r.current_mileage),
    last_oil_change_date: dateStrOrNull(r.last_oil_change_date),
    last_oil_change_mileage: intOrNull(r.last_oil_change_mileage),
    oil_change_interval_miles: interval ?? 5000,
    next_oil_change_mileage: intOrNull(r.next_oil_change_mileage),
    next_oil_change_due_date: dateStrOrNull(r.next_oil_change_due_date),
    next_service_date: dateStrOrNull(r.next_service_date),
    next_service_notes: strOrNull(r.next_service_notes),
    last_service_date: dateStrOrNull(r.last_service_date),
    mileage_updated_at: dateStrOrNull(r.mileage_updated_at),
  };
}

export function mapLocationRow(r: Record<string, unknown>): AssetLocationRow {
  return {
    id: String(r.id),
    name: String(r.name ?? "").trim() || "—",
    location_type: normalizeLocationType(r.location_type ?? r.type),
    description:
      r.description != null && String(r.description).trim()
        ? String(r.description)
        : null,
    address:
      r.address != null && String(r.address).trim()
        ? String(r.address)
        : null,
    qr_code_url:
      r.qr_code_url != null && String(r.qr_code_url).trim()
        ? String(r.qr_code_url)
        : null,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
  };
}

export function mapAssetRow(r: Record<string, unknown>): AssetRow {
  const photoUrl =
    r.photo_url != null && String(r.photo_url).trim()
      ? String(r.photo_url).trim()
      : null;
  const photoPath =
    r.photo_path != null && String(r.photo_path).trim()
      ? String(r.photo_path).trim()
      : null;
  const assigned =
    r.assigned_to != null && String(r.assigned_to).trim()
      ? String(r.assigned_to)
      : r.checked_out_to != null && String(r.checked_out_to).trim()
        ? String(r.checked_out_to)
        : null;
  return {
    id: String(r.id),
    name: String(r.name ?? "").trim() || "—",
    asset_type: normalizeAssetType(r.asset_type ?? r.type),
    asset_number: String(r.asset_number ?? r.number ?? "").trim() || "—",
    description:
      r.description != null && String(r.description).trim()
        ? String(r.description)
        : null,
    location_id: r.location_id ? String(r.location_id) : null,
    assigned_to: assigned,
    assigned_to_name:
      r.assigned_to_name != null && String(r.assigned_to_name).trim()
        ? String(r.assigned_to_name).trim()
        : null,
    status: normalizeAssetStatus(r.status),
    purchase_date:
      r.purchase_date != null && String(r.purchase_date).trim()
        ? String(r.purchase_date).slice(0, 10)
        : null,
    purchase_price: numOrNull(r.purchase_price),
    serial_number:
      r.serial_number != null && String(r.serial_number).trim()
        ? String(r.serial_number).trim()
        : null,
    photo_url: photoUrl,
    photo_path: photoPath,
    qr_code_url:
      r.qr_code_url != null && String(r.qr_code_url).trim()
        ? String(r.qr_code_url).trim()
        : null,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? ""),
    ...mapVehicleFleetFields(r),
  };
}

export function mapMaterialRow(r: Record<string, unknown>): MaterialRow {
  const cur = Number(r.current_quantity ?? r.quantity ?? 0);
  const min = Number(r.minimum_quantity ?? r.min_quantity ?? r.reorder_point ?? 0);
  const low =
    r.low_stock_alert === false || r.low_stock_alert === "false"
      ? false
      : true;
  return {
    id: String(r.id),
    name: String(r.name ?? "").trim() || "—",
    unit: String(r.unit ?? "ea").trim() || "ea",
    current_quantity: Number.isFinite(cur) ? cur : 0,
    minimum_quantity: Number.isFinite(min) ? min : 0,
    location_id: r.location_id ? String(r.location_id) : null,
    unit_cost: numOrNull(r.unit_cost),
    supplier:
      r.supplier != null && String(r.supplier).trim()
        ? String(r.supplier).trim()
        : null,
    part_number:
      r.part_number != null && String(r.part_number).trim()
        ? String(r.part_number).trim()
        : r.sku != null && String(r.sku).trim()
          ? String(r.sku).trim()
          : null,
    qr_code_url:
      r.qr_code_url != null && String(r.qr_code_url).trim()
        ? String(r.qr_code_url).trim()
        : null,
    low_stock_alert: low,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
  };
}

export function mapTransactionRow(r: Record<string, unknown>): AssetTransactionRow {
  const qty =
    r.quantity != null && r.quantity !== ""
      ? Number(r.quantity)
      : r.quantity_delta != null && r.quantity_delta !== ""
        ? Number(r.quantity_delta)
        : null;
  return {
    id: String(r.id),
    asset_id: r.asset_id ? String(r.asset_id) : null,
    material_id: r.material_id ? String(r.material_id) : null,
    employee_id: String(r.employee_id ?? r.user_id ?? ""),
    employee_name:
      r.employee_name != null && String(r.employee_name).trim()
        ? String(r.employee_name).trim()
        : null,
    transaction_type: normalizeTxType(String(r.transaction_type ?? "")),
    from_location_id: r.from_location_id ? String(r.from_location_id) : null,
    to_location_id: r.to_location_id ? String(r.to_location_id) : null,
    job_id: r.job_id ? String(r.job_id) : null,
    quantity: qty != null && Number.isFinite(qty) ? qty : null,
    notes: r.notes != null ? String(r.notes) : null,
    photo_url:
      r.photo_url != null && String(r.photo_url).trim()
        ? String(r.photo_url).trim()
        : null,
    created_at: String(r.created_at ?? ""),
  };
}

function normalizeTxType(t: string): string {
  const s = t.trim().toLowerCase().replace(/_/g, "");
  if (s === "checkout" || s === "check_out") return "checkout";
  if (s === "checkin" || s === "check_in") return "checkin";
  if (s === "move") return "move";
  if (s === "use") return "use";
  if (s === "deliver") return "deliver";
  if (s === "reportissue" || s === "report_issue" || s === "repairreport")
    return "report_issue";
  return t || "move";
}

export function isLowStock(m: MaterialRow): boolean {
  if (!m.low_stock_alert) return false;
  return m.current_quantity < m.minimum_quantity;
}
