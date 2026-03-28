"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import {
  isTerminalStatus,
  overdueOpenCount,
  urgentOpenCount,
} from "@/lib/internal-request-utils";
import { createBrowserClient } from "@/lib/supabase/client";

export function DashboardInternalRequestsAdminCard() {
  const [newN, setNewN] = useState<number | null>(null);
  const [urgentN, setUrgentN] = useState<number | null>(null);
  const [overdueN, setOverdueN] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb.from("internal_requests").select("*");
        if (cancelled || error) {
          if (!cancelled) {
            setNewN(null);
            setUrgentN(null);
            setOverdueN(null);
          }
          return;
        }
        const rows = (data ?? []).map((r) =>
          mapInternalRequestRow(r as Record<string, unknown>),
        );
        const open = rows.filter((r) => !isTerminalStatus(r.status));
        setNewN(open.filter((r) => r.status === "new").length);
        setUrgentN(urgentOpenCount(rows));
        setOverdueN(overdueOpenCount(rows));
      } catch {
        if (!cancelled) {
          setNewN(null);
          setUrgentN(null);
          setOverdueN(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/requests"
      className="app-card block rounded-xl border border-violet-400/25 bg-violet-500/10 p-4 transition-colors hover:border-[#E8C84A]/40"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-violet-200/90">
        Internal requests
      </p>
      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
        New:{" "}
        <span className="font-semibold tabular-nums text-[var(--foreground)]">
          {newN ?? "—"}
        </span>
        {" · "}
        Urgent:{" "}
        <span className="font-semibold tabular-nums text-orange-200">
          {urgentN ?? "—"}
        </span>
        {" · "}
        Open &gt;3d:{" "}
        <span className="font-semibold tabular-nums text-amber-200">
          {overdueN ?? "—"}
        </span>
      </p>
      <p className="mt-2 text-xs font-semibold text-[#E8C84A]">
        Open admin queue →
      </p>
    </Link>
  );
}
