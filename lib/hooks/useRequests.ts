"use client";

import useSWR from "swr";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import type { InternalRequestRow } from "@/lib/internal-request-types";
import { createBrowserClient } from "@/lib/supabase/client";

export const DASHBOARD_INTERNAL_REQUESTS_KEY =
  "dashboard-internal-requests" as const;

const SWR_OPTS = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
} as const;

async function fetchDashboardInternalRequests(): Promise<InternalRequestRow[]> {
  const sb = createBrowserClient();
  const { data, error } = await sb.from("internal_requests").select("*");
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) =>
    mapInternalRequestRow(r as Record<string, unknown>),
  );
}

/**
 * SWR-backed internal requests for the dashboard admin card (same Supabase query as before).
 * Pass `userId` from `useDashboardSwrAuthUserId()` so only one auth listener runs.
 */
export function useRequests(userId: string | null) {
  const swr = useSWR(
    userId ? ([DASHBOARD_INTERNAL_REQUESTS_KEY, userId] as const) : null,
    fetchDashboardInternalRequests,
    SWR_OPTS,
  );

  return {
    data: swr.data,
    error: swr.error as Error | undefined,
    isLoading: swr.isLoading,
  };
}
