"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapInternalRequestRow } from "@/lib/internal-request-mappers";
import {
  daysOpen,
  isTerminalStatus,
  priorityBadgeClass,
  statusBadgeClass,
  statusLabel,
} from "@/lib/internal-request-utils";
import type {
  InternalRequestRow,
  InternalRequestType,
} from "@/lib/internal-request-types";
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

const PIPELINE_FILTER_STATUSES = new Set<InternalRequestRow["status"]>([
  "in_review",
  "approved",
  "in_progress",
  "waiting",
]);

const MARKETING_TABS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "in_review", label: "In Review" },
  { id: "urgent", label: "Urgent" },
  { id: "completed", label: "Completed" },
];

/** Icons/short labels by `InternalRequestType` (marketing list). */
const MARKETING_TYPE_META: Record<
  InternalRequestType,
  { icon: string; short: string }
> = {
  vehicle_maintenance: { icon: "🔧", short: "Vehicle" },
  vehicle_request: { icon: "🚛", short: "Vehicle" },
  tool_repair: { icon: "🔧", short: "Repair" },
  material_order: { icon: "📦", short: "Material" },
  tool_request: { icon: "🛠", short: "Tool" },
  document_request: { icon: "📄", short: "Document" },
  license_request: { icon: "📋", short: "License" },
  expense_reimbursement: { icon: "💰", short: "Expense" },
  safety_incident: { icon: "⚠️", short: "Safety" },
  hr_admin: { icon: "👤", short: "HR" },
  app_support: { icon: "💻", short: "App" },
  other: { icon: "📝", short: "Other" },
};

function priorityDotClass(p: InternalRequestRow["priority"]): string {
  switch (p) {
    case "low":
      return "bg-white/30";
    case "urgent":
      return "bg-orange-400";
    case "emergency":
      return "bg-red-500";
    default:
      return "bg-blue-400";
  }
}

function formatAgeLabel(r: InternalRequestRow): string {
  const d = daysOpen(r);
  if (d === 0) return "Today";
  if (d === 1) return "1 day";
  return `${d} days`;
}

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
  const { profile, loading, role } = useUserRole();
  const { showToast } = useAppToast();
  const [rows, setRows] = useState<InternalRequestRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [marketingFilter, setMarketingFilter] = useState<string>("all");
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isMarketing = surface === "marketing";
  const isAdminRole = role === "admin" || role === "super_admin";

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
          .limit(surface === "marketing" ? 10 : 3);
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
  }, [profile?.id, loading, surface, refreshTick]);

  const tabCounts = useMemo(() => {
    return {
      all: rows.length,
      new: rows.filter((r) => r.status === "new").length,
      in_review: rows.filter((r) => PIPELINE_FILTER_STATUSES.has(r.status))
        .length,
      urgent: rows.filter(
        (r) => r.priority === "urgent" || r.priority === "emergency",
      ).length,
      completed: rows.filter((r) => isTerminalStatus(r.status)).length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!isMarketing) return rows;
    switch (marketingFilter) {
      case "all":
        return rows;
      case "new":
        return rows.filter((r) => r.status === "new");
      case "in_review":
        return rows.filter((r) => PIPELINE_FILTER_STATUSES.has(r.status));
      case "urgent":
        return rows.filter(
          (r) => r.priority === "urgent" || r.priority === "emergency",
        );
      case "completed":
        return rows.filter((r) => isTerminalStatus(r.status));
      default:
        return rows;
    }
  }, [rows, marketingFilter, isMarketing]);

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

  const markInReview = async (id: string) => {
    setBusyId(id);
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("internal_requests")
        .update({
          status: "in_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      showToast({ message: "Marked in review.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const displayRows = isMarketing ? filteredRows : rows;

  const newShortcutClass =
    "rounded-lg px-2 py-1 text-xs transition bg-white/10 text-white hover:bg-white/20";

  return (
    <div className={cardClass}>
      {isMarketing ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">
            My recent requests
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Link
              href="/requests/new?type=material_order"
              className={newShortcutClass}
            >
              📦 Material
            </Link>
            <Link
              href="/requests/new?type=vehicle_maintenance"
              className={newShortcutClass}
            >
              🔧 Vehicle
            </Link>
            <Link
              href="/requests/new"
              className="rounded-lg px-2 py-1 text-xs font-bold transition bg-[#E8C84A] text-[#0a1628] hover:bg-[#f0d56e]"
            >
              + New
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              My recent requests
            </h3>
            <Link
              href="/my-requests"
              className="text-xs font-semibold text-violet-300 hover:underline"
            >
              View all
            </Link>
          </div>
          <Link
            href="/requests/new"
            className="mt-3 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition bg-violet-500 text-white hover:bg-violet-400"
          >
            + New request
          </Link>
        </>
      )}
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
        <>
          {isMarketing ? (
            <div className="mt-2 flex justify-end">
              <Link
                href="/my-requests"
                className="text-xs font-semibold text-[#E8C84A] hover:underline"
              >
                View all
              </Link>
            </div>
          ) : null}
          <p
            className={`mt-3 text-xs ${isMarketing ? "text-white/50" : "text-[var(--foreground-muted)]"}`}
          >
            No requests yet.
          </p>
        </>
      ) : (
        <>
          {isMarketing ? (
            <>
              <div
                className="mt-3 flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Filter requests"
              >
                {MARKETING_TABS.map((tab) => {
                  const count =
                    tabCounts[tab.id as keyof typeof tabCounts] ?? 0;
                  const active = marketingFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMarketingFilter(tab.id)}
                      className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-[#E8C84A] text-[#E8C84A]"
                          : "border-transparent text-white/55 hover:text-white/85"
                      }`}
                    >
                      {tab.label}
                      <span className="rounded-full bg-white/10 px-1.5 py-0 text-[10px] font-bold tabular-nums text-white/70">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-end">
                <Link
                  href="/my-requests"
                  className="text-xs font-semibold text-[#E8C84A] hover:underline"
                >
                  View all
                </Link>
              </div>
            </>
          ) : null}
          <ul className="mt-3 space-y-2">
            {displayRows.map((r) => {
              const typeMeta = MARKETING_TYPE_META[r.request_type];
              return (
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
                        <div className="flex items-start gap-2">
                          <div className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5">
                            <span
                              className={`shrink-0 rounded-full ${
                                r.priority === "urgent"
                                  ? "h-2.5 w-2.5 bg-[#E8C84A]"
                                  : r.priority === "emergency"
                                    ? "h-3 w-3 bg-[#E8C84A] ring-1 ring-[#E8C84A]/40"
                                    : `h-2 w-2 ${priorityDotClass(r.priority)}`
                              }`}
                              aria-hidden
                            />
                            <span
                              className="text-base leading-none"
                              aria-hidden
                            >
                              {typeMeta.icon}
                            </span>
                            <span className="max-w-[3.25rem] text-center text-[9px] font-medium leading-tight text-white/55">
                              {typeMeta.short}
                            </span>
                            <span className="max-w-full truncate text-center font-mono text-[8px] text-[#E8C84A]/75">
                              {r.request_number}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 truncate text-sm font-medium text-white">
                                {r.title}
                              </p>
                              <svg
                                className={`h-4 w-4 shrink-0 text-white/45 transition-transform duration-200 ${
                                  expandedIds.has(r.id)
                                    ? "rotate-180"
                                    : "rotate-0"
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
                            <MarketingRequestMiniStepper status={r.status} />
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                            {r.priority === "urgent" || r.priority === "emergency" ? (
                              <span className="shrink-0 rounded-full border border-[#E8C84A]/30 bg-[#E8C84A]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#E8C84A]">
                                {r.priority === "urgent"
                                  ? "⚠ Urgent"
                                  : "🚨 Emergency"}
                              </span>
                            ) : null}
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(r.status)}`}
                            >
                              {statusLabel(r.status)}
                            </span>
                            <span className="text-[10px] text-white/45">
                              {formatAgeLabel(r)}
                            </span>
                          </div>
                        </div>
                      </button>
                      <div
                        id={`home-req-expand-${r.id}`}
                        role="region"
                        aria-labelledby={`home-req-trigger-${r.id}`}
                        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                          expandedIds.has(r.id)
                            ? "grid-rows-[1fr]"
                            : "grid-rows-[0fr]"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="border-t border-white/10 pt-2">
                            <p className="whitespace-normal break-words text-sm font-medium text-white">
                              {r.title}
                            </p>
                            {r.description ? (
                              <p className="mt-2 line-clamp-3 overflow-hidden whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                                {r.description}
                              </p>
                            ) : null}
                            {r.amount != null && Number.isFinite(r.amount) ? (
                              <p className="mt-2 text-sm font-semibold tabular-nums text-[#E8C84A]">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(r.amount)}
                              </p>
                            ) : null}
                            <span
                              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadgeClass(r.priority)}`}
                            >
                              {r.priority}
                            </span>
                            {isAdminRole && r.status === "new" ? (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  disabled={busyId === r.id}
                                  className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A] transition hover:bg-[#E8C84A]/20 disabled:opacity-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void markInReview(r.id);
                                  }}
                                >
                                  {busyId === r.id
                                    ? "Saving…"
                                    : "Mark as In Review"}
                                </button>
                              </div>
                            ) : null}
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
              );
            })}
          </ul>
          {isMarketing && filteredRows.length === 0 ? (
            <p className="mt-2 text-center text-xs text-white/45">
              No requests in this view.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
