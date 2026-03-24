"use client";

import { useCallback, useState } from "react";

type ScopeAgg = {
  pagesAnalyzed: number;
  claudeCost: number;
  openaiCost: number;
  totalCost: number;
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

async function fetchScope(
  scope: "today" | "month" | "all",
): Promise<ScopeAgg | null> {
  const r = await fetch(`/api/api-usage?scope=${scope}`);
  const j = (await r.json()) as ScopeAgg & { error?: string };
  if (!r.ok || j.error) return null;
  return {
    pagesAnalyzed: Number(j.pagesAnalyzed ?? 0),
    claudeCost: Number(j.claudeCost ?? 0),
    openaiCost: Number(j.openaiCost ?? 0),
    totalCost: Number(j.totalCost ?? 0),
  };
}

export function DashboardApiUsageCard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<ScopeAgg | null>(null);
  const [month, setMonth] = useState<ScopeAgg | null>(null);
  const [all, setAll] = useState<ScopeAgg | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [t, m, a] = await Promise.all([
        fetchScope("today"),
        fetchScope("month"),
        fetchScope("all"),
      ]);
      setToday(t);
      setMonth(m);
      setAll(a);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && !today && !month && !all) void refresh();
        }}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-base font-semibold text-white">
          API Usage &amp; Costs
        </span>
        <span className="text-[#E8C84A]" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-5 pb-5 pt-2">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20 disabled:opacity-50"
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <UsageBlock title="Today" data={today} />
            <UsageBlock title="This month" data={month} />
            <UsageBlock title="All time" data={all} allTime />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UsageBlock({
  title,
  data,
  allTime,
}: {
  title: string;
  data: ScopeAgg | null;
  allTime?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0a1628]/50 p-4 text-sm">
      <h3 className="font-semibold text-[#E8C84A]">{title}</h3>
      {!data ? (
        <p className="mt-2 text-white/45">—</p>
      ) : (
        <ul className="mt-2 space-y-1 text-white/75">
          <li>
            Pages analyzed:{" "}
            <span className="tabular-nums text-white">{data.pagesAnalyzed}</span>
          </li>
          {allTime ? (
            <li>
              Total spent:{" "}
              <span className="tabular-nums text-[#E8C84A]">
                {money(data.totalCost)}
              </span>
            </li>
          ) : (
            <>
              <li>
                Claude API:{" "}
                <span className="tabular-nums">{money(data.claudeCost)}</span>
              </li>
              <li>
                OpenAI API:{" "}
                <span className="tabular-nums">{money(data.openaiCost)}</span>
              </li>
              <li className="pt-1 font-medium text-white">
                {title === "Today" ? "Today total" : "Month total"}:{" "}
                <span className="tabular-nums text-[#E8C84A]">
                  {money(data.totalCost)}
                </span>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
