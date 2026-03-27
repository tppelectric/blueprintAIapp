"use client";

import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { useUserRole } from "@/hooks/use-user-role";

/**
 * Marketing homepage: full-width Command Center for admin / super_admin only,
 * in its own section above the tool cards grid.
 */
export function HomeMarketingCommandCenter() {
  const { role, loading } = useUserRole();

  if (loading) {
    return (
      <section
        className="mt-8 w-full max-w-6xl self-stretch text-left"
        aria-label="Command center"
      >
        <div className="h-32 w-full animate-pulse rounded-xl border border-[#E8C84A]/30 bg-white/[0.06] lg:h-36" />
      </section>
    );
  }

  if (role !== "admin" && role !== "super_admin") {
    return null;
  }

  return (
    <section
      className="mt-8 w-full max-w-6xl self-stretch text-left"
      aria-label="Command center"
    >
      <TeamCommandCenterCard
        enabled
        surface="marketing"
        showQuickLinks
      />
    </section>
  );
}
