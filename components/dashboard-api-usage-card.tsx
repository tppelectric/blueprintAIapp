"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";

type ScopeAgg = {
  pagesAnalyzed: number;
  claudeCost: number;
  openaiCost: number;
  totalCost: number;
};

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

async function fetchScope(
  scope: "today" | "month" | "all",
): Promise<ScopeAgg> {
  const r = await fetch(`/api/api-usage?scope=${scope}`);
  const j = (await r.json()) as ScopeAgg & { error?: string };
  if (!r.ok || j.error) {
    return {
      pagesAnalyzed: 0,
      claudeCost: 0,
      openaiCost: 0,
      totalCost: 0,
    };
  }
  return {
    pagesAnalyzed: Number(j.pagesAnalyzed ?? 0),
    claudeCost: Number(j.claudeCost ?? 0),
    openaiCost: Number(j.openaiCost ?? 0),
    totalCost: Number(j.totalCost ?? 0),
  };
}

export function DashboardApiUsageCard() {
  const { canSeeApiCosts, loading: roleLoading } = useUserRole();
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

  useEffect(() => {
    if (roleLoading || !canSeeApiCosts) return;
    void refresh();
  }, [refresh, roleLoading, canSeeApiCosts]);

  if (roleLoading || !canSeeApiCosts) return null;

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
              className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] transition-colors duration-200 hover:bg-[#E8C84A]/20 disabled:opacity-50"
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  const d = data ?? {
    pagesAnalyzed: 0,
    claudeCost: 0,
    openaiCost: 0,
    totalCost: 0,
  };

  const pagesLabel =
    title === "Today"
      ? "Today"
      : title === "This month"
        ? "This month"
        : "All time";

  return (
    <div className="rounded-xl border border-white/8 bg-[#0a1628]/50 p-4 text-sm">
      <h3 className="font-semibold text-[#E8C84A]">{title}</h3>
      <ul className="mt-2 space-y-2 text-white/80">
        <li className="tabular-nums leading-snug">
          <span className="text-white/60">{pagesLabel}:</span>{" "}
          {d.pagesAnalyzed} page{d.pagesAnalyzed === 1 ? "" : "s"} analyzed
          {" — "}
          <span className="font-semibold text-[#E8C84A]">
            {money(d.totalCost)}
          </span>
        </li>
        {!allTime ? (
          <>
            <li className="text-xs text-white/55">
              Claude (est.):{" "}
              <span className="tabular-nums text-white/75">
                {money(d.claudeCost)}
              </span>
            </li>
            <li className="text-xs text-white/55">
              OpenAI (est.):{" "}
              <span className="tabular-nums text-white/75">
                {money(d.openaiCost)}
              </span>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}
