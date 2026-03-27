"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTeamClockSummary } from "@/hooks/use-team-clock-summary";
import { createBrowserClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    if (!enabled || !showQuickLinks) {
      setUnassignedReceipts(null);
      setPendingTimeOff(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const sb = createBrowserClient();
        const [r1, r2] = await Promise.all([
          sb
            .from("receipts")
            .select("id", { count: "exact", head: true })
            .is("job_id", null),
          sb
            .from("time_off_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ]);
        if (cancelled) return;
        setUnassignedReceipts(
          typeof r1.count === "number" ? r1.count : 0,
        );
        setPendingTimeOff(typeof r2.count === "number" ? r2.count : 0);
      } catch {
        if (!cancelled) {
          setUnassignedReceipts(null);
          setPendingTimeOff(null);
        }
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, showQuickLinks]);

  if (!enabled) return null;

  const isMarketing = surface === "marketing";
  const marketingHomeSplit = showQuickLinks && isMarketing;
  const sectionHeaderClass =
    "text-[11px] font-bold uppercase tracking-[0.1em] text-[#E8C84A]";
  const cardClass = isMarketing
    ? marketingHomeSplit
      ? "w-full rounded-xl border-2 border-[#E8C84A]/45 bg-white/[0.05] p-4 text-left shadow-lg shadow-black/25 ring-1 ring-[#E8C84A]/20"
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

  const receiptsTimeOffBlock = (
    showQuickLinks &&
    (unassignedReceipts != null || pendingTimeOff != null) ? (
      <div
        className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${marketingHomeSplit ? "pt-1" : "mt-3 border-t pt-3"} ${isMarketing ? "border-white/10" : "border-[var(--border)]"}`}
      >
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

  const inner = marketingHomeSplit ? (
    <>
      {headerBlock}
      {loading ? (
        <p className={`mt-2 text-sm ${muted}`}>Loading…</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0 space-y-2">
            <h3 className={sectionHeaderClass}>Who&apos;s on the clock</h3>
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
            <h3 className={sectionHeaderClass}>Active jobs today</h3>
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
  );

  if (compact || showQuickLinks) {
    return <div className={cardClass}>{inner}</div>;
  }

  return (
    <Link
      href="/team-clock"
      className={`block transition-colors hover:border-[#E8C84A]/45 ${cardClass}`}
    >
      {inner}
    </Link>
  );
}
