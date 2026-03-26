"use client";

import Link from "next/link";
import { TeamClockClient } from "@/components/team-clock-client";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewTeamClock } from "@/lib/user-roles";

export function TeamClockPageClient() {
  const { role, loading } = useUserRole();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-card)]">
        <p className="text-sm text-[var(--foreground-muted)]">Loading…</p>
      </div>
    );
  }

  if (!canViewTeamClock(role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--surface-card)] px-4">
        <p className="max-w-md text-center text-[var(--foreground)]">
          You don&apos;t have access to the team time clock. Super admins and
          admins only.
        </p>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[#E8C84A] hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <TeamClockClient />;
}
