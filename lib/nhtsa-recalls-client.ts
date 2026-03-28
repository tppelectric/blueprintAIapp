import type { AssetRow } from "@/lib/inventory-types";
import { isVehicleAsset } from "@/lib/vehicle-types";

/**
 * Browser-only: calls our authenticated proxy to NHTSA recalls by Y/M/MY.
 * Returns how many recall records NHTSA returned for that vehicle (0 = none).
 */
export async function fetchNhtsaOpenRecallCountForVehicle(
  make: string,
  model: string,
  modelYear: string,
  signal?: AbortSignal,
): Promise<number> {
  const u = new URL(
    "/api/vehicles/nhtsa-recalls",
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  u.searchParams.set("make", make.trim());
  u.searchParams.set("model", model.trim());
  u.searchParams.set("modelYear", modelYear.trim());
  const r = await fetch(u.toString(), { signal });
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(String(j.error ?? r.status));
  }
  const raw =
    (j.Results as unknown[]) ??
    (j.results as unknown[]) ??
    (j.items as unknown[]) ??
    [];
  return Array.isArray(raw)
    ? raw.filter((x) => x && typeof x === "object").length
    : 0;
}

/**
 * How many fleet vehicles report at least one open recall from NHTSA (live check).
 * Caps checks to avoid hammering the API.
 */
export async function countVehiclesWithNhtsaRecalls(
  vehicles: AssetRow[],
  opts?: { maxChecks?: number; delayMs?: number; signal?: AbortSignal },
): Promise<number> {
  const maxChecks = opts?.maxChecks ?? 12;
  const delayMs = opts?.delayMs ?? 120;
  const signal = opts?.signal;

  const candidates = vehicles
    .filter(isVehicleAsset)
    .filter((v) => {
      const y = v.vehicle_year;
      const mk = v.vehicle_make?.trim();
      const md = v.vehicle_model?.trim();
      return y != null && mk && md;
    })
    .slice(0, maxChecks);

  let withOpen = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (signal?.aborted) break;
    const v = candidates[i]!;
    try {
      const n = await fetchNhtsaOpenRecallCountForVehicle(
        v.vehicle_make!.trim(),
        v.vehicle_model!.trim(),
        String(v.vehicle_year),
        signal,
      );
      if (n > 0) withOpen += 1;
    } catch {
      /* skip failed lookups */
    }
    if (i < candidates.length - 1 && delayMs > 0) {
      await new Promise((r) => window.setTimeout(r, delayMs));
    }
  }
  return withOpen;
}
