"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { licenseNavAlertCount } from "@/lib/license-alerts";
import { mapLicenseRow } from "@/lib/license-mappers";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageLicenses } from "@/lib/user-roles";

/** Small count badge for Licenses nav (admin only). */
export function LicensesNavBadge() {
  const { role, loading: roleLoading } = useUserRole();
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (roleLoading || !canManageLicenses(role)) {
      setN(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb.from("licenses").select("*");
        if (cancelled || error) {
          if (!cancelled) setN(null);
          return;
        }
        const rows = (data ?? []).map((r) =>
          mapLicenseRow(r as Record<string, unknown>),
        );
        setN(licenseNavAlertCount(rows));
      } catch {
        if (!cancelled) setN(null);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [role, roleLoading]);

  if (roleLoading || !canManageLicenses(role) || n == null || n <= 0) {
    return null;
  }

  return (
    <span
      className="ml-1 inline-flex min-w-[1.125rem] justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-tight text-[#0a1628]"
      aria-label={`${n} license alerts`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
