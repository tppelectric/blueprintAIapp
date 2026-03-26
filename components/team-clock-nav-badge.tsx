"use client";

import { useUserRole } from "@/hooks/use-user-role";
import { useTeamClockSummary } from "@/hooks/use-team-clock-summary";
import { canViewTeamClock } from "@/lib/user-roles";

export function TeamClockNavBadge() {
  const { role, loading } = useUserRole();
  const enabled = !loading && canViewTeamClock(role);
  const { otAlertCount } = useTeamClockSummary(enabled);
  if (!enabled || otAlertCount < 1) return null;
  return (
    <span
      className="inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-[#0a1628]"
      aria-label={`${otAlertCount} overtime alert${otAlertCount === 1 ? "" : "s"}`}
    >
      {otAlertCount > 9 ? "9+" : otAlertCount}
    </span>
  );
}
