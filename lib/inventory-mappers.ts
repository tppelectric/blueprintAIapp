import type {
  AssetLocationRow,
  AssetLocationType,
  AssetRow,
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
]);

const ASSET_TYPES = new Set<string>(["tool", "equipment", "other"]);

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
  if (ASSET_TYPES.has(s)) return s as InventoryAssetType;
  return "other";
}

export function normalizeAssetStatus(raw: unknown): InventoryAssetStatus {
  let s = slug(String(raw ?? "available"));
  if (s === "checkedout") s = "checked_out";
  if (s === "inrepair") s = "in_repair";
  if (STATUSES.has(s)) return s as InventoryAssetStatus;
  return "available";
}

export function mapLocationRow(r: Record<string, unknown>): AssetLocationRow {
  return {
    id: String(r.id),
    name: String(r.name ?? "").trim() || "—",
    location_type: normalizeLocationType(r.location_type ?? r.type),
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
  return {
    id: String(r.id),
    asset_number: String(r.asset_number ?? r.number ?? "").trim() || "—",
    name: String(r.name ?? "").trim() || "—",
    asset_type: normalizeAssetType(r.asset_type ?? r.type),
    status: normalizeAssetStatus(r.status),
    location_id: r.location_id ? String(r.location_id) : null,
    checked_out_to: r.checked_out_to
      ? String(r.checked_out_to)
      : r.assigned_to
        ? String(r.assigned_to)
        : null,
    photo_path: photoPath,
    photo_url: photoUrl,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  };
}

export function mapMaterialRow(r: Record<string, unknown>): MaterialRow {
  const cur = Number(r.current_quantity ?? r.quantity ?? 0);
  const min = Number(r.minimum_quantity ?? r.min_quantity ?? r.reorder_point ?? 0);
  return {
    id: String(r.id),
    name: String(r.name ?? "").trim() || "—",
    part_number:
      r.part_number != null && String(r.part_number).trim()
        ? String(r.part_number).trim()
        : r.sku != null && String(r.sku).trim()
          ? String(r.sku).trim()
          : null,
    current_quantity: Number.isFinite(cur) ? cur : 0,
    minimum_quantity: Number.isFinite(min) ? min : 0,
    unit: String(r.unit ?? "ea").trim() || "ea",
    location_id: r.location_id ? String(r.location_id) : null,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
  };
}

export function isLowStock(m: MaterialRow): boolean {
  return m.current_quantity < m.minimum_quantity;
}
