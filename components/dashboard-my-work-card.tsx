"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { HomeEmployeeRequestsWidget } from "@/components/home-employee-requests-widget";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { isTerminalStatus } from "@/lib/internal-request-utils";
import type { InternalRequestStatus } from "@/lib/internal-request-types";
import type { JobListRow } from "@/lib/jobs-types";
import type { UserProfileRow } from "@/lib/user-profile-types";
import { userDisplayName } from "@/lib/user-display-name";

export type DashboardMyWorkCardProps = {
  className?: string;
  selectedUserId?: string | null;
  onSelectedUserIdChange?: (id: string | null) => void;
  isAdmin?: boolean;
};

type RequestPipelineCounts = {
  new: number;
  in_review: number;
  urgent: number;
  completed_today: number;
};

const IN_REVIEW_STATUSES = new Set<string>([
  "in_review",
  "approved",
  "in_progress",
  "waiting",
]);

function computeRequestPipeline(
  rows: {
    status: string;
    priority: string;
    resolved_at: string | null;
  }[],
): RequestPipelineCounts {
  const ymd = new Date().toISOString().slice(0, 10);
  let newC = 0;
  let inReviewC = 0;
  let urgentC = 0;
  let completedTodayC = 0;
  for (const r of rows) {
    const st = r.status;
    if (st === "new") newC++;
    if (IN_REVIEW_STATUSES.has(st)) inReviewC++;
    if (
      (r.priority === "urgent" || r.priority === "emergency") &&
      !isTerminalStatus(st as InternalRequestStatus)
    ) {
      urgentC++;
    }
    if (
      st === "completed" &&
      r.resolved_at &&
      String(r.resolved_at).slice(0, 10) === ymd
    ) {
      completedTodayC++;
    }
  }
  return {
    new: newC,
    in_review: inReviewC,
    urgent: urgentC,
    completed_today: completedTodayC,
  };
}

function CollapsedRequestPipelineSummary({
  pipeline,
}: {
  pipeline: RequestPipelineCounts;
}) {
  const segments: { key: string; dotClass: string; label: string; n: number }[] =
    [];
  if (pipeline.new > 0) {
    segments.push({
      key: "new",
      dotClass: "bg-white/60",
      label: "New",
      n: pipeline.new,
    });
  }
  if (pipeline.in_review > 0) {
    segments.push({
      key: "in_review",
      dotClass: "bg-blue-400",
      label: "In Review",
      n: pipeline.in_review,
    });
  }
  if (pipeline.urgent > 0) {
    segments.push({
      key: "urgent",
      dotClass: "bg-red-500",
      label: "Urgent",
      n: pipeline.urgent,
    });
  }
  if (pipeline.completed_today > 0) {
    segments.push({
      key: "completed_today",
      dotClass: "bg-emerald-500",
      label: "Done",
      n: pipeline.completed_today,
    });
  }

  if (segments.length === 0) {
    return (
      <span className="text-[11px] text-white/35">No open requests</span>
    );
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-[11px] text-white/80">
      {segments.map((seg, i) => (
        <Fragment key={seg.key}>
          {i > 0 ? (
            <span className="text-white/35" aria-hidden>
              {" "}
              ·{" "}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${seg.dotClass}`}
              aria-hidden
            />
            <span>
              {seg.label} {seg.n}
            </span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

function customerLabel(j: JobListRow): string {
  const raw = j.customers;
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c) return "";
  return String(c.company_name || c.contact_name || "").trim();
}

export function DashboardMyWorkCard({
  className,
  selectedUserId: selectedUserIdProp,
  onSelectedUserIdChange,
  isAdmin: isAdminProp,
}: DashboardMyWorkCardProps = {}) {
  const { role, loading: roleLoading, profile } = useUserRole();
  const showAdminFromRole = !roleLoading && role === "super_admin";
  const showAdminUsersQuick =
    isAdminProp !== undefined ? isAdminProp : showAdminFromRole;

  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const controlled = onSelectedUserIdChange != null;
  const selectedUserId = controlled
    ? (selectedUserIdProp ?? null)
    : internalSelected;
  const setSelectedUserId = controlled
    ? onSelectedUserIdChange
    : setInternalSelected;

  const [myWorkTop, setMyWorkTop] = useState<JobListRow[]>([]);
  const [myWorkActiveCount, setMyWorkActiveCount] = useState(0);
  const [myWorkCompletedCount, setMyWorkCompletedCount] = useState(0);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [open, setOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestPipeline, setRequestPipeline] =
    useState<RequestPipelineCounts | null>(null);

  const loadMyWork = useCallback(async () => {
    const supabase = createBrowserClient();
    await supabase.auth.getSession();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const assigneeId = selectedUserId ?? user?.id ?? null;
    if (assigneeId) {
      const { data: mine, error: mineErr } = await supabase
        .from("jobs")
        .select(
          "id,job_name,job_number,status,updated_at,customer_id,customers(company_name,contact_name)",
        )
        .eq("assigned_user_id", assigneeId)
        .order("updated_at", { ascending: false });

      if (mineErr) {
        setMyWorkTop([]);
        setMyWorkActiveCount(0);
        setMyWorkCompletedCount(0);
      } else {
        const rows = mine ?? [];
        const completed = rows.filter((j) => j.status === "Complete").length;
        setMyWorkActiveCount(rows.length - completed);
        setMyWorkCompletedCount(completed);
        setMyWorkTop(rows.slice(0, 5) as unknown as JobListRow[]);
      }
    } else {
      setMyWorkTop([]);
      setMyWorkActiveCount(0);
      setMyWorkCompletedCount(0);
    }
  }, [selectedUserId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadMyWork();
    });
  }, [loadMyWork]);

  useEffect(() => {
    const supabase = createBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED"
      ) {
        void loadMyWork();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadMyWork]);

  useEffect(() => {
    if (!showAdminUsersQuick) {
      queueMicrotask(() => {
        setUsers([]);
        if (!controlled) setInternalSelected(null);
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("user_profiles")
          .select("id,email,full_name,first_name,last_name")
          .eq("is_active", true)
          .order("full_name", { ascending: true });
        if (cancelled) return;
        if (error) {
          setUsers([]);
          return;
        }
        setUsers((data ?? []) as UserProfileRow[]);
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAdminUsersQuick, controlled]);

  useEffect(() => {
    if (roleLoading || !profile?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("internal_requests")
          .select("status,priority,resolved_at")
          .eq("submitted_by", profile.id);
        if (cancelled) return;
        if (error) {
          setRequestPipeline({
            new: 0,
            in_review: 0,
            urgent: 0,
            completed_today: 0,
          });
          return;
        }
        setRequestPipeline(computeRequestPipeline(data ?? []));
      } catch {
        if (!cancelled) {
          setRequestPipeline({
            new: 0,
            in_review: 0,
            urgent: 0,
            completed_today: 0,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, roleLoading]);

  return (
    <div className={className ?? "min-w-0 space-y-3"}>
      {open && showAdminUsersQuick ? (
        <label className="block text-sm text-white/80">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">
            View employee
          </span>
          <select
            className="app-input w-full max-w-full text-sm"
            value={selectedUserId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedUserId(v === "" ? null : v);
            }}
          >
            <option value="">My Work</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userDisplayName(u)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-[#0a1628] p-4">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent px-0 py-1 text-left transition-colors hover:border-white/10 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]/50"
          aria-expanded={open}
          aria-controls="dashboard-my-work-panel"
          id="dashboard-my-work-heading"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/55">
            {open ? (
              "My Work"
            ) : (
              <>
                My Work — {myWorkActiveCount} Active • {myWorkCompletedCount}{" "}
                Completed
              </>
            )}
          </span>
          <svg
            className={`h-5 w-5 shrink-0 text-[#E8C84A] transition-transform duration-200 ease-out ${
              open ? "rotate-0" : "-rotate-180"
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
          id="dashboard-my-work-panel"
          role="region"
          aria-labelledby="dashboard-my-work-heading"
          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-2">
              <div className="mt-2 flex flex-wrap items-end gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    Active jobs
                  </p>
                  <p className="text-3xl font-bold tabular-nums text-[#E8C84A]">
                    {myWorkActiveCount}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    Completed
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-white/80">
                    {myWorkCompletedCount}
                  </p>
                </div>
              </div>

              {myWorkTop.length > 0 ? (
                <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  {myWorkTop.map((j) => {
                    const cust = customerLabel(j);
                    return (
                      <li key={j.id}>
                        <Link
                          href={`/jobs/${j.id}`}
                          className="block text-sm text-white/90 hover:text-[#E8C84A] hover:underline"
                        >
                          <span className="font-medium">{j.job_name}</span>
                          <span className="ml-2 text-xs text-white/55">
                            · {j.status}
                          </span>
                          {cust ? (
                            <span className="mt-0.5 block text-xs text-white/45">
                              {cust}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/55">
                  No assigned jobs yet.
                </p>
              )}

              <Link
                href="/jobs"
                className="mt-3 inline-block text-sm font-semibold text-[#E8C84A] hover:underline"
              >
                View My Jobs →
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setRequestsOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 px-0 py-3 text-left transition-colors hover:bg-white/[0.03] rounded-lg"
            aria-expanded={requestsOpen}
            aria-controls="dashboard-my-requests-panel"
            id="dashboard-my-requests-heading"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-white">
                My Requests
              </span>
              {!requestsOpen && requestPipeline !== null ? (
                <CollapsedRequestPipelineSummary pipeline={requestPipeline} />
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
            id="dashboard-my-requests-panel"
            role="region"
            aria-labelledby="dashboard-my-requests-heading"
            className={`grid w-full transition-[grid-template-rows] duration-200 ease-out ${
              requestsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-t border-white/10 px-0 pb-0 pt-3">
                <HomeEmployeeRequestsWidget surface="marketing" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
