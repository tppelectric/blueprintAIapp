import type { GeocodeHit } from "@/lib/geocode-open-meteo";

const FT_PER_M = 3.28084;
const ON_SITE_FT = 500;
const NEAR_SITE_FT = 5280; // 1 mile

export type PunchGpsStatus = "on_site" | "near_site" | "off_site" | "unknown";

export type PunchLocationSnapshot = {
  lat: number;
  lng: number;
  accuracy: number | null;
  distance_from_job_ft: number | null;
  on_site_verified: boolean;
  status: PunchGpsStatus;
  job_geocoded: boolean;
};

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toR(lat1)) *
      Math.cos(toR(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function classifyPunchDistance(
  distanceFt: number | null,
  jobGeocoded: boolean,
): {
  status: PunchGpsStatus;
  on_site_verified: boolean;
  flagged: boolean;
} {
  if (!jobGeocoded || distanceFt == null || !Number.isFinite(distanceFt)) {
    return {
      status: "unknown",
      on_site_verified: false,
      flagged: false,
    };
  }
  if (distanceFt <= ON_SITE_FT) {
    return { status: "on_site", on_site_verified: true, flagged: false };
  }
  if (distanceFt <= NEAR_SITE_FT) {
    return { status: "near_site", on_site_verified: false, flagged: true };
  }
  return { status: "off_site", on_site_verified: false, flagged: true };
}

export function buildSnapshotFromCoords(
  lat: number,
  lng: number,
  accuracy: number | null | undefined,
  jobHit: GeocodeHit | null,
): { snapshot: PunchLocationSnapshot; flagged: boolean } {
  const jobGeocoded = jobHit != null;
  let distanceFt: number | null = null;
  if (jobHit) {
    const m = haversineMeters(lat, lng, jobHit.lat, jobHit.lng);
    distanceFt = Math.round(m * FT_PER_M);
  }
  const { status, on_site_verified, flagged } = classifyPunchDistance(
    distanceFt,
    jobGeocoded,
  );
  return {
    snapshot: {
      lat,
      lng,
      accuracy:
        accuracy != null && Number.isFinite(accuracy)
          ? Math.round(accuracy)
          : null,
      distance_from_job_ft: distanceFt,
      on_site_verified,
      status,
      job_geocoded: jobGeocoded,
    },
    flagged,
  };
}

export function formatPunchGpsStatusLine(
  loc: PunchLocationSnapshot | null | undefined,
): string {
  if (!loc) return "No GPS captured for this punch";
  if (!loc.job_geocoded || loc.distance_from_job_ft == null) {
    return "Job address could not be located — GPS not compared";
  }
  const ft = loc.distance_from_job_ft;
  if (loc.status === "on_site") {
    return `Verified on site — ${ft.toLocaleString()} ft from job`;
  }
  if (loc.status === "near_site") {
    const mi = ft / 5280;
    return `Near job site — ${mi < 0.1 ? `${Math.round(ft)} ft` : `${mi.toFixed(1)} mi`} away`;
  }
  const mi = ft / 5280;
  return `Off site — ${mi >= 0.25 ? `${mi.toFixed(1)} miles` : `${Math.round(ft)} ft`} from job`;
}

/** Team clock / list: green | yellow | red | gray */
export function punchGpsDotTier(
  loc: PunchLocationSnapshot | null | undefined,
): "green" | "yellow" | "red" | "gray" {
  if (!loc) return "gray";
  if (loc.status === "on_site") return "green";
  if (loc.status === "near_site") return "yellow";
  if (loc.status === "off_site") return "red";
  return "gray";
}
