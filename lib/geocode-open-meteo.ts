/**
 * Forward geocode a free-text address using Open-Meteo (no API key).
 * https://open-meteo.com/en/docs/geocoding-api
 */

export type GeocodeHit = { lat: number; lng: number; name: string };

export async function geocodeAddressLine(
  addressLine: string,
): Promise<GeocodeHit | null> {
  const q = addressLine.trim();
  if (!q || q.length < 3) return null;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q.slice(0, 200));
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const r = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string }>;
  };
  const hit = j.results?.[0];
  if (!hit) return null;
  return {
    lat: hit.latitude,
    lng: hit.longitude,
    name: hit.name,
  };
}

export function buildJobAddressLine(row: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return [row.address, row.city, row.state, row.zip]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
