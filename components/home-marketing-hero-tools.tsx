"use client";

import type { ReactNode } from "react";
import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { TeamStatusWidget } from "@/components/team-status-widget";
import { TimeClockSummaryCard } from "@/components/time-clock-summary-card";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewTeamClock } from "@/lib/user-roles";

type Props = {
  children: ReactNode;
};

/**
 * Homepage: admin / super_admin get full-width Command Center above the tool grid;
 * others get time card + team widget, then the tool grid.
 */
export function HomeMarketingHeroToolsSection({ children }: Props) {
  const { role, loading } = useUserRole();

  if (loading) {
    return (
      <div className="mt-8 w-full max-w-6xl self-stretch">
        <div className="h-32 animate-pulse rounded-xl border-2 border-[#E8C84A]/25 bg-white/[0.06] lg:h-36" />
      </div>
    );
  }

  const showCommandCenter = role === "admin" || role === "super_admin";

  if (showCommandCenter) {
    return (
      <div className="mt-8 flex w-full max-w-6xl flex-col self-stretch">
        <div className="w-full min-w-0">
          <TeamCommandCenterCard
            enabled
            surface="marketing"
            showQuickLinks
          />
        </div>
        <div className="mx-auto mt-14 grid w-full grid-cols-1 gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto mt-8 w-full max-w-md self-stretch">
        <TimeClockSummaryCard surface="marketing" />
      </div>
      {canViewTeamClock(role) ? (
        <div className="mx-auto mt-4 w-full max-w-md self-stretch">
          <TeamStatusWidget surface="marketing" />
        </div>
      ) : null}
      <div className="mx-auto mt-14 grid w-full max-w-6xl grid-cols-1 gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 self-stretch">
        {children}
      </div>
    </>
  );
}
