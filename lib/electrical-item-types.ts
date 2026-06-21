export type VerificationStatus =
  | "pending"
  | "confirmed"
  | "review_needed"
  | "conflict"
  | "manual";

export type SymbolVerifiedStatus =
  | "unverified"
  | "accepted"
  | "edited"
  | "removed"
  | "manual";

export type SymbolOriginSource = "ai" | "manual";

export type InstanceLocation = {
  nx: number;
  ny: number;
  verified_status?: SymbolVerifiedStatus;
  source?: SymbolOriginSource;
};

export type ElectricalItemRow = {
  id: string;
  project_id: string;
  page_number: number;
  category: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  confidence: number;
  /** Room/area label from blueprint; UNASSIGNED if unknown */
  which_room?: string | null;
  raw_note: string | null;
  created_at?: string;
  gpt_count: number | null;
  final_count: number | null;
  verification_status: VerificationStatus | string | null;
  verified_by: string | null;
  user_edited?: boolean;
  location_nx?: number | null;
  location_ny?: number | null;
  /** Per-symbol coords from new scans; null on legacy rows. */
  instance_locations?: InstanceLocation[] | null;
  /** Human symbol verify layer (Phase 1+). */
  verified_status?: SymbolVerifiedStatus | string | null;
  verified_user_id?: string | null;
  verified_at?: string | null;
  origin_source?: SymbolOriginSource | string | null;
};

/** Coords to draw on takeoff overlay: prefers instance_locations, else legacy centroid. */
export function takeoffInstanceCoords(
  item: Pick<
    ElectricalItemRow,
    "instance_locations" | "location_nx" | "location_ny"
  >,
): InstanceLocation[] {
  const raw = item.instance_locations;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(
      (p) =>
        p &&
        Number.isFinite(p.nx) &&
        Number.isFinite(p.ny) &&
        p.nx >= 0 &&
        p.nx <= 1 &&
        p.ny >= 0 &&
        p.ny <= 1,
    );
  }
  if (
    item.location_nx != null &&
    item.location_ny != null &&
    Number.isFinite(item.location_nx) &&
    Number.isFinite(item.location_ny)
  ) {
    return [{ nx: item.location_nx, ny: item.location_ny }];
  }
  return [];
}
