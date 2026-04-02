"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import {
  priorityBadgeClass,
  statusBadgeClass,
  statusLabel,
} from "@/lib/internal-request-utils";
import type { InternalRequestRow } from "@/lib/internal-request-types";
import { createBrowserClient } from "@/lib/supabase/client";

type Surface = "marketing" | "app";

const REQUEST_STATUS_PIPELINE: InternalRequestRow["status"][] = [
  "new",
  "in_review",
  "approved",
  "in_progress",
  "waiting",
  "completed",
];

function MarketingRequestMiniStepper({
  status,
}: {
  status: InternalRequestRow["status"];
}) {
  if (status === "declined" || status === "cancelled") {
    return (
      <div className="mt-1.5" role="status">
        <span className="inline-flex rounded-full border border-red-500/45 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">
          {statusLabel(status)}
        </span>
      </div>
    );
  }

  const activeIdx = Math.max(0, REQUEST_STATUS_PIPELINE.indexOf(status));

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center"
      role="group"
      aria-label="Request status progress"
    >
      {REQUEST_STATUS_PIPELINE.map((step, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        const isGold = done || current;
        return (
          <span key={step} className="flex items-center">
            {i > 0 ? (
              <span
                className="mx-0.5 h-px w-1 shrink-0 bg-white/20 md:w-1.5"
                aria-hidden
              />
            ) : null}
            <span className="flex items-center gap-1">
              <span
                className={`shrink-0 rounded-full ${
                  isGold ? "bg-[#E8C84A]" : "bg-white/20"
                } h-1.5 w-1.5 md:h-2 md:w-2`}
                aria-hidden
              />
              {current ? (
                <span className="hidden text-[9px] font-semibold capitalize leading-none text-[#E8C84A] md:inline">
                  {statusLabel(step)}
                </span>
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function HomeEmployeeRequestsWidget({ surface }: { surface: Surface }) {
  const { profile, loading } = useUserRole();
  const [rows, setRows] = useState<InternalRequestRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

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

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
              {isMarketing ? (
                <div className="rounded-lg border border-white/10 border-l-2 border-l-[#E8C84A]/40 bg-white/[0.04] px-3 py-2 text-left transition hover:border-[#E8C84A]/35">
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    aria-expanded={expandedIds.has(r.id)}
                    aria-controls={`home-req-expand-${r.id}`}
                    id={`home-req-trigger-${r.id}`}
                    onClick={() => toggleExpanded(r.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-mono text-[10px] text-[#E8C84A]">
                        {r.request_number}
                      </p>
                      <svg
                        className={`h-4 w-4 shrink-0 text-white/45 transition-transform duration-200 ${
                          expandedIds.has(r.id) ? "rotate-180" : "rotate-0"
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
                    </div>
                    <p className="mt-1 truncate text-left text-sm font-medium text-white">
                      {r.title}
                    </p>
                    <MarketingRequestMiniStepper status={r.status} />
                  </button>
                  <div
                    id={`home-req-expand-${r.id}`}
                    role="region"
                    aria-labelledby={`home-req-trigger-${r.id}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                      expandedIds.has(r.id) ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="border-t border-white/10 pt-2">
                        <p className="whitespace-normal break-words text-sm font-medium text-white">
                          {r.title}
                        </p>
                        {r.description ? (
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                            {r.description}
                          </p>
                        ) : null}
                        <span
                          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadgeClass(r.priority)}`}
                        >
                          {r.priority}
                        </span>
                        <div className="mt-3">
                          <Link
                            href={`/requests/${r.id}`}
                            className="text-xs font-semibold text-[#E8C84A] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View full request →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  href={`/requests/${r.id}`}
                  className="block rounded-lg border px-3 py-2 text-left transition border-[var(--border)] hover:border-violet-400/35"
                >
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
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
