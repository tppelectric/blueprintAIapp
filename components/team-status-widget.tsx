"use client";

import Link from "next/link";
import { useUserRole } from "@/hooks/use-user-role";
import { useTeamClockSummary } from "@/hooks/use-team-clock-summary";
import { canViewTeamClock } from "@/lib/user-roles";

export function TeamStatusWidget({
  surface = "app",
}: {
  surface?: "app" | "marketing";
}) {
  const { role, loading: roleLoading } = useUserRole();
  const allowed = !roleLoading && canViewTeamClock(role);
  const {
    loading,
    onClock,
    totalTeam,
    workingNames,
    otAlertNames,
    otAlertCount,
  } = useTeamClockSummary(allowed);

  if (!allowed) return null;

  const isMarketing = surface === "marketing";
  const cardClass = isMarketing
    ? "rounded-xl border border-white/12 bg-white/[0.04] p-5 text-left shadow-lg shadow-black/25 ring-1 ring-white/[0.06]"
    : "app-card app-card-pad-lg";

  return (
    <Link
      href="/team-clock"
      className={`block transition-colors hover:border-[#E8C84A]/50 ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          className={
            isMarketing
              ? "text-base font-semibold text-white"
              : "text-base font-semibold text-[var(--foreground)]"
          }
        >
          👥 Team Status
        </h2>
        {otAlertCount > 0 ? (
          <span className="shrink-0 rounded-full bg-orange-500/90 px-2 py-0.5 text-[11px] font-bold text-[#0a1628]">
            OT {otAlertCount}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p
          className={
            isMarketing
              ? "mt-3 text-sm text-white/50"
              : "mt-3 text-sm text-[var(--foreground-muted)]"
          }
        >
          Loading…
        </p>
      ) : (
        <>
          <p
            className={
              isMarketing
                ? "mt-3 text-sm text-white/85"
                : "mt-3 text-sm text-[var(--foreground)]"
            }
          >
            <span className="font-semibold tabular-nums text-[#E8C84A]">
              {onClock}
            </span>{" "}
            of{" "}
            <span className="tabular-nums">{totalTeam}</span> on the clock
          </p>
          {workingNames.length > 0 ? (
            <p
              className={
                isMarketing
                  ? "mt-2 text-xs leading-relaxed text-white/70"
                  : "mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]"
              }
            >
              Working: {workingNames.join(", ")}
            </p>
          ) : (
            <p
              className={
                isMarketing
                  ? "mt-2 text-xs text-white/50"
                  : "mt-2 text-xs text-[var(--foreground-muted)]"
              }
            >
              No one is punched in right now.
            </p>
          )}
          {otAlertNames.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-orange-300">
              Overtime: {otAlertNames.join(", ")}
            </p>
          ) : null}
          <span
            className={
              isMarketing
                ? "mt-4 inline-block text-sm font-medium text-[#E8C84A]"
                : "mt-4 inline-block text-sm font-medium text-[#E8C84A]"
            }
          >
            Open team clock →
          </span>
        </>
      )}
    </Link>
  );
}
