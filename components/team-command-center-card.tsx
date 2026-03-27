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
  const cardClass = isMarketing
    ? "rounded-xl border border-white/12 bg-white/[0.06] p-5 text-left shadow-lg shadow-black/25 ring-1 ring-white/[0.08]"
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

  const inner = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className={titleClass}>
            {showQuickLinks ? "Command Center" : "Team overview"}
          </h2>
          {showQuickLinks ? (
            <p className={`mt-1 text-xs ${muted}`}>
              Live punch updates plus a full refresh every 30 seconds
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {otAlertCount > 0 ? (
            <span className="shrink-0 rounded-full bg-orange-500/90 px-2 py-0.5 text-[11px] font-bold text-[#0a1628]">
              OT {otAlertCount}
            </span>
          ) : null}
          {stragglerCount > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
              Open {stragglerCount}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className={`mt-3 text-sm ${muted}`}>Loading…</p>
      ) : (
        <>
          <p className={`mt-3 text-sm ${fg}`}>
            <span className={`font-semibold tabular-nums ${gold}`}>
              {onClock}
            </span>{" "}
            of <span className="tabular-nums">{totalTeam}</span> on the clock
            {totalTeam > 0 ? (
              <span className={`ml-1 text-xs ${muted}`}>
                (
                {Math.round(
                  (onClock / Math.max(1, totalTeam)) * 100,
                )}
                %)
              </span>
            ) : null}
          </p>

          <p className={`mt-2 text-sm ${fg}`}>
            <span aria-hidden>🏗️</span>{" "}
            <span
              className={`font-semibold tabular-nums ${isMarketing ? "text-sky-300" : gold}`}
            >
              {activeJobsToday.length}
            </span>{" "}
            active job{activeJobsToday.length === 1 ? "" : "s"} today
          </p>

          {workingNames.length > 0 ? (
            <p className={`mt-2 text-xs leading-relaxed ${muted}`}>
              <span
                className={
                  isMarketing ? "font-medium text-white/80" : "font-medium text-[var(--foreground)]"
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

          {activeJobsToday.length > 0 ? (
            <ul
              className={`mt-3 space-y-2 border-t pt-3 ${isMarketing ? "border-white/10" : "border-[var(--border)]"}`}
            >
              {(compact ? activeJobsToday.slice(0, 4) : activeJobsToday).map(
                (j) => (
                  <li
                    key={j.key}
                    className={`text-xs ${compact ? "leading-snug" : ""}`}
                  >
                    <span className={`font-medium ${fg}`}>{j.jobName}</span>
                    <span className={muted}>
                      {" "}
                      · {j.onSiteCount} on site · {j.hours}h ·{" "}
                      {j.employeeNames.length} crew
                    </span>
                    {!compact && j.employeeNames.length > 0 ? (
                      <span className={`mt-0.5 block ${muted}`}>
                        {j.employeeNames.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ),
              )}
              {compact && activeJobsToday.length > 4 ? (
                <li className={`text-xs ${muted}`}>
                  +{activeJobsToday.length - 4} more job
                  {activeJobsToday.length - 4 === 1 ? "" : "s"} on{" "}
                  <Link href="/team-clock" className={`${gold} hover:underline`}>
                    team clock
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}

          {otAlertNames.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-orange-300">
              Overtime:{" "}
              {compact && otAlertNames.length > 3
                ? `${otAlertNames.slice(0, 3).join(", ")} +${otAlertNames.length - 3}`
                : otAlertNames.join(", ")}
            </p>
          ) : null}

          {showQuickLinks &&
          (unassignedReceipts != null || pendingTimeOff != null) ? (
            <div
              className={`mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs ${isMarketing ? "border-white/10" : "border-[var(--border)]"}`}
            >
              {unassignedReceipts != null ? (
                <p className={fg}>
                  <span className={muted}>Unassigned receipts: </span>
                  <span className={`font-semibold tabular-nums ${gold}`}>
                    {unassignedReceipts}
                  </span>
                  {" · "}
                  <Link
                    href="/receipts"
                    className={`${gold} font-medium hover:underline`}
                  >
                    Review
                  </Link>
                </p>
              ) : null}
              {pendingTimeOff != null ? (
                <p className={fg}>
                  <span className={muted}>Pending time off: </span>
                  <span className={`font-semibold tabular-nums ${gold}`}>
                    {pendingTimeOff}
                  </span>
                  {" · "}
                  <Link
                    href="/time-off"
                    className={`${gold} font-medium hover:underline`}
                  >
                    Open
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          {stragglers.length > 0 ? (
            <div
              className={`mt-3 rounded-lg border border-amber-500/30 bg-amber-950/25 p-3 ${isMarketing ? "" : ""}`}
            >
              <p className="text-xs font-semibold text-amber-100">
                Open punch from prior day
              </p>
              <ul className="mt-1 space-y-1 text-[11px] text-amber-100/85">
                {(compact ? stragglers.slice(0, 3) : stragglers).map(
                  (s, i) => (
                    <li key={`${s.employeeName}-${i}`}>
                      {s.employeeName} · {s.jobName} (since {s.sinceYmd})
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}

          {showQuickLinks ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <Link
                href="/team-clock"
                className="inline-flex rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
              >
                Team clock
              </Link>
              <Link
                href="/timesheets"
                className="inline-flex rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
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
          )}
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
