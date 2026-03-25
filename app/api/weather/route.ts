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
  wind: { speed: number };
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
    const hourlySlots = list
      .filter((x) => x.dt >= nowSec - 3600)
      .slice(0, 4)
      .map((x) => {
        const t = new Date(x.dt * 1000);
        return {
          timeLabel: t.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }),
          tempF: Math.round(x.main.temp),
          iconEmoji: openWeatherIconToEmoji(x.weather[0]?.icon),
        };
      });

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
