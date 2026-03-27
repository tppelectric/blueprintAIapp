/** Align with `public.asset_locations.location_type`. */
export type AssetLocationType =
  | "warehouse"
  | "truck"
  | "job_site"
  | "boiler_room"
  | "office";

/** Align with `public.assets.asset_type`. */
export type InventoryAssetType = "tool" | "equipment" | "other";

/** Align with `public.assets.status`. */
export type InventoryAssetStatus =
  | "available"
  | "checked_out"
  | "in_repair"
  | "retired";

export type AssetLocationRow = {
  id: string;
  name: string;
  location_type: AssetLocationType;
  created_at?: string;
};

export type AssetRow = {
  id: string;
  asset_number: string;
  name: string;
  asset_type: InventoryAssetType;
  status: InventoryAssetStatus;
  location_id: string | null;
  checked_out_to: string | null;
  photo_path: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type MaterialRow = {
  id: string;
  name: string;
  part_number: string | null;
  current_quantity: number;
  minimum_quantity: number;
  unit: string;
  location_id: string | null;
  created_at?: string;
};

export type AssetTransactionInsert = {
  asset_id?: string | null;
  material_id?: string | null;
  transaction_type: string;
  quantity_delta?: number | null;
  from_location_id?: string | null;
  to_location_id?: string | null;
  job_id?: string | null;
  user_id: string;
  notes?: string | null;
};
