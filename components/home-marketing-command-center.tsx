"use client";

import { useEffect, useState } from "react";
import { TeamCommandCenterCard } from "@/components/team-command-center-card";
import { HomeEmployeeRequestsWidget } from "@/components/home-employee-requests-widget";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";

/**
 * Marketing homepage: Command Center for admin / super_admin (skeleton while role loads).
 */
export function HomeMarketingCommandCenter() {
  const { role, loading, profile } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [requestCount, setRequestCount] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    if (!loading && !isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { count: c } = await sb
          .from("internal_requests")
          .select("*", { count: "exact", head: true })
          .eq("submitted_by", profile.id)
          .neq("status", "closed");
        if (!cancelled) setRequestCount(c ?? 0);
      } catch {
        if (!cancelled) setRequestCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, loading, isAdmin]);

  if (!loading && !isAdmin) return null;

  return (
    <section className="w-full text-left" aria-label="Command center">
      {loading ? (
        <div className="h-32 w-full animate-pulse rounded-xl border border-[#E8C84A]/30 bg-white/[0.06] lg:h-36" />
      ) : (
        <>
          <TeamCommandCenterCard
            enabled
            surface="marketing"
            showQuickLinks
          />
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="flex w-full flex-col items-start self-start rounded-xl border border-white/10 bg-white/[0.04]">
              <button
                type="button"
                onClick={() => setRequestsOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                aria-expanded={requestsOpen}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    My Requests
                  </span>
                  {requestCount !== null && requestCount > 0 ? (
                    <span className="rounded-full border border-[#E8C84A]/30 bg-[#E8C84A]/10 px-2 py-0.5 text-[11px] font-semibold text-[#E8C84A]">
                      {requestCount} open
                    </span>
                  ) : null}
                  {!requestsOpen && requestCount === 0 ? (
                    <span className="text-[11px] text-white/35">
                      No open requests
                    </span>
                  ) : null}
                </div>
                <svg
                  className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${
                    requestsOpen ? "rotate-0" : "-rotate-180"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div
                className={`grid w-full transition-[grid-template-rows] duration-200 ease-out ${
                  requestsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-white/10 px-4 pb-4 pt-3">
                    <HomeEmployeeRequestsWidget surface="marketing" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
