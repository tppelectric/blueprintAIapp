"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import type { InternalRequestRow, InternalRequestType } from "@/lib/internal-request-types";
import { REQUEST_TYPE_OPTIONS } from "@/lib/internal-request-types";
import {
  completedTodayUtcCount,
  daysOpen,
  inProgressPipelineCount,
  isTerminalStatus,
  overdueOpenCount,
  priorityBadgeClass,
  statusBadgeClass,
  statusLabel,
  urgentOpenCount,
} from "@/lib/internal-request-utils";
import { createBrowserClient } from "@/lib/supabase/client";
import { canViewAdminRequestQueue } from "@/lib/user-roles";

function typeIcon(t: InternalRequestType): string {
  return REQUEST_TYPE_OPTIONS.find((x) => x.value === t)?.icon ?? "📋";
}

function typeLabel(t: InternalRequestType): string {
  return REQUEST_TYPE_OPTIONS.find((x) => x.value === t)?.label ?? t;
}

export function RequestsAdminListClient() {
  const { showToast } = useAppToast();
  const router = useRouter();
  const { role, loading: roleLoading } = useUserRole();
  const allowed = canViewAdminRequestQueue(role);

  const [rows, setRows] = useState<InternalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<
    { id: string; full_name: string | null; email: string | null }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("internal_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(
        (data ?? []).map((r) =>
          mapInternalRequestRow(r as Record<string, unknown>),
        ),
      );
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load requests.",
        variant: "error",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch("/api/users/for-assignment", {
        credentials: "include",
      });
      if (!r.ok) return;
      const j = (await r.json()) as {
        users?: { id: string; full_name?: string | null; email?: string | null }[];
      };
      setUsers(
        (j.users ?? []).map((u) => ({
          id: u.id,
          full_name: u.full_name ?? null,
          email: u.email ?? null,
        })),
      );
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (allowed) void loadUsers();
  }, [allowed, loadUsers]);

  useEffect(() => {
    if (!roleLoading && !allowed) router.replace("/my-requests");
  }, [roleLoading, allowed, router]);

  const userLabel = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const u = users.find((x) => x.id === id);
      return (
        u?.full_name?.trim() ||
        u?.email?.trim() ||
        id.slice(0, 8)
      );
    },
    [users],
  );

  const stats = useMemo(() => {
    const active = rows.filter((r) => !isTerminalStatus(r.status));
    return {
      new: active.filter((r) => r.status === "new").length,
      inProgress: inProgressPipelineCount(active),
      urgent: urgentOpenCount(rows),
      completedToday: completedTodayUtcCount(rows),
      overdue: overdueOpenCount(rows),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter && r.request_type !== typeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (
        urgentOnly &&
        r.priority !== "urgent" &&
        r.priority !== "emergency"
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.request_number.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, typeFilter, statusFilter, urgentOnly, search]);

  const patchStatus = async (id: string, status: InternalRequestRow["status"]) => {
    try {
      const sb = createBrowserClient();
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === "completed" || status === "declined") {
        patch.resolved_at = new Date().toISOString();
      }
      const { error } = await sb
        .from("internal_requests")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      showToast({ message: "Updated.", variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    }
  };

  if (roleLoading || !allowed) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center text-white/60">
          {roleLoading ? "Loading…" : "Redirecting…"}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-6xl flex-1 py-6 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Internal requests
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Triage employee submissions — fleet, tools, safety, and more.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/my-requests"
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              My requests
            </Link>
            <Link
              href="/requests/new"
              className="rounded-xl bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] hover:bg-[#f0d56e]"
            >
              New request
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-violet-200/90">
              New
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-white">
              {loading ? "—" : stats.new}
            </p>
          </div>
          <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-sky-100/90">
              In progress
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-white">
              {loading ? "—" : stats.inProgress}
            </p>
          </div>
          <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-orange-100/90">
              Urgent
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-white">
              {loading ? "—" : stats.urgent}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-emerald-100/90">
              Done today
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-white">
              {loading ? "—" : stats.completedToday}
            </p>
          </div>
        </div>

        {stats.overdue > 0 ? (
          <p className="mt-3 text-sm text-amber-200/90">
            {stats.overdue} open request{stats.overdue === 1 ? "" : "s"} over 3
            days old.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="min-w-[8rem] flex-1 text-xs text-white/55">
            Type
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {REQUEST_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.step1Label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[8rem] flex-1 text-xs text-white/55">
            Status
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {(
                [
                  "new",
                  "in_review",
                  "approved",
                  "in_progress",
                  "waiting",
                  "completed",
                  "declined",
                  "cancelled",
                ] as const
              ).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={urgentOnly}
              onChange={(e) => setUrgentOnly(e.target.checked)}
            />
            Urgent / emergency only
          </label>
          <label className="min-w-[12rem] flex-[2] text-xs text-white/55">
            Search
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              placeholder="Title, description, REQ number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-white/50">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-sm text-white/50">No matching requests.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 ${
                  r.priority === "emergency" ? "ring-2 ring-red-500/50" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {typeIcon(r.request_type)}
                      </span>
                      <span className="font-mono text-xs text-[#E8C84A]">
                        {r.request_number}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadgeClass(
                          r.priority,
                        )}`}
                      >
                        {r.priority}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                          r.status,
                        )}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <h2 className="mt-1 font-semibold text-white">{r.title}</h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      {typeLabel(r.request_type)} · Submitted{" "}
                      {userLabel(r.submitted_by)} ·{" "}
                      {new Date(r.created_at).toLocaleDateString()} ·{" "}
                      {daysOpen(r)}d open
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      Assigned: {userLabel(r.assigned_to)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/requests/${r.id}`}
                      className="rounded-lg border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20"
                    >
                      Open
                    </Link>
                    {!isTerminalStatus(r.status) ? (
                      <>
                        <button
                          type="button"
                          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                          onClick={() =>
                            void patchStatus(r.id, "in_progress")
                          }
                        >
                          Mark in progress
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-400/35 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15"
                          onClick={() => void patchStatus(r.id, "completed")}
                        >
                          Complete
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
