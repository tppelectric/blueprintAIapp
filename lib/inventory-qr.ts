/** Production default for printed QR when env is unset (TPP Vercel app). */
export const INVENTORY_QR_PUBLIC_BASE =
  "https://blueprint-a-iapp.vercel.app";

function resolvedOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const env =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
      : "";
  return env || INVENTORY_QR_PUBLIC_BASE;
}

export function qrUrlForAsset(assetId: string): string {
  const o = resolvedOrigin();
  const path = `/inventory/scan?id=${encodeURIComponent(assetId)}`;
  return `${o}${path}`;
}

/** Field crew + NFC tags — write this URL once (Simply NFC / NFC Tools). */
export function fieldToolsUrlForAsset(assetId: string): string {
  const o = resolvedOrigin();
  return `${o}/field/tools?tag=${encodeURIComponent(assetId)}`;
}

// NFC: encode fieldToolsUrlForAsset(id) on tags. Tapping opens /field/tools?tag=…
// on iOS/Android at the OS level — no Web NFC API required.

export function qrUrlForLocation(locationId: string): string {
  const o = resolvedOrigin();
  const path = `/inventory/scan?location=${encodeURIComponent(locationId)}`;
  return `${o}${path}`;
}

export function qrUrlForMaterial(materialId: string): string {
  const o = resolvedOrigin();
  const path = `/inventory/scan?material=${encodeURIComponent(materialId)}`;
  return `${o}${path}`;
}

export type ScanRoutePayload = {
  assetId?: string;
  locationId?: string;
  materialId?: string;
};

export function scanRoutePath(variant: "default" | "field" = "default"): string {
  return variant === "field" ? "/field/tools" : "/inventory/scan";
}

export function buildScanRouteQuery(
  p: ScanRoutePayload,
  variant: "default" | "field" = "default",
): string {
  const qs = new URLSearchParams();
  if (p.assetId) {
    if (variant === "field") qs.set("tag", p.assetId);
    else qs.set("id", p.assetId);
  }
  if (p.locationId) qs.set("location", p.locationId);
  if (p.materialId) qs.set("material", p.materialId);
  return qs.toString();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseScanPayload(text: string): {
  assetId?: string;
  locationId?: string;
  materialId?: string;
} {
  const t = text.trim();
  if (!t) return {};
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : INVENTORY_QR_PUBLIC_BASE;
    const u = /^https?:\/\//i.test(t)
      ? new URL(t)
      : new URL(t.startsWith("/") ? t : `/${t}`, base);
    const tag =
      u.searchParams.get("tag")?.trim() ||
      u.searchParams.get("item")?.trim();
    const id = u.searchParams.get("id")?.trim();
    const location = u.searchParams.get("location")?.trim();
    const material = u.searchParams.get("material")?.trim();
    const out: {
      assetId?: string;
      locationId?: string;
      materialId?: string;
    } = {};
    if (tag && UUID_RE.test(tag)) out.assetId = tag;
    else if (id && UUID_RE.test(id)) out.assetId = id;
    if (location && UUID_RE.test(location)) out.locationId = location;
    if (material && UUID_RE.test(material)) out.materialId = material;
    if (out.assetId || out.locationId || out.materialId) return out;
  } catch {
    /* ignore */
  }
  if (UUID_RE.test(t)) return { assetId: t };
  return {};
}
