import { NextRequest, NextResponse } from "next/server";
import { openWeatherIconToEmoji } from "@/lib/weather-openweather";

export const dynamic = "force-dynamic";

type OwCurrent = {
  name: string;
  sys?: { country?: string };
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  wind: { speed: number; deg?: number };
  weather: { description: string; icon: string }[];
};

type OwForecastItem = {
  dt: number;
  dt_txt: string;
  main: { temp: number };
  weather: { icon: string }[];
};

type OwForecast = {
  list: OwForecastItem[];
};

function windDirectionArrow(deg: number | undefined): string {
  if (deg == null || Number.isNaN(deg)) return "↑";
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const i = ((Math.round(deg / 45) % 8) + 8) % 8;
  return arrows[i]!;
}

function interpolateHourlySlots(
  nowSec: number,
  currentTemp: number,
  currentIcon: string,
  list: OwForecastItem[],
): { timeLabel: string; tempF: number; iconEmoji: string }[] {
  const sorted = [...list].sort((a, b) => a.dt - b.dt);
  const points: { dt: number; temp: number; icon: string }[] = [
    { dt: nowSec, temp: currentTemp, icon: currentIcon },
  ];
  for (const x of sorted) {
    if (x.dt <= nowSec) continue;
    points.push({
      dt: x.dt,
      temp: x.main.temp,
      icon: x.weather[0]?.icon ?? "02d",
    });
  }
  const dedup: typeof points = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (last && last.dt === p.dt) {
      dedup[dedup.length - 1] = p;
    } else {
      dedup.push(p);
    }
  }

  const sampleAt = (targetSec: number) => {
    const pts = dedup;
    if (pts.length === 0) {
      return {
        tempF: Math.round(currentTemp),
        iconEmoji: openWeatherIconToEmoji(currentIcon),
      };
    }
    if (targetSec <= pts[0]!.dt) {
      const p = pts[0]!;
      return {
        tempF: Math.round(p.temp),
        iconEmoji: openWeatherIconToEmoji(p.icon),
      };
    }
    const lastP = pts[pts.length - 1]!;
    if (targetSec >= lastP.dt) {
      return {
        tempF: Math.round(lastP.temp),
        iconEmoji: openWeatherIconToEmoji(lastP.icon),
      };
    }
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1]!.dt < targetSec) i += 1;
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const span = b.dt - a.dt;
    const frac = span === 0 ? 0 : (targetSec - a.dt) / span;
    const temp = a.temp + frac * (b.temp - a.temp);
    const icon = frac < 0.5 ? a.icon : b.icon;
    return {
      tempF: Math.round(temp),
      iconEmoji: openWeatherIconToEmoji(icon),
    };
  };

  const slots: { timeLabel: string; tempF: number; iconEmoji: string }[] = [
    {
      timeLabel: "Now",
      tempF: Math.round(currentTemp),
      iconEmoji: openWeatherIconToEmoji(currentIcon),
    },
  ];
  for (let n = 1; n <= 5; n += 1) {
    const targetSec = nowSec + n * 3600;
    const d = new Date(targetSec * 1000);
    const timeLabel = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    slots.push({ timeLabel, ...sampleAt(targetSec) });
  }
  return slots;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get("zip")?.trim() ?? "";
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json(
      { error: "Invalid US ZIP. Use 5 digits." },
      { status: 400 },
    );
  }

  const key = process.env.OPENWEATHERMAP_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Weather is not configured (missing OPENWEATHERMAP_API_KEY)." },
      { status: 503 },
    );
  }

  const base = "https://api.openweathermap.org/data/2.5";
  try {
    const [curRes, fcRes] = await Promise.all([
      fetch(
        `${base}/weather?zip=${encodeURIComponent(zip)},us&appid=${encodeURIComponent(key)}&units=imperial`,
        { cache: "no-store" },
      ),
      fetch(
        `${base}/forecast?zip=${encodeURIComponent(zip)},us&appid=${encodeURIComponent(key)}&units=imperial`,
        { cache: "no-store" },
      ),
    ]);

    if (!curRes.ok) {
      const errText = await curRes.text();
      let msg = "Could not load current weather.";
      try {
        const j = JSON.parse(errText) as { message?: string };
        if (j.message) msg = String(j.message);
      } catch {
        /* ignore */
      }
      return NextResponse.json({ error: msg }, { status: curRes.status });
    }
    if (!fcRes.ok) {
      return NextResponse.json(
        { error: "Could not load forecast." },
        { status: fcRes.status },
      );
    }

    const current = (await curRes.json()) as OwCurrent;
    const forecast = (await fcRes.json()) as OwForecast;
    const list = forecast.list ?? [];

    const w0 = current.weather[0];
    const updatedAt = Date.now();

    const nowSec = Math.floor(Date.now() / 1000);
    const wIcon = w0?.icon ?? "02d";
    const hourlySlots = interpolateHourlySlots(
      nowSec,
      current.main.temp,
      wIcon,
      list,
    );

    const byDate = new Map<
      string,
      { temps: number[]; icon: string; dt: number }
    >();
    for (const x of list) {
      const dayKey = x.dt_txt.slice(0, 10);
      const prev = byDate.get(dayKey);
      const icon = x.weather[0]?.icon ?? "02d";
      if (!prev) {
        byDate.set(dayKey, {
          temps: [x.main.temp],
          icon,
          dt: x.dt,
        });
      } else {
        prev.temps.push(x.main.temp);
        if (x.dt < prev.dt) prev.dt = x.dt;
      }
    }

    const sortedDays = [...byDate.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const daily = sortedDays.slice(0, 5).map(([dateStr, v]) => {
      const high = Math.round(Math.max(...v.temps));
      const d = new Date(dateStr + "T12:00:00");
      return {
        dayLabel: formatDayLabel(d),
        highF: high,
        iconEmoji: openWeatherIconToEmoji(v.icon),
      };
    });

    const cityLine =
      zip === "12601"
        ? "Poughkeepsie, NY"
        : `${current.name}${current.sys?.country ? `, ${current.sys.country}` : ""}`;

    return NextResponse.json({
      zip,
      updatedAt,
      current: {
        cityLabel: cityLine,
        tempF: Math.round(current.main.temp),
        feelsLikeF: Math.round(current.main.feels_like),
        humidity: Math.round(current.main.humidity),
        windMph: Math.round(current.wind.speed * 10) / 10,
        windDeg: current.wind.deg,
        windArrow: windDirectionArrow(current.wind.deg),
        description:
          w0?.description?.replace(/\b\w/g, (c) => c.toUpperCase()) ??
          "—",
        iconEmoji: openWeatherIconToEmoji(w0?.icon),
      },
      daily,
      hourly: hourlySlots,
    });
  } catch (e) {
    console.error("[api/weather]", e);
    return NextResponse.json(
      { error: "Weather request failed." },
      { status: 502 },
    );
  }
}
