"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import { adminNavAttentionCount } from "@/lib/internal-request-utils";
import { useUserRole } from "@/hooks/use-user-role";
import { canViewAdminRequestQueue } from "@/lib/user-roles";

export function InternalRequestsNavBadge() {
  const { role, loading: roleLoading } = useUserRole();
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (roleLoading || !canViewAdminRequestQueue(role)) {
      setN(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("internal_requests")
          .select("*");
        if (cancelled || error) {
          if (!cancelled) setN(null);
          return;
        }
        const rows = (data ?? []).map((r) =>
          mapInternalRequestRow(r as Record<string, unknown>),
        );
        setN(adminNavAttentionCount(rows));
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

  if (roleLoading || !canViewAdminRequestQueue(role) || n == null || n <= 0) {
    return null;
  }

  return (
    <span
      className="ml-1 inline-flex min-w-[1.125rem] justify-center rounded-full bg-[#E8C84A] px-1 text-[10px] font-bold leading-tight text-[#0a1628]"
      aria-label={`${n} requests need attention`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
