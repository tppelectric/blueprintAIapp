import type { SupabaseClient } from "@supabase/supabase-js";
import { buildJobAddressLine, geocodeAddressLine } from "@/lib/geocode-open-meteo";
import {
  buildSnapshotFromCoords,
  type PunchLocationSnapshot,
} from "@/lib/punch-gps";

export type CoordsInput = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

export function parseCoordsBody(
  loc: unknown,
): CoordsInput | null {
  if (!loc || typeof loc !== "object") return null;
  const o = loc as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accRaw = o.accuracy;
  const acc =
    accRaw != null && accRaw !== ""
      ? Number(accRaw)
      : null;
  return {
    lat,
    lng,
    accuracy: acc != null && Number.isFinite(acc) ? acc : null,
  };
}

export async function resolvePunchGpsForJob(
  supabase: SupabaseClient,
  jobId: string | null,
  coords: CoordsInput | null,
): Promise<{ snapshot: PunchLocationSnapshot | null; flagged: boolean }> {
  if (!coords) return { snapshot: null, flagged: false };

  let jobHit = null;
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("address,city,state,zip")
      .eq("id", jobId)
      .maybeSingle();
    const line = buildJobAddressLine(
      (job ?? {}) as {
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
      },
    );
    if (line) {
      jobHit = await geocodeAddressLine(line);
    }
  }

  return buildSnapshotFromCoords(
    coords.lat,
    coords.lng,
    coords.accuracy,
    jobHit,
  );
}
