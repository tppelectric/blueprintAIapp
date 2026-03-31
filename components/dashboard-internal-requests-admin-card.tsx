"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  isTerminalStatus,
  overdueOpenCount,
  urgentOpenCount,
} from "@/lib/internal-request-utils";
import type { InternalRequestRow } from "@/lib/internal-request-types";
import { useDashboardSwrAuthUserId } from "@/lib/hooks/dashboard-swr-auth";
import { useRequests } from "@/lib/hooks/useRequests";

export function DashboardInternalRequestsAdminCard() {
  const userId = useDashboardSwrAuthUserId();
  const { data, error, isLoading } = useRequests(userId);

  const metrics = useMemo(() => {
    if (!data) return null;
    const open = data.filter((r: InternalRequestRow) => !isTerminalStatus(r.status));
    return {
      newN: open.filter((r: InternalRequestRow) => r.status === "new").length,
      urgentN: urgentOpenCount(data),
      overdueN: overdueOpenCount(data),
    };
  }, [data]);

  const showDash = Boolean(error) || (isLoading && data === undefined);

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
          {showDash || !metrics ? "—" : metrics.newN}
        </span>
        {" · "}
        Urgent:{" "}
        <span className="font-semibold tabular-nums text-orange-200">
          {showDash || !metrics ? "—" : metrics.urgentN}
        </span>
        {" · "}
        Open &gt;3d:{" "}
        <span className="font-semibold tabular-nums text-amber-200">
          {showDash || !metrics ? "—" : metrics.overdueN}
        </span>
      </p>
      <p className="mt-2 text-xs font-semibold text-[#E8C84A]">
        Open admin queue →
      </p>
    </Link>
  );
}
