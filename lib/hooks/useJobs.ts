"use client";

import useSWR from "swr";
import { createBrowserClient } from "@/lib/supabase/client";
import type { JobListRow } from "@/lib/jobs-types";

export const DASHBOARD_RECENT_JOBS_KEY = "dashboard-recent-jobs" as const;

const SWR_OPTS = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
} as const;

async function fetchDashboardRecentJobs(): Promise<JobListRow[]> {
  const sb = createBrowserClient();
  const { data, error } = await sb
    .from("jobs")
    .select(
      "id,job_name,job_number,status,job_type,updated_at,customers(company_name,contact_name)",
    )
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as JobListRow[];
}

/**
 * SWR-backed recent jobs for the dashboard (same Supabase query as before).
 * Pass `userId` from `useDashboardSwrAuthUserId()` so only one auth listener runs.
 */
export function useJobs(userId: string | null) {
  const swr = useSWR(
    userId ? ([DASHBOARD_RECENT_JOBS_KEY, userId] as const) : null,
    fetchDashboardRecentJobs,
    SWR_OPTS,
  );
  return {
    data: swr.data,
    error: swr.error as Error | undefined,
    isLoading: swr.isLoading,
  };
}
