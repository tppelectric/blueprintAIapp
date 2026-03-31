"use client";

import type { ReactNode } from "react";
import { HomeEmployeeRequestsWidget } from "@/components/home-employee-requests-widget";
import { TeamStatusWidget } from "@/components/team-status-widget";
import { TimeClockSummaryCard } from "@/components/time-clock-summary-card";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewTeamClock } from "@/lib/user-roles";

type Props = {
  children: ReactNode;
};

/**
 * Homepage below Command Center: time card + team widget (non–admin users),
 * then the tool cards grid for everyone.
 */
export function HomeMarketingHeroToolsSection({ children }: Props) {
  const { role, loading } = useUserRole();

  const toolGrid = (
    <div className="mx-auto mt-14 grid w-full max-w-6xl grid-cols-1 gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 self-stretch">
      {children}
    </div>
  );

  if (loading) {
    return (
      <>
        <div className="mx-auto mt-4 w-full max-w-md self-stretch">
          <HomeEmployeeRequestsWidget surface="marketing" />
        </div>
        {toolGrid}
      </>
    );
  }

  const usesCommandCenter = role === "admin" || role === "super_admin";

  if (usesCommandCenter) {
    return (
      <>
        <div className="mx-auto mt-4 w-full max-w-md self-stretch">
          <HomeEmployeeRequestsWidget surface="marketing" />
        </div>
        {toolGrid}
      </>
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
      <div className="mx-auto mt-4 w-full max-w-md self-stretch">
        <HomeEmployeeRequestsWidget surface="marketing" />
      </div>
      {toolGrid}
    </>
  );
}
