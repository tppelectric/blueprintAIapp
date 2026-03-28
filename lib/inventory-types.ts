/** `public.asset_locations.location_type` */
export type AssetLocationType =
  | "warehouse"
  | "truck"
  | "job_site"
  | "boiler_room"
  | "office"
  | "fleet";

/** `public.assets.asset_type` */
export type InventoryAssetType = "tool" | "material" | "equipment" | "vehicle";

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

/** Vehicle-only columns on `public.assets` (null for tools/materials/equipment). */
export type VehicleFleetFields = {
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  license_plate: string | null;
  vin: string | null;
  ezpass_id: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  registration_expires: string | null;
  inspection_expires: string | null;
  insurance_expires: string | null;
  current_mileage: number | null;
  last_oil_change_date: string | null;
  last_oil_change_mileage: number | null;
  oil_change_interval_miles: number;
  next_oil_change_due_date: string | null;
  next_service_date: string | null;
  next_service_notes: string | null;
  last_service_date: string | null;
  mileage_updated_at: string | null;
};

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
} & VehicleFleetFields;

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
