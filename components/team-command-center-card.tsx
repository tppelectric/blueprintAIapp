"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTeamClockSummary } from "@/hooks/use-team-clock-summary";
import {
  countCeAttentionWithin,
  countExpiringWithin30Days,
  countInPursuit,
} from "@/lib/license-alerts";
import { mapLicenseRow } from "@/lib/license-mappers";
import { mapAssetRow } from "@/lib/inventory-mappers";
import { countVehiclesNeedingCommandCenterAttention } from "@/lib/vehicle-alerts";
import { useUserRole } from "@/hooks/use-user-role";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import {
  isTerminalStatus,
  overdueOpenCount,
  urgentOpenCount,
} from "@/lib/internal-request-utils";
import { fetchPendingTimeOffRequestCount } from "@/lib/pending-time-off-count";
import { fetchUnassignedReceiptsCount } from "@/lib/unassigned-receipts-count";
import { createBrowserClient } from "@/lib/supabase/client";
import { canViewAdminRequestQueue } from "@/lib/user-roles";

type Props = {
  enabled: boolean;
  surface?: "app" | "marketing";
  /** Denser layout for dashboard column. */
  compact?: boolean;
  /** Show Team clock + Timesheets links (homepage command center). */
  showQuickLinks?: boolean;
};

export function TeamCommandCenterCard({
  enabled,
  surface = "app",
  compact = false,
  showQuickLinks = false,
}: Props) {
  const { role, loading: roleLoading } = useUserRole();
  const {
    loading,
    onClock,
    totalTeam,
    workingNames,
    otAlertCount,
    otAlertNames,
    activeJobsToday,
    stragglers,
    stragglerCount,
  } = useTeamClockSummary(enabled);

  const [unassignedReceipts, setUnassignedReceipts] = useState<number | null>(
    null,
  );
  const [pendingTimeOff, setPendingTimeOff] = useState<number | null>(null);
  const [licExpiring30, setLicExpiring30] = useState<number | null>(null);
  const [licCe45, setLicCe45] = useState<number | null>(null);
  const [licPursuit, setLicPursuit] = useState<number | null>(null);
  const [irNew, setIrNew] = useState<number | null>(null);
  const [irUrgent, setIrUrgent] = useState<number | null>(null);
  const [irOverdue, setIrOverdue] = useState<number | null>(null);
  const [fleetAttentionCount, setFleetAttentionCount] = useState<number | null>(
    null,
  );
  const [expanded, setExpanded] = useState(true);
  const [expandedStorageReady, setExpandedStorageReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("command-center-expanded");
      if (saved !== null) setExpanded(saved === "true");
    } catch {
      /* ignore */
    }
    setExpandedStorageReady(true);
  }, []);

  useEffect(() => {
    if (!expandedStorageReady) return;
    try {
      localStorage.setItem("command-center-expanded", String(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded, expandedStorageReady]);

  useEffect(() => {
    if (!enabled || !showQuickLinks) {
      setUnassignedReceipts(null);
      setPendingTimeOff(null);
      setLicExpiring30(null);
      setLicCe45(null);
      setLicPursuit(null);
      setIrNew(null);
      setIrUrgent(null);
      setIrOverdue(null);
      setFleetAttentionCount(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const sb = createBrowserClient();
        const [unassignedReceiptCount, licRes] = await Promise.all([
          fetchUnassignedReceiptsCount(sb),
          sb.from("licenses").select("*"),
        ]);
        if (cancelled) return;
        setUnassignedReceipts(unassignedReceiptCount);
        const pendingTimeOffCount = await fetchPendingTimeOffRequestCount(sb);
        if (cancelled) return;
        setPendingTimeOff(pendingTimeOffCount);
        if (!licRes.error && licRes.data) {
          const rows = licRes.data.map((r) =>
            mapLicenseRow(r as Record<string, unknown>),
          );
          setLicExpiring30(countExpiringWithin30Days(rows));
          setLicCe45(countCeAttentionWithin(rows, 45));
          setLicPursuit(countInPursuit(rows));
        } else {
          setLicExpiring30(null);
          setLicCe45(null);
          setLicPursuit(null);
        }

        if (!roleLoading && canViewAdminRequestQueue(role)) {
          const irRes = await sb.from("internal_requests").select("*");
          if (!irRes.error && irRes.data) {
            const irRows = irRes.data.map((r) =>
              mapInternalRequestRow(r as Record<string, unknown>),
            );
            const open = irRows.filter((r) => !isTerminalStatus(r.status));
            setIrNew(open.filter((r) => r.status === "new").length);
            setIrUrgent(urgentOpenCount(irRows));
            setIrOverdue(overdueOpenCount(irRows));
          } else {
            setIrNew(null);
            setIrUrgent(null);
            setIrOverdue(null);
          }
        } else {
          setIrNew(null);
          setIrUrgent(null);
          setIrOverdue(null);
        }

        const vRes = await sb
          .from("assets")
          .select("*")
          .eq("asset_type", "vehicle");
        if (cancelled) return;
        if (vRes.error || !vRes.data) {
          setFleetAttentionCount(null);
        } else {
          const vehicles = vRes.data.map((r) =>
            mapAssetRow(r as Record<string, unknown>),
          );
          setFleetAttentionCount(
            countVehiclesNeedingCommandCenterAttention(vehicles),
          );
        }
      } catch {
        if (!cancelled) {
          setUnassignedReceipts(null);
          setPendingTimeOff(0);
          setLicExpiring30(null);
          setLicCe45(null);
          setLicPursuit(null);
          setIrNew(null);
          setIrUrgent(null);
          setIrOverdue(null);
          setFleetAttentionCount(null);
        }
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, showQuickLinks, role, roleLoading]);

  if (!enabled) return null;

  const isMarketing = surface === "marketing";
  const marketingHomeSplit = showQuickLinks && isMarketing;
  const sectionHeaderClass =
    "text-[11px] font-bold uppercase tracking-[0.1em] text-[#E8C84A]";
  const cardClass = isMarketing
    ? marketingHomeSplit
      ? "mx-auto w-full max-w-6xl rounded-xl border border-[#E8C84A]/30 bg-white/[0.05] p-4 text-left shadow-lg shadow-black/25"
      : "rounded-xl border border-white/12 bg-white/[0.06] p-5 text-left shadow-lg shadow-black/25 ring-1 ring-white/[0.08]"
    : compact
      ? "app-card app-card-pad-lg"
      : "app-card app-card-pad-lg";

  const titleClass = isMarketing
    ? "text-lg font-semibold text-white"
    : "text-base font-semibold text-[var(--foreground)]";
  const muted = isMarketing
    ? "text-white/60"
    : "text-[var(--foreground-muted)]";
  const fg = isMarketing ? "text-white" : "text-[var(--foreground)]";
  const gold = "text-[#E8C84A]";

  const headerBlock = (
    <div
      className={`flex flex-wrap items-start justify-between gap-2 ${marketingHomeSplit ? "border-b border-[#E8C84A]/20 pb-3" : ""}`}
    >
      <div>
        <h2
          className={
            marketingHomeSplit
              ? "text-base font-semibold text-white lg:text-lg"
              : titleClass
          }
        >
          {showQuickLinks ? "Command Center" : "Team overview"}
        </h2>
        {showQuickLinks ? (
          <p
            className={`mt-1 text-[10px] leading-snug ${muted} lg:text-xs`}
          >
            Live punch data · full refresh every 30 seconds
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {otAlertCount > 0 ? (
          <span className="shrink-0 rounded-full bg-orange-500/90 px-2 py-0.5 text-[10px] font-bold text-[#0a1628]">
            OT {otAlertCount}
          </span>
        ) : null}
        {stragglerCount > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
            Open {stragglerCount}
          </span>
        ) : null}
        <span
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Collapse command center" : "Expand command center"
          }
          className="ml-auto inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-[#E8C84A] hover:bg-white/10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((x) => !x);
            }
          }}
        >
          {expanded ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M18 15l-6-6-6 6" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </span>
      </div>
    </div>
  );

  const onClockBlock = (
    <p className={`${marketingHomeSplit ? "mt-0 text-sm" : "mt-3 text-sm"} ${fg}`}>
      <span className={`font-semibold tabular-nums ${gold}`}>{onClock}</span>{" "}
      of <span className="tabular-nums">{totalTeam}</span> on the clock
      {totalTeam > 0 ? (
        <span className={`ml-1 text-xs ${muted}`}>
          ({Math.round((onClock / Math.max(1, totalTeam)) * 100)}%)
        </span>
      ) : null}
    </p>
  );

  const activeJobsHeading = (
    <p className={`text-sm ${fg}`}>
      <span aria-hidden>🏗️</span>{" "}
      <span
        className={`font-semibold tabular-nums ${isMarketing ? "text-sky-300" : gold}`}
      >
        {activeJobsToday.length}
      </span>{" "}
      active job{activeJobsToday.length === 1 ? "" : "s"} today
    </p>
  );

  const jobsList = (slice: number, jobCompact: boolean) =>
    activeJobsToday.length > 0 ? (
      <ul
        className={`space-y-1 ${marketingHomeSplit ? "" : "mt-3 border-t pt-3"} ${isMarketing ? "border-white/10" : "border-[var(--border)]"}`}
      >
        {activeJobsToday.slice(0, slice).map((j) => (
          <li
            key={j.key}
            className={`text-[11px] leading-snug ${jobCompact ? "" : "text-xs"}`}
          >
            <span className={`font-medium ${fg}`}>{j.jobName}</span>
            <span className={muted}>
              {" "}
              · {j.onSiteCount} on site · {j.hours}h · {j.employeeNames.length}{" "}
              crew
            </span>
            {!jobCompact && j.employeeNames.length > 0 ? (
              <span className={`mt-0.5 block ${muted}`}>
                {j.employeeNames.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
        {activeJobsToday.length > slice ? (
          <li className={`text-[11px] ${muted}`}>
            +{activeJobsToday.length - slice} more —{" "}
            <Link href="/team-clock" className={`${gold} hover:underline`}>
              team clock
            </Link>
          </li>
        ) : null}
      </ul>
    ) : null;

  const hasLicenseAlerts =
    (licExpiring30 ?? 0) > 0 ||
    (licCe45 ?? 0) > 0 ||
    (licPursuit ?? 0) > 0;

  const fleetAlertsBlock =
    showQuickLinks &&
    fleetAttentionCount != null &&
    fleetAttentionCount > 0 ? (
      <p className={`text-[11px] ${fg}`}>
        <Link
          href="/inventory/vehicles"
          className={`inline-flex flex-wrap items-center gap-x-1 font-medium hover:underline ${gold}`}
        >
          <span aria-hidden>🚛</span>
          <span className="tabular-nums">{fleetAttentionCount}</span>
          <span>
            vehicle{fleetAttentionCount === 1 ? "" : "s"} need attention
          </span>
        </Link>
      </p>
    ) : null;

  const licenseAlertsBlock =
    showQuickLinks && hasLicenseAlerts ? (
      <div
        className={`flex flex-col gap-1 text-[11px] ${marketingHomeSplit ? "pt-1" : ""} ${isMarketing ? "" : ""}`}
      >
        {licExpiring30 != null && licExpiring30 > 0 ? (
          <p className={fg}>
            <span aria-hidden>⚠️</span>{" "}
            <span className="font-semibold text-amber-200 tabular-nums">
              {licExpiring30}
            </span>{" "}
            license{licExpiring30 === 1 ? "" : "s"} expiring within 30 days ·{" "}
            <Link href="/licenses" className={`${gold} font-medium hover:underline`}>
              Licenses
            </Link>
          </p>
        ) : null}
        {licCe45 != null && licCe45 > 0 ? (
          <p className={fg}>
            <span aria-hidden>📚</span>{" "}
            <span className="font-semibold text-sky-200/90 tabular-nums">
              {licCe45}
            </span>{" "}
            CE hour deadline{licCe45 === 1 ? "" : "s"} within 45 days ·{" "}
            <Link href="/licenses" className={`${gold} font-medium hover:underline`}>
              Licenses
            </Link>
          </p>
        ) : null}
        {licPursuit != null && licPursuit > 0 ? (
          <p className={fg}>
            <span aria-hidden>🎯</span>{" "}
            <span className="font-semibold text-sky-200 tabular-nums">
              {licPursuit}
            </span>{" "}
            license{licPursuit === 1 ? "" : "s"} in pursuit — check progress ·{" "}
            <Link href="/licenses" className={`${gold} font-medium hover:underline`}>
              Open
            </Link>
          </p>
        ) : null}
      </div>
    ) : null;

  const hasInternalReqAlerts =
    !roleLoading &&
    canViewAdminRequestQueue(role) &&
    ((irNew ?? 0) > 0 || (irUrgent ?? 0) > 0 || (irOverdue ?? 0) > 0);

  const internalRequestsBlock =
    showQuickLinks && hasInternalReqAlerts ? (
      <div className={`flex flex-col gap-1 text-[11px] ${marketingHomeSplit ? "pt-1" : ""}`}>
        {irNew != null && irNew > 0 ? (
          <p className={fg}>
            <span aria-hidden>📋</span>{" "}
            <span className="font-semibold tabular-nums text-violet-200">
              {irNew}
            </span>{" "}
            new internal request{irNew === 1 ? "" : "s"} ·{" "}
            <Link href="/requests" className={`${gold} font-medium hover:underline`}>
              Open queue
            </Link>
          </p>
        ) : null}
        {irUrgent != null && irUrgent > 0 ? (
          <p className={fg}>
            <span aria-hidden>🔥</span>{" "}
            <span className="font-semibold text-orange-200 tabular-nums">
              {irUrgent}
            </span>{" "}
            urgent / emergency open ·{" "}
            <Link href="/requests" className={`${gold} font-medium hover:underline`}>
              Triage
            </Link>
          </p>
        ) : null}
        {irOverdue != null && irOverdue > 0 ? (
          <p className={fg}>
            <span aria-hidden>⏱️</span>{" "}
            <span className="font-semibold text-amber-200 tabular-nums">
              {irOverdue}
            </span>{" "}
            open over 3 days ·{" "}
            <Link href="/requests" className={`${gold} font-medium hover:underline`}>
              Review
            </Link>
          </p>
        ) : null}
      </div>
    ) : null;

  const receiptsTimeOffBlock = (
    showQuickLinks &&
    (unassignedReceipts != null ||
      pendingTimeOff != null ||
      fleetAlertsBlock ||
      licenseAlertsBlock ||
      internalRequestsBlock) ? (
      <div
        className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${marketingHomeSplit ? "pt-1" : "mt-3 border-t pt-3"} ${isMarketing ? "border-white/10" : "border-[var(--border)]"}`}
      >
        {fleetAlertsBlock ? (
          <div className="w-full min-w-0 space-y-1 border-b border-white/10 pb-2">
            {fleetAlertsBlock}
          </div>
        ) : null}
        {licenseAlertsBlock ? (
          <div className="w-full min-w-0 space-y-1">{licenseAlertsBlock}</div>
        ) : null}
        {internalRequestsBlock ? (
          <div className="w-full min-w-0 space-y-1 border-t border-white/10 pt-2">
            {internalRequestsBlock}
          </div>
        ) : null}
        {unassignedReceipts != null ? (
          <p className={fg}>
            <span className={muted}>Unassigned: </span>
            <span className={`font-semibold tabular-nums ${gold}`}>
              {unassignedReceipts}
            </span>
            {" · "}
            <Link href="/receipts" className={`${gold} font-medium hover:underline`}>
              Review
            </Link>
          </p>
        ) : null}
        {pendingTimeOff != null ? (
          <p className={fg}>
            <span className={muted}>Time off: </span>
            <span className={`font-semibold tabular-nums ${gold}`}>
              {pendingTimeOff}
            </span>
            {" · "}
            <Link href="/time-off" className={`${gold} font-medium hover:underline`}>
              Open
            </Link>
          </p>
        ) : null}
      </div>
    ) : null
  );

  const stragglersBlock = (max: number, pad: string) =>
    stragglers.length > 0 ? (
      <div
        className={`rounded-lg border border-amber-500/30 bg-amber-950/25 ${pad}`}
      >
        <p className="text-[11px] font-semibold text-amber-100">
          Open punch (prior day)
        </p>
        <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-100/85">
          {stragglers.slice(0, max).map((s, i) => (
            <li key={`${s.employeeName}-${i}`}>
              {s.employeeName} · {s.jobName} ({s.sinceYmd})
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const quickLinkButtons = showQuickLinks ? (
    <div
      className={`flex flex-wrap gap-2 ${marketingHomeSplit ? "border-t-0 pt-1" : "mt-4 border-t border-white/10 pt-4"}`}
    >
      <Link
        href="/team-clock"
        className={`inline-flex rounded-lg bg-[#E8C84A] font-semibold text-[#0a1628] hover:bg-[#f0d56e] ${marketingHomeSplit ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      >
        Team clock
      </Link>
      <Link
        href="/timesheets"
        className={`inline-flex rounded-lg border border-white/25 font-medium text-white hover:bg-white/10 ${marketingHomeSplit ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      >
        Timesheets
      </Link>
    </div>
  ) : (
    <Link
      href="/team-clock"
      className={`mt-4 inline-block text-sm font-medium ${gold} hover:underline`}
    >
      Open team clock →
    </Link>
  );

  const collapsedSummaryAlertCount =
    otAlertCount +
    stragglerCount +
    (fleetAttentionCount ?? 0) +
    (licExpiring30 ?? 0) +
    (irUrgent ?? 0);

  const collapsedSummaryBar = (
    <button
      type="button"
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[#E8C84A]/30 py-3 px-4 text-left ${isMarketing ? "bg-white/[0.05]" : "bg-transparent"}`}
      onClick={() => setExpanded((e) => !e)}
    >
      <span
        className={
          marketingHomeSplit
            ? "shrink-0 text-base font-semibold text-white lg:text-lg"
            : `shrink-0 ${titleClass}`
        }
      >
        Command Center
      </span>
      <span
        className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[#E8C84A]/35 px-3 py-1 text-[11px] leading-tight ${isMarketing ? "text-white/90" : fg}`}
      >
        <span className={`font-semibold tabular-nums ${gold}`}>
          {collapsedSummaryAlertCount} alerts
        </span>
        <span className={isMarketing ? "text-white/60" : muted}>·</span>
        <span className={`tabular-nums ${isMarketing ? "" : fg}`}>
          {onClock} clocked in
        </span>
        {canViewAdminRequestQueue(role) ? (
          <>
            <span className={isMarketing ? "text-white/60" : muted}>·</span>
            <span className="tabular-nums">{irNew ?? 0} requests</span>
          </>
        ) : null}
      </span>
      <span className="ml-auto inline-flex shrink-0 items-center justify-center text-[#E8C84A]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>
  );

  const inner = marketingHomeSplit ? (
    <>
      {!expanded ? (
        collapsedSummaryBar
      ) : (
        <>
          {headerBlock}
          {marketingHomeSplit && surface === "marketing" && showQuickLinks ? (
            <div className="w-full space-y-2">
              {role === "super_admin" || role === "admin" ? (
                <div className="w-full rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-400">
                    Critical Alerts
                  </p>
                  <p className="mt-1 text-[11px] text-white/50">
                    No critical alerts — system nominal
                  </p>
                </div>
              ) : null}
              {role === "super_admin" ? (
                <div className="w-full rounded-lg border border-[#E8C84A]/20 bg-white/[0.03] px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">
                    Email Intelligence
                  </p>
                  <p className="mt-1 text-[11px] text-white/50">
                    Coming soon — inbound email scanning via Postmark
                  </p>
                </div>
              ) : null}
              {canViewAdminRequestQueue(role) ? (
                <div className="w-full rounded-lg border border-sky-500/25 bg-sky-950/15 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-400">
                    Meetings
                  </p>
                  <p className="mt-1 text-[11px] text-white/50">
                    Coming soon — meeting scheduler and transcriber
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {loading ? (
            <p className={`mt-2 text-sm ${muted}`}>Loading…</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
              <div className="min-w-0 space-y-2">
                <h3 className={sectionHeaderClass}>Who&apos;s clocked in today</h3>
                {onClockBlock}
                {workingNames.length > 0 ? (
                  <p className={`text-[11px] leading-snug ${muted}`}>
                    <span className="font-medium text-white/85">Crew:</span>{" "}
                    {workingNames.length > 8
                      ? `${workingNames.slice(0, 8).join(", ")} +${workingNames.length - 8}`
                      : workingNames.join(", ")}
                  </p>
                ) : (
                  <p className={`text-[11px] ${muted}`}>No one punched in.</p>
                )}
                {quickLinkButtons}
              </div>
              <div className="min-w-0 space-y-2 border-t border-[#E8C84A]/15 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <h3 className={sectionHeaderClass}>Active jobs + alerts</h3>
                {activeJobsHeading}
                {jobsList(6, true)}
                {otAlertNames.length > 0 ? (
                  <p className="text-[11px] font-medium text-orange-300">
                    OT:{" "}
                    {otAlertNames.length > 4
                      ? `${otAlertNames.slice(0, 4).join(", ")} +${otAlertNames.length - 4}`
                      : otAlertNames.join(", ")}
                  </p>
                ) : null}
                {receiptsTimeOffBlock}
                {stragglersBlock(3, "p-2")}
              </div>
            </div>
          )}
        </>
      )}
    </>
  ) : (
    <>
      {!expanded ? (
        collapsedSummaryBar
      ) : (
        <>
          {headerBlock}
          {loading ? (
            <p className={`mt-3 text-sm ${muted}`}>Loading…</p>
          ) : (
            <>
              {onClockBlock}
              {activeJobsHeading}
              {workingNames.length > 0 ? (
                <p className={`mt-2 text-xs leading-relaxed ${muted}`}>
                  <span
                    className={
                      isMarketing
                        ? "font-medium text-white/80"
                        : "font-medium text-[var(--foreground)]"
                    }
                  >
                    On clock:
                  </span>{" "}
                  {compact && workingNames.length > 4
                    ? `${workingNames.slice(0, 4).join(", ")} +${workingNames.length - 4} more`
                    : workingNames.join(", ")}
                </p>
              ) : (
                <p className={`mt-2 text-xs ${muted}`}>
                  No one is punched in right now.
                </p>
              )}
              {jobsList(compact ? 4 : activeJobsToday.length, compact)}
              {otAlertNames.length > 0 ? (
                <p className="mt-2 text-xs font-medium text-orange-300">
                  Overtime:{" "}
                  {compact && otAlertNames.length > 3
                    ? `${otAlertNames.slice(0, 3).join(", ")} +${otAlertNames.length - 3}`
                    : otAlertNames.join(", ")}
                </p>
              ) : null}
              {receiptsTimeOffBlock}
              {stragglersBlock(compact ? 3 : stragglers.length, "mt-3 p-3")}
              {quickLinkButtons}
            </>
          )}
        </>
      )}
    </>
  );

  const shellClass =
    !compact && !showQuickLinks
      ? `transition-colors hover:border-[#E8C84A]/45 ${cardClass}`
      : cardClass;

  return <div className={shellClass}>{inner}</div>;
}
