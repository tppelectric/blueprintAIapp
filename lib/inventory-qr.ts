function appOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
      : "") || ""
  );
}

/** Absolute URL for QR codes when possible (phone cameras). */
export function qrUrlForAsset(assetId: string): string {
  const o = appOrigin();
  const path = `/inventory/scan?id=${encodeURIComponent(assetId)}`;
  return o ? `${o}${path}` : path;
}

export function qrUrlForLocation(locationId: string): string {
  const o = appOrigin();
  const path = `/inventory/scan?location=${encodeURIComponent(locationId)}`;
  return o ? `${o}${path}` : path;
}

export function qrUrlForMaterial(materialId: string): string {
  const o = appOrigin();
  const path = `/inventory/scan?material=${encodeURIComponent(materialId)}`;
  return o ? `${o}${path}` : path;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        : "https://inventory.local";
    const u = /^https?:\/\//i.test(t)
      ? new URL(t)
      : new URL(t.startsWith("/") ? t : `/${t}`, base);
    const id = u.searchParams.get("id")?.trim();
    const location = u.searchParams.get("location")?.trim();
    const material = u.searchParams.get("material")?.trim();
    const out: {
      assetId?: string;
      locationId?: string;
      materialId?: string;
    } = {};
    if (id && UUID_RE.test(id)) out.assetId = id;
    if (location && UUID_RE.test(location)) out.locationId = location;
    if (material && UUID_RE.test(material)) out.materialId = material;
    if (out.assetId || out.locationId || out.materialId) return out;
  } catch {
    /* ignore */
  }
  if (UUID_RE.test(t)) return { assetId: t };
  return {};
}
