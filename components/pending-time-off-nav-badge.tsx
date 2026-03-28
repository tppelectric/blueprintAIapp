"use client";

import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { fetchPendingTimeOffRequestCount } from "@/lib/pending-time-off-count";
import { createBrowserClient } from "@/lib/supabase/client";

/** Pending time-off count for managers (main nav). */
export function PendingTimeOffNavBadge() {
  const { canManageTeamTime } = useUserRole();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canManageTeamTime) return;
    let cancelled = false;
    const sb = createBrowserClient();
    const run = async () => {
      const c = await fetchPendingTimeOffRequestCount(sb);
      if (!cancelled) setCount(c);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [canManageTeamTime]);

  if (!canManageTeamTime || count === 0) return null;

  return (
    <span
      className="ml-0.5 inline-flex min-w-[1.15rem] justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-tight text-[#0a1628]"
      aria-label={`${count} pending time off requests`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
