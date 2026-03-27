/** `public.asset_locations.location_type` */
export type AssetLocationType =
  | "warehouse"
  | "truck"
  | "job_site"
  | "boiler_room"
  | "office";

/** `public.assets.asset_type` */
export type InventoryAssetType = "tool" | "material" | "equipment";

/** `public.assets.status` */
export type InventoryAssetStatus =
  | "available"
  | "checked_out"
  | "in_repair"
  | "retired";

/** `public.asset_transactions.transaction_type` */
export type InventoryTransactionType =
  | "checkout"
  | "checkin"
  | "move"
  | "use"
  | "deliver"
  | "report_issue";

export type AssetLocationRow = {
  id: string;
  name: string;
  location_type: AssetLocationType;
  description: string | null;
  address: string | null;
  qr_code_url: string | null;
  created_at?: string;
};

export type AssetRow = {
  id: string;
  name: string;
  asset_type: InventoryAssetType;
  asset_number: string;
  description: string | null;
  location_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: InventoryAssetStatus;
  purchase_date: string | null;
  purchase_price: number | null;
  serial_number: string | null;
  photo_url: string | null;
  photo_path: string | null;
  qr_code_url: string | null;
  notes: string | null;
  created_at: string;
};

export type MaterialRow = {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  location_id: string | null;
  unit_cost: number | null;
  supplier: string | null;
  part_number: string | null;
  qr_code_url: string | null;
  low_stock_alert: boolean;
  created_at?: string;
};

export type AssetTransactionRow = {
  id: string;
  asset_id: string | null;
  material_id: string | null;
  employee_id: string;
  employee_name: string | null;
  transaction_type: string;
  from_location_id: string | null;
  to_location_id: string | null;
  job_id: string | null;
  quantity: number | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
};
