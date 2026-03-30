"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import type { JobListRow } from "@/lib/jobs-types";
import type { UserProfileRow } from "@/lib/user-profile-types";

export type DashboardMyWorkCardProps = {
  className?: string;
  selectedUserId?: string | null;
  onSelectedUserIdChange?: (id: string | null) => void;
  isAdmin?: boolean;
};

export function DashboardMyWorkCard({
  className,
  selectedUserId: selectedUserIdProp,
  onSelectedUserIdChange,
  isAdmin: isAdminProp,
}: DashboardMyWorkCardProps = {}) {
  const { role, loading: roleLoading } = useUserRole();
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
  const [open, setOpen] = useState(true);

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
        .select("id,job_name,job_number,status,updated_at")
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
                {u.full_name?.trim()
                  ? u.full_name
                  : [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                    u.email}
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
                  {myWorkTop.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/jobs/${j.id}`}
                        className="block text-sm text-white/90 hover:text-[#E8C84A] hover:underline"
                      >
                        <span className="font-medium">{j.job_name}</span>
                        <span className="ml-2 text-xs text-white/55">
                          · {j.status}
                        </span>
                      </Link>
                    </li>
                  ))}
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
      </div>
    </div>
  );
}
