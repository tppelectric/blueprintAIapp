"use client";

import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { useUserRole } from "@/hooks/use-user-role";

/**
 * Marketing homepage: Command Center for admin / super_admin (skeleton while role loads).
 */
export function HomeMarketingCommandCenter() {
  const { role, loading } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";

  if (!loading && !isAdmin) return null;

  return (
    <section
      className="mt-8 w-full max-w-6xl self-stretch text-left"
      aria-label="Command center"
    >
      {loading ? (
        <div className="h-32 w-full animate-pulse rounded-xl border border-[#E8C84A]/30 bg-white/[0.06] lg:h-36" />
      ) : (
        <TeamCommandCenterCard
          enabled
          surface="marketing"
          showQuickLinks
        />
      )}
    </section>
  );
}
