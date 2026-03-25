"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "bp:weatherLocations";
const DEFAULT_ZIP = "12601";
const MAX_LOCATIONS = 5;

type WeatherPayload = {
  zip: string;
  updatedAt: number;
  current: {
    cityLabel: string;
    tempF: number;
    feelsLikeF: number;
    humidity: number;
    windMph: number;
    description: string;
    iconEmoji: string;
  };
  daily: { dayLabel: string; highF: number; iconEmoji: string }[];
  hourly: { timeLabel: string; tempF: number; iconEmoji: string }[];
};

type StoredPrefs = { zips: string[]; activeZip: string };

function loadPrefs(): StoredPrefs {
  if (typeof window === "undefined") {
    return { zips: [DEFAULT_ZIP], activeZip: DEFAULT_ZIP };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { zips: [DEFAULT_ZIP], activeZip: DEFAULT_ZIP };
    const j = JSON.parse(raw) as Partial<StoredPrefs>;
    const zips = Array.isArray(j.zips)
      ? j.zips.filter((z): z is string => /^\d{5}$/.test(String(z)))
      : [];
    const activeZip =
      j.activeZip && /^\d{5}$/.test(j.activeZip)
        ? j.activeZip
        : zips[0] ?? DEFAULT_ZIP;
    const merged = [...new Set([activeZip, ...zips, DEFAULT_ZIP])].slice(
      0,
      MAX_LOCATIONS,
    );
    return { zips: merged.length ? merged : [DEFAULT_ZIP], activeZip };
  } catch {
    return { zips: [DEFAULT_ZIP], activeZip: DEFAULT_ZIP };
  }
}

function savePrefs(p: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function shortCityName(cityLabel: string): string {
  const t = cityLabel.trim();
  if (!t) return "";
  const comma = t.indexOf(",");
  return comma === -1 ? t : t.slice(0, comma).trim();
}

export function HomeWeatherWidget({
  variant = "default",
}: {
  /** `header`: single-line compact control for nav bar; dropdown centered below. */
  variant?: "default" | "header";
}) {
  const [prefs, setPrefs] = useState<StoredPrefs>({
    zips: [DEFAULT_ZIP],
    activeZip: DEFAULT_ZIP,
  });
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zipDraft, setZipDraft] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const fetchWeather = useCallback(async (zip: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/weather?zip=${encodeURIComponent(zip)}`,
      );
      const json = (await res.json()) as WeatherPayload & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Weather unavailable");
      }
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Weather unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!prefs.activeZip) return;
    void fetchWeather(prefs.activeZip);
  }, [prefs.activeZip, fetchWeather]);

  useEffect(() => {
    if (!expanded) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [expanded]);

  const minutesAgo = useMemo(() => {
    if (!data?.updatedAt) return null;
    const m = Math.floor((Date.now() - data.updatedAt) / 60000);
    if (m <= 0) return "just now";
    if (m === 1) return "1 minute ago";
    return `${m} minutes ago`;
  }, [data?.updatedAt]);

  const setActiveZip = (zip: string) => {
    const next: StoredPrefs = {
      zips: [...new Set([zip, ...prefs.zips])].slice(0, MAX_LOCATIONS),
      activeZip: zip,
    };
    setPrefs(next);
    savePrefs(next);
  };

  const addZip = () => {
    const z = zipDraft.replace(/\D/g, "").slice(0, 5);
    if (!/^\d{5}$/.test(z)) {
      window.alert("Enter a valid 5-digit US ZIP code.");
      return;
    }
    if (prefs.zips.includes(z)) {
      setActiveZip(z);
      setZipDraft("");
      return;
    }
    if (prefs.zips.length >= MAX_LOCATIONS) {
      window.alert(`You can save up to ${MAX_LOCATIONS} locations. Remove one first.`);
      return;
    }
    const next: StoredPrefs = {
      zips: [z, ...prefs.zips],
      activeZip: z,
    };
    setPrefs(next);
    savePrefs(next);
    setZipDraft("");
  };

  const removeZip = (zip: string) => {
    if (prefs.zips.length <= 1) {
      window.alert("Keep at least one location.");
      return;
    }
    const zips = prefs.zips.filter((x) => x !== zip);
    const activeZip =
      prefs.activeZip === zip ? zips[0]! : prefs.activeZip;
    const next = { zips, activeZip };
    setPrefs(next);
    savePrefs(next);
  };

  const collapsedLabel =
    data?.current.cityLabel ??
    (prefs.activeZip === DEFAULT_ZIP ? "Poughkeepsie, NY" : `ZIP ${prefs.activeZip}`);
  const headerCity = shortCityName(collapsedLabel);

  const isHeader = variant === "header";

  return (
    <div
      ref={wrapRef}
      className={`relative z-[100] shrink-0 text-left ${isHeader ? "flex justify-center" : ""}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={
          isHeader
            ? "flex max-w-full items-center gap-1 rounded-md border border-white/12 bg-[#071422]/85 px-1.5 py-1 text-left text-[11px] text-white/90 shadow-sm transition-colors hover:border-[#E8C84A]/40 hover:bg-[#0a1628] sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs"
            : "flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-white/15 bg-[#071422]/90 px-2 py-1.5 text-left text-xs text-white/90 shadow-sm transition-colors hover:border-[#E8C84A]/35 hover:bg-[#0a1628] sm:max-w-none sm:gap-2 sm:px-2.5 sm:text-sm"
        }
        aria-expanded={expanded}
        aria-haspopup="dialog"
      >
        {loading && !data ? (
          <span className="text-white/50">
            {isHeader ? "…" : "Weather…"}
          </span>
        ) : error && !data ? (
          <span className="truncate text-amber-200/80">
            {isHeader ? "Setup" : "Weather — setup"}
          </span>
        ) : data ? (
          isHeader ? (
            <>
              <span className="shrink-0 text-sm leading-none" aria-hidden>
                {data.current.iconEmoji || "🌤"}
              </span>
              <span className="min-w-0 truncate whitespace-nowrap">
                <span className="font-semibold tabular-nums text-[#E8C84A]">
                  {data.current.tempF}°F
                </span>
                <span className="text-white/45"> </span>
                <span className="text-white/75">{headerCity}</span>
              </span>
            </>
          ) : (
            <>
              <span className="shrink-0 text-base sm:text-lg" aria-hidden>
                {data.current.iconEmoji}
              </span>
              <span className="min-w-0 truncate">
                <span className="font-semibold text-[#E8C84A]">
                  {data.current.tempF}°F
                </span>
                <span className="text-white/50"> | </span>
                <span className="text-white/80">{collapsedLabel}</span>
              </span>
            </>
          )
        ) : (
          <span className="text-white/50">Weather</span>
        )}
      </button>

      <div
        className={[
          "absolute top-[calc(100%+0.35rem)] w-[min(100vw-2rem,20rem)] origin-top overflow-hidden rounded-xl border border-white/12 bg-[#071422] shadow-2xl ring-1 ring-[#E8C84A]/15 transition-[max-height,opacity] duration-200 ease-out",
          isHeader
            ? "left-1/2 right-auto -translate-x-1/2"
            : "right-0",
          expanded ? "max-h-[85vh] opacity-100" : "pointer-events-none max-h-0 opacity-0",
        ].join(" ")}
        role="dialog"
        aria-label="Weather details"
        aria-hidden={!expanded}
      >
        <div className="max-h-[min(85vh,32rem)] overflow-y-auto p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
            <h3 className="text-sm font-semibold text-white">Weather</h3>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                title="Refresh"
                aria-label="Refresh weather"
                disabled={loading}
                onClick={() => void fetchWeather(prefs.activeZip)}
                className="rounded-md border border-white/15 px-2 py-1 text-xs text-[#E8C84A] hover:bg-white/10 disabled:opacity-40"
              >
                ↻
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {error ? (
            <p className="mt-2 text-xs text-amber-200/90">{error}</p>
          ) : null}

          {data ? (
            <>
              <p className="mt-2 text-[11px] text-white/45">
                Updated {minutesAgo ?? "—"}
              </p>

              <section className="mt-3 space-y-1.5 border-b border-white/10 pb-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
                  Current
                </p>
                <p className="text-2xl font-bold text-[#E8C84A]">
                  {data.current.tempF}°F
                  <span className="ml-2 text-lg" aria-hidden>
                    {data.current.iconEmoji}
                  </span>
                </p>
                <p className="text-sm text-white/85">
                  {data.current.description}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-white/70">
                  <li>Feels like: {data.current.feelsLikeF}°F</li>
                  <li>Humidity: {data.current.humidity}%</li>
                  <li>Wind: {data.current.windMph} mph</li>
                </ul>
              </section>

              <section className="mt-3 border-b border-white/10 pb-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
                  5-Day Forecast
                </p>
                <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                  {data.daily.map((d, di) => (
                    <div
                      key={`${d.dayLabel}-${di}-${d.highF}`}
                      className="rounded-md bg-white/[0.04] py-1.5"
                    >
                      <div className="text-[10px] font-medium text-white/65">
                        {d.dayLabel}
                      </div>
                      <div className="text-base leading-none" aria-hidden>
                        {d.iconEmoji}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-[#E8C84A]">
                        {d.highF}°
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
                  Next 12 hours (3-hr steps)
                </p>
                <ul className="mt-2 space-y-1 text-xs text-white/80">
                  {data.hourly.map((h, i) => (
                    <li
                      key={`${h.timeLabel}-${i}`}
                      className="flex items-center justify-between rounded-md bg-white/[0.04] px-2 py-1"
                    >
                      <span className="text-white/60">{h.timeLabel}</span>
                      <span>
                        <span aria-hidden>{h.iconEmoji}</span>{" "}
                        <span className="font-medium text-[#E8C84A]">
                          {h.tempF}°F
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : loading ? (
            <p className="mt-3 text-xs text-white/50">Loading forecast…</p>
          ) : null}

          <section className="mt-4 border-t border-white/10 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">
              Locations (max {MAX_LOCATIONS})
            </p>
            <div className="mt-2 flex gap-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="ZIP"
                value={zipDraft}
                onChange={(e) =>
                  setZipDraft(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                className="w-20 rounded-md border border-white/15 bg-[#0a1628] px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-[#E8C84A]/50"
                aria-label="ZIP code"
              />
              <button
                type="button"
                onClick={addZip}
                className="rounded-md border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-2 py-1 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20"
              >
                Add
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {prefs.zips.map((z) => (
                <li
                  key={z}
                  className="flex items-center justify-between gap-2 rounded-md bg-white/[0.05] px-2 py-1 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => setActiveZip(z)}
                    className={[
                      "min-w-0 truncate text-left",
                      z === prefs.activeZip
                        ? "font-semibold text-[#E8C84A]"
                        : "text-white/75 hover:text-white",
                    ].join(" ")}
                  >
                    {z}
                    {z === DEFAULT_ZIP ? " · TPP HQ" : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeZip(z)}
                    disabled={prefs.zips.length <= 1}
                    className="shrink-0 text-white/40 hover:text-red-300 disabled:opacity-30"
                    aria-label={`Remove ${z}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
