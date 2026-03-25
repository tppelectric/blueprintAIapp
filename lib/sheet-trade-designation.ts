/** Values stored in `sheets.trade_designation` JSON map (global 1-based page index → slug). */

export const TRADE_SLUGS = [
  "electrical",
  "low_voltage",
  "architectural",
  "mechanical",
  "plumbing",
  "structural",
  "not_relevant",
] as const;

export type TradeDesignationSlug = (typeof TRADE_SLUGS)[number];

export const TRADE_OPTIONS: {
  slug: TradeDesignationSlug;
  label: string;
  emoji: string;
  short: string;
}[] = [
  { slug: "electrical", label: "Electrical", emoji: "⚡", short: "Elec" },
  { slug: "low_voltage", label: "Low Voltage", emoji: "📶", short: "LV" },
  {
    slug: "architectural",
    label: "Architectural",
    emoji: "🏠",
    short: "Arch",
  },
  { slug: "mechanical", label: "Mechanical/HVAC", emoji: "🔧", short: "Mech" },
  { slug: "plumbing", label: "Plumbing", emoji: "🔵", short: "Plumb" },
  { slug: "structural", label: "Structural", emoji: "🟫", short: "Str" },
  { slug: "not_relevant", label: "Not Relevant", emoji: "⭕", short: "N/A" },
];

export function tradeMeta(slug: string | null | undefined) {
  if (!slug) return null;
  return TRADE_OPTIONS.find((t) => t.slug === slug) ?? null;
}

export function cycleTradeSlug(
  current: string | null | undefined,
): TradeDesignationSlug | null {
  if (!current) return TRADE_SLUGS[0];
  const i = TRADE_SLUGS.indexOf(current as TradeDesignationSlug);
  if (i < 0) return TRADE_SLUGS[0];
  if (i >= TRADE_SLUGS.length - 1) return null;
  return TRADE_SLUGS[i + 1]!;
}

/** Merge per-sheet JSONB maps keyed by global page (string). Later sheets win on duplicate keys. */
export function mergeTradeMapsFromSheets(
  sheets: Array<{ trade_designation?: unknown }>,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const row of sheets) {
    const raw = row.trade_designation;
    if (!raw || typeof raw !== "object") continue;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const pg = parseInt(k, 10);
      if (!Number.isFinite(pg) || pg < 1) continue;
      if (typeof v === "string" && v) out[pg] = v;
    }
  }
  return out;
}

export function sheetIndexForGlobalPage(
  globalPage: number,
  pagesPerDoc: number[],
): number {
  let g = globalPage;
  for (let i = 0; i < pagesPerDoc.length; i++) {
    const n = Math.max(1, pagesPerDoc[i] ?? 1);
    if (g <= n) return i;
    g -= n;
  }
  return Math.max(0, pagesPerDoc.length - 1);
}
