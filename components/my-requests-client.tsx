"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import type { InternalRequestRow } from "@/lib/internal-request-types";
import { REQUEST_TYPE_OPTIONS } from "@/lib/internal-request-types";
import {
  daysOpen,
  priorityBadgeClass,
  statusBadgeClass,
  statusLabel,
} from "@/lib/internal-request-utils";
import { createBrowserClient } from "@/lib/supabase/client";
import { canViewAdminRequestQueue } from "@/lib/user-roles";

export function MyRequestsClient() {
  const { showToast } = useAppToast();
  const { profile, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<InternalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("internal_requests")
        .select("*")
        .eq("submitted_by", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(
        (data ?? []).map((r) =>
          mapInternalRequestRow(r as Record<string, unknown>),
        ),
      );
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load.",
        variant: "error",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const showAdminLink = canViewAdminRequestQueue(profile?.role ?? null);

  const typeLabel = (t: string) =>
    REQUEST_TYPE_OPTIONS.find((x) => x.value === t)?.label ?? t;

  const cancelRequest = async (r: InternalRequestRow) => {
    if (r.status !== "new") return;
    if (!window.confirm("Cancel this request?")) return;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("internal_requests")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (error) throw error;
      showToast({ message: "Cancelled.", variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not cancel.",
        variant: "error",
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-3xl flex-1 py-6 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">My requests</h1>
            <p className="mt-1 text-sm text-white/55">
              Track everything you&apos;ve submitted.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showAdminLink ? (
              <Link
                href="/requests"
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
              >
                All requests
              </Link>
            ) : null}
            <Link
              href="/requests/new"
              className="rounded-xl bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] hover:bg-[#f0d56e]"
            >
              + New request
            </Link>
          </div>
        </div>

        {roleLoading || loading ? (
          <p className="mt-10 text-sm text-white/50">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-white/60">No requests yet.</p>
            <Link
              href="/requests/new"
              className="mt-4 inline-block text-sm font-semibold text-[#E8C84A] hover:underline"
            >
              Submit your first request →
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-[#E8C84A]">
                      {r.request_number}
                    </p>
                    <h2 className="mt-1 font-semibold text-white">{r.title}</h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      {typeLabel(r.request_type)} · {daysOpen(r)}d open
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/requests/${r.id}`}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-white/10"
                    >
                      View / comment
                    </Link>
                    {r.status === "new" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-red-400/35 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/15"
                        onClick={() => void cancelRequest(r)}
                      >
                        Cancel
                      </button>
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
