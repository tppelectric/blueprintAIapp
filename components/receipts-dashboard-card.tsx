"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatReceiptCurrency } from "@/lib/receipts-types";
import { createBrowserClient } from "@/lib/supabase/client";

function startOfWeekMondayLocal(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonthLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function ReceiptsDashboardCard() {
  const [unassigned, setUnassigned] = useState<number | null>(null);
  const [weekTotal, setWeekTotal] = useState<number | null>(null);
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const wk = startOfWeekMondayLocal(new Date()).toISOString();
      const mo = startOfMonthLocal(new Date()).toISOString();

      const { count: ua, error: e1 } = await sb
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .is("job_id", null);
      if (e1) throw e1;
      setUnassigned(ua ?? 0);

      const { data: weekRows, error: e2 } = await sb
        .from("receipts")
        .select("total_amount, created_at")
        .gte("created_at", wk);
      if (e2) throw e2;
      let w = 0;
      for (const r of weekRows ?? []) {
        w += Number((r as { total_amount?: number }).total_amount) || 0;
      }
      setWeekTotal(w);

      const { data: monthRows, error: e3 } = await sb
        .from("receipts")
        .select("total_amount, created_at")
        .gte("created_at", mo);
      if (e3) throw e3;
      let m = 0;
      for (const r of monthRows ?? []) {
        m += Number((r as { total_amount?: number }).total_amount) || 0;
      }
      setMonthTotal(m);
    } catch {
      setUnassigned(null);
      setWeekTotal(null);
      setMonthTotal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Link
      href="/receipts"
      className="app-card block rounded-xl border p-4 transition-colors hover:border-[#E8C84A]/40"
    >
      <p className="text-xs text-[var(--foreground-muted)]">Receipts</p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
        Capture &amp; assign
      </p>
      {loading ? (
        <p className="mt-2 text-xs text-[var(--foreground-muted)]">Loading…</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">
          <li
            className={
              unassigned && unassigned > 0
                ? "font-semibold text-red-400"
                : ""
            }
          >
            {unassigned ?? "—"} unassigned
            {unassigned && unassigned > 0 ? " — needs job" : ""}
          </li>
          <li>
            This week:{" "}
            <span className="tabular-nums text-[#E8C84A]">
              {weekTotal != null ? formatReceiptCurrency(weekTotal) : "—"}
            </span>
          </li>
          <li>
            This month:{" "}
            <span className="tabular-nums text-[#E8C84A]">
              {monthTotal != null ? formatReceiptCurrency(monthTotal) : "—"}
            </span>
          </li>
        </ul>
      )}
      <p className="mt-2 text-xs font-medium text-[#E8C84A]">
        Open receipts →
      </p>
    </Link>
  );
}
