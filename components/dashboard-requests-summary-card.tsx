"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewAdminRequestQueue } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";

const OPEN_STATUSES = [
  "new",
  "in_review",
  "approved",
  "in_progress",
  "waiting",
] as const;

type Counts = Record<(typeof OPEN_STATUSES)[number], number>;

export function DashboardRequestsSummaryCard() {
  const { role } = useUserRole();
  const isStaff = canViewAdminRequestQueue(role);
  const [total, setTotal] = useState<number | null>(null);
  const [byStatus, setByStatus] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("internal_requests")
          .select("status")
          .not("status", "in", "(completed,declined,cancelled)");
        if (cancelled || error) {
          if (!cancelled) {
            setTotal(null);
            setByStatus(null);
          }
          return;
        }
        const counts: Counts = {
          new: 0,
          in_review: 0,
          approved: 0,
          in_progress: 0,
          waiting: 0,
        };
        for (const row of data ?? []) {
          const s = String((row as { status?: string }).status ?? "");
          if (s in counts) counts[s as keyof Counts] += 1;
        }
        const t = Object.values(counts).reduce((a, b) => a + b, 0);
        if (!cancelled) {
          setTotal(t);
          setByStatus(counts);
        }
      } catch {
        if (!cancelled) {
          setTotal(null);
          setByStatus(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0a1628] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-white/55">
        Requests
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-[#E8C84A]">
        {total ?? "—"}
      </p>
      <ul className="mt-3 space-y-1 text-xs text-white/65">
        {OPEN_STATUSES.map((s) => (
          <li key={s} className="flex justify-between gap-2">
            <span className="capitalize">{s.replace(/_/g, " ")}</span>
            <span className="tabular-nums text-white/90">
              {byStatus ? byStatus[s] : "—"}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={isStaff ? "/requests" : "/my-requests"}
        className="mt-3 inline-block text-sm font-semibold text-[#E8C84A] hover:underline"
      >
        {isStaff ? "View All Requests →" : "My requests →"}
      </Link>
    </div>
  );
}
