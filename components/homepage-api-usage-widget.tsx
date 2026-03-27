"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import {
  emptyUsageCostBreakdown,
  USAGE_BREAKDOWN_ROWS,
  type UsageCostBreakdown,
} from "@/lib/api-usage-categories";

type ScopeAgg = {
  pagesAnalyzed: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  breakdown: UsageCostBreakdown;
};

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function fmtTok(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function parseAgg(j: Record<string, unknown>): ScopeAgg {
  const b = j.breakdown as UsageCostBreakdown | undefined;
  const base = emptyUsageCostBreakdown();
  const breakdown: UsageCostBreakdown = b
    ? {
        blueprintScanning: Number(b.blueprintScanning ?? 0),
        receiptScanning: Number(b.receiptScanning ?? 0),
        dailyLogAi: Number(b.dailyLogAi ?? 0),
        projectAnalysis: Number(b.projectAnalysis ?? 0),
        necChecker: Number(b.necChecker ?? 0),
        otherAi: Number(b.otherAi ?? 0),
      }
    : base;
  return {
    pagesAnalyzed: Number(j.pagesAnalyzed ?? 0),
    totalCost: Number(j.totalCost ?? 0),
    totalInputTokens: Number(j.totalInputTokens ?? 0),
    totalOutputTokens: Number(j.totalOutputTokens ?? 0),
    breakdown,
  };
}

async function fetchScope(
  scope: "today" | "month" | "all",
): Promise<ScopeAgg> {
  const r = await fetch(`/api/api-usage?scope=${scope}`);
  const j = (await r.json()) as Record<string, unknown> & { error?: string };
  if (!r.ok || j.error) {
    return {
      pagesAnalyzed: 0,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      breakdown: emptyUsageCostBreakdown(),
    };
  }
  return parseAgg(j);
}

function BreakdownList({ b, total }: { b: UsageCostBreakdown; total: number }) {
  return (
    <ul className="mt-2 space-y-1.5 text-xs text-white/80 sm:text-sm">
      {USAGE_BREAKDOWN_ROWS.map(({ key, label }) => (
        <li key={key} className="flex justify-between gap-3 tabular-nums">
          <span className="text-white/60">{label}:</span>
          <span>{money(b[key])}</span>
        </li>
      ))}
      <li className="flex justify-between gap-3 border-t border-white/10 pt-2 font-semibold tabular-nums text-[#E8C84A]">
        <span>TOTAL:</span>
        <span>{money(total)}</span>
      </li>
    </ul>
  );
}

export function HomepageApiUsageWidget() {
  const { canSeeApiCosts, loading: roleLoading } = useUserRole();
  const [sessionReady, setSessionReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<ScopeAgg | null>(null);
  const [month, setMonth] = useState<ScopeAgg | null>(null);
  const [all, setAll] = useState<ScopeAgg | null>(null);

  useEffect(() => {
    const sb = createBrowserClient();
    let cancelled = false;
    void sb.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setLoggedIn(Boolean(data.session?.user));
        setSessionReady(true);
      }
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, session) => {
      setLoggedIn(Boolean(session?.user));
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
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
    if (!loggedIn || !canSeeApiCosts || roleLoading) return;
    void load();
  }, [loggedIn, load, canSeeApiCosts, roleLoading]);

  if (!sessionReady || !loggedIn) return null;
  if (roleLoading || !canSeeApiCosts) return null;

  const t = today ?? {
    pagesAnalyzed: 0,
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    breakdown: emptyUsageCostBreakdown(),
  };
  const mo = month ?? {
    pagesAnalyzed: 0,
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    breakdown: emptyUsageCostBreakdown(),
  };
  const al = all ?? {
    pagesAnalyzed: 0,
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    breakdown: emptyUsageCostBreakdown(),
  };

  const tokToday =
    t.totalInputTokens + t.totalOutputTokens > 0
      ? `${fmtTok(t.totalInputTokens)} in + ${fmtTok(t.totalOutputTokens)} out`
      : "0 tokens";

  return (
    <section
      className="mx-auto mt-10 w-full max-w-4xl rounded-2xl border border-white/12 bg-white/[0.06] text-left shadow-sm"
      aria-labelledby="homepage-api-usage-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="touch-target min-w-0 flex-1 text-left"
          id="homepage-api-usage-heading"
        >
          <span className="text-sm font-semibold text-white sm:text-base">
            API usage
          </span>
          <p className="mt-1 text-xs text-white/55 sm:text-sm">
            Today: {tokToday} — {money(t.totalCost)} ·{" "}
            {t.pagesAnalyzed} tracked call
            {t.pagesAnalyzed === 1 ? "" : "s"}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void load();
            }}
            className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-2 text-xs font-semibold text-[#E8C84A] transition-colors duration-200 hover:bg-[#E8C84A]/20 disabled:opacity-50"
          >
            {busy ? "…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg px-2 py-2 text-[#E8C84A]"
            aria-expanded={open}
            aria-label={
              open ? "Collapse API usage details" : "Expand API usage details"
            }
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <p className="text-xs text-white/50 sm:text-sm">
            Costs by feature (Claude + recorded OpenAI add-ons). Expand totals
            include all AI routes.
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Today
              </h3>
              <p className="mt-1 text-sm tabular-nums text-white/90">
                {fmtTok(t.totalInputTokens)} in ·{" "}
                {fmtTok(t.totalOutputTokens)} out tokens
              </p>
              <BreakdownList b={t.breakdown} total={t.totalCost} />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                This month
              </h3>
              <p className="mt-1 text-sm tabular-nums text-white/90">
                {fmtTok(mo.totalInputTokens)} in ·{" "}
                {fmtTok(mo.totalOutputTokens)} out tokens
              </p>
              <BreakdownList b={mo.breakdown} total={mo.totalCost} />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                All time
              </h3>
              <p className="mt-1 text-sm tabular-nums text-white/90">
                {fmtTok(al.totalInputTokens)} in ·{" "}
                {fmtTok(al.totalOutputTokens)} out tokens
              </p>
              <BreakdownList b={al.breakdown} total={al.totalCost} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
