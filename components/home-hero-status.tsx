"use client";

import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { TeamStatusWidget } from "@/components/team-status-widget";
import { TimeClockSummaryCard } from "@/components/time-clock-summary-card";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewTeamClock } from "@/lib/user-roles";

/**
 * Homepage hero: super admins get a combined Command Center; others keep
 * personal time card + team widget (when allowed).
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

  if (role === "super_admin") {
    return (
      <div className="mx-auto mt-8 w-full max-w-xl">
        <TeamCommandCenterCard
          enabled
          surface="marketing"
          showQuickLinks
        />
      </div>
    );
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
