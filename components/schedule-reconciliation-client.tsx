"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DarkListSkeleton, EmptyState } from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import {
  addDays,
  endOfWeekSunday,
  startOfWeekMonday,
  toIsoDate,
} from "@/lib/time-calendar-helpers";

type ReconStatus = "matched" | "no_show" | "unscheduled";

type ReconRow = {
  employeeId: string;
  employeeName: string;
  date: string;
  scheduledJob: string | null;
  actualHours: number;
  status: ReconStatus;
};

const STATUS: Record<ReconStatus, { label: string; cls: string }> = {
  matched: { label: "✓ Matched", cls: "text-emerald-300" },
  no_show: { label: "Scheduled · no punch", cls: "text-red-300" },
  unscheduled: { label: "Worked · not scheduled", cls: "text-[#E8C84A]" },
};

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ScheduleReconciliationClient() {
  const { showToast } = useAppToast();
  const [cursor, setCursor] = useState(() => new Date());
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const range = useMemo(() => {
    const mon = startOfWeekMonday(cursor);
    const sun = endOfWeekSunday(mon);
    return { from: toIsoDate(mon), to: toIsoDate(sun) };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const r = await fetch(
        `/api/schedule/reconciliation?from=${range.from}&to=${range.to}`,
        { credentials: "include" },
      );
      if (r.status === 403) {
        setForbidden(true);
        setRows([]);
        return;
      }
      const j = (await r.json()) as { rows?: ReconRow[]; error?: string };
      if (!r.ok) {
        showToast({ message: j.error ?? "Could not load.", variant: "error" });
        setRows([]);
        return;
      }
      setRows(j.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, ReconRow[]>();
    for (const r of rows) {
      const a = m.get(r.date) ?? [];
      a.push(r);
      m.set(r.date, a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="team_time" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-3xl flex-1 py-8 md:py-10">
        <Link href="/schedule" className="text-sm text-[#E8C84A] hover:underline">
          ← Schedule
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Reconciliation</h1>
        <p className="mt-1 text-sm text-white/55">
          Scheduled crew vs actual clocked hours (from time punches). Flags
          no-shows and unscheduled work.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((c) => addDays(c, -7))}
            className="btn-secondary btn-h-11 !min-h-0 !py-2 !text-xs"
          >
            ← Prev week
          </button>
          <button
            type="button"
            onClick={() => setCursor((c) => addDays(c, 7))}
            className="btn-secondary btn-h-11 !min-h-0 !py-2 !text-xs"
          >
            Next week →
          </button>
          <span className="ml-1 text-sm font-medium text-[#E8C84A]">
            {range.from} – {range.to}
          </span>
        </div>

        {loading ? (
          <DarkListSkeleton className="mt-8" rows={6} />
        ) : forbidden ? (
          <p className="mt-8 text-sm text-amber-200/80">
            Admins only — you don&apos;t have access to reconciliation.
          </p>
        ) : byDate.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<span aria-hidden>📊</span>}
              title="Nothing to reconcile this week"
              description="Once crew are scheduled and punch in, planned vs actual hours compare here."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {byDate.map(([d, list]) => (
              <div key={d}>
                <p className="text-sm font-semibold text-white/80">
                  {prettyDate(d)}
                </p>
                <div className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
                  <table className="w-full min-w-[460px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase text-white/45">
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Scheduled</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr
                          key={`${r.employeeId}-${r.date}`}
                          className="border-b border-white/5 last:border-0"
                        >
                          <td className="px-3 py-2 font-medium text-white">
                            {r.employeeName}
                          </td>
                          <td className="px-3 py-2 text-white/70">
                            {r.scheduledJob ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-white/70">
                            {r.actualHours > 0 ? `${r.actualHours}h` : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-xs font-semibold ${STATUS[r.status].cls}`}
                          >
                            {STATUS[r.status].label}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
