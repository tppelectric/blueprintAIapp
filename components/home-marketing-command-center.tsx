"use client";

import { DashboardMyWorkCard } from "@/components/dashboard-my-work-card";
import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { useUserRole } from "@/hooks/use-user-role";

/**
 * Marketing homepage: My Work for everyone; Command Center for admin / super_admin.
 */
export function HomeMarketingCommandCenter() {
  const { role, loading } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <section
      className="mt-8 w-full max-w-6xl self-stretch text-left"
      aria-label="Command center"
    >
      {/* ALWAYS show My Work */}
      <DashboardMyWorkCard />

      {/* Admin-only section: skeleton while role loads, then card for admins */}
      {loading || isAdmin ? (
        <div className="mt-8">
          {loading ? (
            <div className="h-32 w-full animate-pulse rounded-xl border border-[#E8C84A]/30 bg-white/[0.06] lg:h-36" />
          ) : (
            <TeamCommandCenterCard
              enabled
              surface="marketing"
              showQuickLinks
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
