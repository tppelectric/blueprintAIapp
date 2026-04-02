"use client";

import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { useUserRole } from "@/hooks/use-user-role";
import { useState } from "react";

/**
 * Marketing homepage: Command Center for admin / super_admin (skeleton while role loads).
 */
export function HomeMarketingCommandCenter() {
  const { role, loading } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";
  const [commandCenterDefaultExpanded] = useState(false);

  if (!loading && !isAdmin) return null;

  return (
    <section className="w-full text-left" aria-label="Command center">
      {loading ? (
        <div className="h-32 w-full animate-pulse rounded-xl border border-[#E8C84A]/30 bg-white/[0.06] lg:h-36" />
      ) : (
        <TeamCommandCenterCard
          enabled
          surface="marketing"
          showQuickLinks
          defaultExpanded={commandCenterDefaultExpanded}
        />
      )}
    </section>
  );
}
