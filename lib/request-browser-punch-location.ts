/**
 * Best-effort GPS for punch flows. Returns null if denied, unsupported, or timeout.
 */
export function requestBrowserPunchLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number | null;
} | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy:
            pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 14_000 },
    );
  });
}
