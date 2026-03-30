"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Single auth subscription for dashboard SWR keys (session user id).
 */
export function useDashboardSwrAuthUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    const sb = createBrowserClient();
    void sb.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => {
      void sb.auth.getUser().then(({ data: { user } }) => {
        setUserId(user?.id ?? null);
      });
    });
    return () => subscription.unsubscribe();
  }, []);
  return userId;
}
