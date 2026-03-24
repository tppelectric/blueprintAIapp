"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

type ScopeAgg = {
  pagesAnalyzed: number;
  totalCost: number;
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

async function fetchScope(
  scope: "today" | "month",
): Promise<ScopeAgg | null> {
  const r = await fetch(`/api/api-usage?scope=${scope}`);
  const j = (await r.json()) as ScopeAgg & { error?: string };
  if (!r.ok || j.error) return null;
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
      const [t, m] = await Promise.all([
        fetchScope("today"),
        fetchScope("month"),
      ]);
      setToday(t);
      setMonth(m);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn || !open) return;
    void load();
  }, [loggedIn, open, load]);

  if (!sessionReady || !loggedIn) return null;

  return (
    <section className="mx-auto mt-10 w-full max-w-4xl rounded-2xl border border-white/12 bg-white/[0.06] text-left shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="touch-target flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5 sm:py-4"
      >
        <span className="text-sm font-semibold text-white sm:text-base">
          API usage
        </span>
        <span className="text-[#E8C84A]" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
          <p className="text-xs text-white/50 sm:text-sm">
            Same totals as the dashboard cost card (refresh if needed).
          </p>
          <div className="mt-3 space-y-3 text-sm text-white/85">
            <p>
              <span className="text-white/60">Today&apos;s API cost:</span>{" "}
              <span className="tabular-nums font-semibold text-[#E8C84A]">
                {today ? money(today.totalCost) : busy ? "…" : "—"}
              </span>
            </p>
            <p>
              <span className="text-white/60">This month:</span>{" "}
              <span className="tabular-nums font-semibold text-[#E8C84A]">
                {month ? money(month.totalCost) : busy ? "…" : "—"}
              </span>
              {month ? (
                <span className="text-white/55">
                  {" "}
                  ({month.pagesAnalyzed} page
                  {month.pagesAnalyzed === 1 ? "" : "s"} analyzed)
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="mt-3 rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-2 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20 disabled:opacity-50"
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
