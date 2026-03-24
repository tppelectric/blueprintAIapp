"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

type ScopeAgg = {
  pagesAnalyzed: number;
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
    return { pagesAnalyzed: 0, totalCost: 0 };
  }
  return {
    pagesAnalyzed: Number(j.pagesAnalyzed ?? 0),
    totalCost: Number(j.totalCost ?? 0),
  };
}

export function HomepageApiUsageWidget() {
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
    if (!loggedIn) return;
    void load();
  }, [loggedIn, load]);

  if (!sessionReady || !loggedIn) return null;

  const t = today ?? { pagesAnalyzed: 0, totalCost: 0 };
  const mo = month ?? { pagesAnalyzed: 0, totalCost: 0 };
  const al = all ?? { pagesAnalyzed: 0, totalCost: 0 };

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
            Today: {t.pagesAnalyzed} page{t.pagesAnalyzed === 1 ? "" : "s"}{" "}
            analyzed — {money(t.totalCost)}
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
            aria-label={open ? "Collapse API usage details" : "Expand API usage details"}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <p className="text-xs text-white/50 sm:text-sm">
            Totals from blueprint scans (Claude analyze-page). Use Refresh after
            scanning.
          </p>
          <ul className="mt-3 space-y-2.5 text-sm text-white/90">
            <li className="tabular-nums">
              <span className="text-white/65">Today:</span>{" "}
              {t.pagesAnalyzed} page{t.pagesAnalyzed === 1 ? "" : "s"} analyzed
              {" — "}
              <span className="font-semibold text-[#E8C84A]">
                {money(t.totalCost)}
              </span>
            </li>
            <li className="tabular-nums">
              <span className="text-white/65">This month:</span>{" "}
              {mo.pagesAnalyzed} page{mo.pagesAnalyzed === 1 ? "" : "s"}
              {" — "}
              <span className="font-semibold text-[#E8C84A]">
                {money(mo.totalCost)}
              </span>
            </li>
            <li className="tabular-nums">
              <span className="text-white/65">All time:</span>{" "}
              {al.pagesAnalyzed} page{al.pagesAnalyzed === 1 ? "" : "s"}
              {" — "}
              <span className="font-semibold text-[#E8C84A]">
                {money(al.totalCost)}
              </span>
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
