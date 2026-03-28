import type { AssetRow, InventoryAssetStatus } from "@/lib/inventory-types";

/** DB `vehicle_service_history.service_type` values (UI dropdown). */
export type VehicleServiceType =
  | "Oil Change"
  | "Inspection"
  | "Registration"
  | "Repair"
  | "Tire Rotation"
  | "Brake Service"
  | "Recall Repair"
  | "Tire Replacement"
  | "Other";

export const VEHICLE_SERVICE_TYPES: readonly VehicleServiceType[] = [
  "Oil Change",
  "Inspection",
  "Registration",
  "Repair",
  "Tire Rotation",
  "Brake Service",
  "Recall Repair",
  "Tire Replacement",
  "Other",
] as const;

/** DB `vehicle_documents.doc_type`. */
export type VehicleDocumentType =
  | "registration"
  | "insurance"
  | "inspection"
  | "title"
  | "other";

export type VehicleServiceHistoryRow = {
  id: string;
  asset_id: string;
  service_type: string;
  service_date: string;
  mileage: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  next_service_date: string | null;
  next_service_mileage: number | null;
  created_at: string;
  created_by: string | null;
};

export type VehicleDocumentRow = {
  id: string;
  asset_id: string;
  doc_type: VehicleDocumentType;
  file_name: string;
  storage_path: string;
  created_at: string;
  uploaded_by: string | null;
};

export type VehicleAlertSeverity = "ok" | "due_soon" | "overdue";

export function isVehicleAsset(a: AssetRow): boolean {
  return a.asset_type === "vehicle";
}

/** UI labels for fleet status (maps from `assets.status`). */
export function vehicleStatusLabel(status: InventoryAssetStatus): string {
  switch (status) {
    case "checked_out":
      return "In use";
    case "in_repair":
      return "Maintenance";
    case "retired":
      return "Retired";
    default:
      return "Available";
  }
}

export type NhtsaRecallItem = {
  NHTSACampaignNumber?: string;
  ManufacturerCampaignNumber?: string;
  ReportReceivedDate?: string;
  Component?: string;
  Summary?: string;
  Consequence?: string;
  Remedy?: string;
  Notes?: string;
};
