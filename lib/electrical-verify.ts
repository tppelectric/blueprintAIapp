import type {
  ElectricalItemRow,
  InstanceLocation,
  SymbolOriginSource,
  SymbolVerifiedStatus,
} from "@/lib/electrical-item-types";

export type { SymbolOriginSource, SymbolVerifiedStatus };

export const DEFAULT_SYMBOL_VERIFIED_STATUS: SymbolVerifiedStatus = "unverified";
export const DEFAULT_SYMBOL_ORIGIN_SOURCE: SymbolOriginSource = "ai";

const VERIFIED_STATUSES = new Set<SymbolVerifiedStatus>([
  "unverified",
  "accepted",
  "edited",
  "removed",
  "manual",
]);

const ORIGIN_SOURCES = new Set<SymbolOriginSource>(["ai", "manual"]);

function parseVerifiedStatus(raw: unknown): SymbolVerifiedStatus {
  const s = String(raw ?? "").trim();
  if (VERIFIED_STATUSES.has(s as SymbolVerifiedStatus)) {
    return s as SymbolVerifiedStatus;
  }
  return DEFAULT_SYMBOL_VERIFIED_STATUS;
}

function parseOriginSource(raw: unknown): SymbolOriginSource {
  const s = String(raw ?? "").trim();
  if (ORIGIN_SOURCES.has(s as SymbolOriginSource)) {
    return s as SymbolOriginSource;
  }
  return DEFAULT_SYMBOL_ORIGIN_SOURCE;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Normalize one instance_locations entry; applies row defaults when fields absent. */
export function normalizeInstanceLocationEntry(
  raw: unknown,
  rowDefaults?: {
    verified_status?: SymbolVerifiedStatus;
    source?: SymbolOriginSource;
  },
): InstanceLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nx = Number(o.nx);
  const ny = Number(o.ny);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return {
    nx: clamp01(nx),
    ny: clamp01(ny),
    verified_status: parseVerifiedStatus(
      o.verified_status ?? rowDefaults?.verified_status,
    ),
    source: parseOriginSource(o.source ?? rowDefaults?.source),
  };
}

export function normalizeInstanceLocations(
  raw: unknown,
  rowDefaults?: {
    verified_status?: SymbolVerifiedStatus;
    source?: SymbolOriginSource;
  },
): InstanceLocation[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: InstanceLocation[] = [];
  for (const entry of raw) {
    const p = normalizeInstanceLocationEntry(entry, rowDefaults);
    if (p) out.push(p);
  }
  return out.length > 0 ? out : null;
}

/** Stamp all instance entries when a row-level verify action runs (Phase 1). */
export function stampInstanceLocationsVerified(
  instances: InstanceLocation[] | null | undefined,
  status: SymbolVerifiedStatus,
  source: SymbolOriginSource,
): InstanceLocation[] | null {
  if (!instances?.length) return null;
  return instances.map((p) => ({
    ...p,
    verified_status: status,
    source,
  }));
}

/** Defaults for legacy rows + sparse JSON instance entries. */
export function normalizeElectricalItemRow(
  raw: Record<string, unknown>,
): ElectricalItemRow {
  const verified_status = parseVerifiedStatus(raw.verified_status);
  const origin_source = parseOriginSource(raw.origin_source);
  const instance_locations = normalizeInstanceLocations(raw.instance_locations, {
    verified_status,
    source: origin_source,
  });

  return {
    id: String(raw.id),
    project_id: String(raw.project_id),
    page_number: Number(raw.page_number),
    category: String(raw.category ?? ""),
    description: String(raw.description ?? ""),
    specification: String(raw.specification ?? ""),
    quantity: Number(raw.quantity ?? 0),
    unit: String(raw.unit ?? "EA"),
    confidence: Number(raw.confidence ?? 0),
    which_room:
      raw.which_room != null && String(raw.which_room).trim()
        ? String(raw.which_room)
        : null,
    raw_note:
      raw.raw_note != null && String(raw.raw_note).trim()
        ? String(raw.raw_note)
        : null,
    created_at:
      raw.created_at != null ? String(raw.created_at) : undefined,
    gpt_count:
      raw.gpt_count != null && raw.gpt_count !== ""
        ? Number(raw.gpt_count)
        : null,
    final_count:
      raw.final_count != null && raw.final_count !== ""
        ? Number(raw.final_count)
        : null,
    verification_status:
      raw.verification_status != null
        ? String(raw.verification_status)
        : null,
    verified_by:
      raw.verified_by != null && String(raw.verified_by).trim()
        ? String(raw.verified_by)
        : null,
    user_edited: Boolean(raw.user_edited),
    location_nx:
      raw.location_nx != null && raw.location_nx !== ""
        ? Number(raw.location_nx)
        : null,
    location_ny:
      raw.location_ny != null && raw.location_ny !== ""
        ? Number(raw.location_ny)
        : null,
    instance_locations,
    verified_status,
    verified_user_id:
      raw.verified_user_id != null && String(raw.verified_user_id).trim()
        ? String(raw.verified_user_id)
        : null,
    verified_at:
      raw.verified_at != null && String(raw.verified_at).trim()
        ? String(raw.verified_at)
        : null,
    origin_source,
  };
}

/** Patch for Supabase update from an authenticated human verify action. */
export function humanVerifyPatch(
  userId: string,
  verified_status: SymbolVerifiedStatus,
  opts?: {
    stampInstances?: InstanceLocation[] | null;
    origin_source?: SymbolOriginSource | string;
  },
): Record<string, unknown> {
  const now = new Date().toISOString();
  const origin = parseOriginSource(opts?.origin_source);
  const patch: Record<string, unknown> = {
    verified_status,
    verified_user_id: userId,
    verified_at: now,
  };
  if (opts?.origin_source) {
    patch.origin_source = origin;
  }
  const stamped = stampInstanceLocationsVerified(
    opts?.stampInstances ?? null,
    verified_status,
    origin,
  );
  if (stamped) {
    patch.instance_locations = stamped;
  }
  return patch;
}
