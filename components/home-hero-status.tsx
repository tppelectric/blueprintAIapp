"use client";

import { TeamStatusWidget } from "@/components/team-status-widget";
import { TimeClockSummaryCard } from "@/components/time-clock-summary-card";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewTeamClock } from "@/lib/user-roles";

/**
 * Homepage hero for users without the marketing Command Center: time card +
 * team widget (when allowed). Admin / super_admin Command Center lives in
 * HomeMarketingHeroToolsSection on `app/page.tsx`.
 */
export function HomeHeroStatus() {
  const { role, loading } = useUserRole();

  if (loading) {
    return (
      <div className="mx-auto mt-8 w-full max-w-lg">
        <div className="h-36 animate-pulse rounded-xl border border-white/10 bg-white/[0.06]" />
      </div>
    );
  }

  if (role === "admin" || role === "super_admin") {
    return null;
  }

  return (
    <>
      <div className="mx-auto mt-8 w-full max-w-md">
        <TimeClockSummaryCard surface="marketing" />
      </div>
      {canViewTeamClock(role) ? (
        <div className="mx-auto mt-4 w-full max-w-md">
          <TeamStatusWidget surface="marketing" />
        </div>
      ) : null}
    </>
  );
}
