import type {
  VehicleDocumentRow,
  VehicleDocumentType,
  VehicleServiceHistoryRow,
} from "@/lib/vehicle-types";

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const DOC_TYPES = new Set<string>([
  "registration",
  "insurance",
  "inspection",
  "title",
  "other",
]);

function normalizeDocType(raw: unknown): VehicleDocumentType {
  const s = String(raw ?? "other").toLowerCase();
  return DOC_TYPES.has(s) ? (s as VehicleDocumentType) : "other";
}

export function mapVehicleServiceHistoryRow(
  r: Record<string, unknown>,
): VehicleServiceHistoryRow {
  return {
    id: String(r.id),
    asset_id: String(r.asset_id ?? ""),
    service_type: String(r.service_type ?? ""),
    service_date: String(r.service_date ?? "").slice(0, 10),
    mileage: numOrNull(r.mileage),
    cost: numOrNull(r.cost),
    vendor: strOrNull(r.vendor),
    notes: strOrNull(r.notes),
    next_service_date: r.next_service_date
      ? String(r.next_service_date).slice(0, 10)
      : null,
    next_service_mileage: numOrNull(r.next_service_mileage),
    created_at: String(r.created_at ?? ""),
    created_by: r.created_by ? String(r.created_by) : null,
  };
}

export function mapVehicleDocumentRow(
  r: Record<string, unknown>,
): VehicleDocumentRow {
  return {
    id: String(r.id),
    asset_id: String(r.asset_id ?? ""),
    doc_type: normalizeDocType(r.doc_type),
    file_name: String(r.file_name ?? ""),
    storage_path: String(r.storage_path ?? ""),
    created_at: String(r.created_at ?? ""),
    uploaded_by: r.uploaded_by ? String(r.uploaded_by) : null,
  };
}
