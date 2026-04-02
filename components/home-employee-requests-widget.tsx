"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import { statusBadgeClass, statusLabel } from "@/lib/internal-request-utils";
import type { InternalRequestRow } from "@/lib/internal-request-types";
import { createBrowserClient } from "@/lib/supabase/client";

type Surface = "marketing" | "app";

export function HomeEmployeeRequestsWidget({ surface }: { surface: Surface }) {
  const { profile, loading } = useUserRole();
  const [rows, setRows] = useState<InternalRequestRow[]>([]);

  useEffect(() => {
    if (loading || !profile?.id) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("internal_requests")
          .select("*")
          .eq("submitted_by", profile.id)
          .order("created_at", { ascending: false })
          .limit(surface === "marketing" ? 5 : 3);
        if (cancelled || error) {
          if (!cancelled) setRows([]);
          return;
        }
        setRows(
          (data ?? []).map((r) =>
            mapInternalRequestRow(r as Record<string, unknown>),
          ),
        );
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, loading, surface]);

  const isMarketing = surface === "marketing";
  const cardClass = isMarketing
    ? "w-full rounded-xl border border-[#E8C84A]/25 bg-white/[0.05] p-4 text-left shadow-lg shadow-black/20"
    : "app-card app-card-pad-lg";

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className={
            isMarketing
              ? "text-sm font-semibold text-white"
              : "text-base font-semibold text-[var(--foreground)]"
          }
        >
          My recent requests
        </h3>
        <Link
          href="/my-requests"
          className={
            isMarketing
              ? "text-xs font-semibold text-[#E8C84A] hover:underline"
              : "text-xs font-semibold text-violet-300 hover:underline"
          }
        >
          View all
        </Link>
      </div>
      <Link
        href="/requests/new"
        className={`mt-3 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${
          isMarketing
            ? "bg-[#E8C84A] text-[#0a1628] hover:bg-[#f0d56e]"
            : "bg-violet-500 text-white hover:bg-violet-400"
        }`}
      >
        + New request
      </Link>
      {loading ? (
        <p
          className={`mt-3 text-xs ${isMarketing ? "text-white/50" : "text-[var(--foreground-muted)]"}`}
        >
          Loading recent requests…
        </p>
      ) : !profile?.id ? (
        <p
          className={`mt-3 text-xs ${isMarketing ? "text-white/50" : "text-[var(--foreground-muted)]"}`}
        >
          Requests will show here when your profile is available.
        </p>
      ) : rows.length === 0 ? (
        <p
          className={`mt-3 text-xs ${isMarketing ? "text-white/50" : "text-[var(--foreground-muted)]"}`}
        >
          No requests yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className={
                  isMarketing
                    ? "block rounded-lg border border-white/10 border-l-2 border-l-[#E8C84A]/40 bg-white/[0.04] px-4 py-3 text-left transition hover:border-[#E8C84A]/35"
                    : `block rounded-lg border px-3 py-2 text-left transition border-[var(--border)] hover:border-violet-400/35`
                }
              >
                {isMarketing ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 font-mono text-[10px] text-[#E8C84A]">
                        {r.request_number}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-base font-medium text-white">
                        {r.title}
                      </p>
                      <span
                        className="shrink-0 text-sm text-white/40"
                        aria-hidden
                      >
                        →
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-[10px] text-violet-300">
                      {r.request_number}
                    </p>
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {r.title}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
