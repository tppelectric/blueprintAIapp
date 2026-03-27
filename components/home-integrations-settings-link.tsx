"use client";

import Link from "next/link";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageIntegrations } from "@/lib/user-roles";

/** Footer / nav: integrations settings (admin / super_admin only). */
export function HomeIntegrationsSettingsLink({
  className,
}: {
  className?: string;
}) {
  const { role, loading } = useUserRole();
  if (loading || !canManageIntegrations(role)) return null;
  return (
    <Link
      href="/settings/integrations"
      className={
        className ??
        "text-white/50 transition-colors hover:text-[#E8C84A]"
      }
    >
      ⚙️ Settings
    </Link>
  );
}
