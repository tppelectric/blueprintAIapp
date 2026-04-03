"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

const ALL_REQUEST_STATUSES: InternalRequestRow["status"][] = [
  "new",
  "in_review",
  "approved",
  "in_progress",
  "waiting",
  "completed",
  "declined",
  "cancelled",
];

function isImageStoragePath(path: string): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(path);
}

function isPdfStoragePath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function attachmentDisplayName(path: string): string {
  const seg = path.split("/").pop() ?? path;
  const dash = seg.indexOf("-");
  return dash >= 0 ? seg.slice(dash + 1) : seg;
}

function acceptInternalRequestUploadFiles(files: File[]): File[] {
  return files.filter((f) => {
    if (f.type.startsWith("image/")) return true;
    if (f.type === "application/pdf") return true;
    if (!f.type && /\.(jpe?g|png|gif|webp|pdf)$/i.test(f.name)) return true;
    return false;
  });
}

const MARKETING_TABS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "in_review", label: "In Review" },
  { id: "urgent", label: "Urgent" },
  { id: "completed", label: "Completed" },
];

/** Active tab border + text (marketing filter); hex avoids Tailwind purge on dynamic classes. */
const MARKETING_TAB_COLORS: Record<string, string> = {
  all: "#E8C84A",
  new: "#ffffff",
  in_review: "#60a5fa",
  urgent: "#fb923c",
  completed: "#34d399",
};

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

/** Marketing collapsed row: dot color = status, with urgent/emergency override when non-terminal. */
function marketingCollapsedListDot(r: InternalRequestRow): {
  className: string;
  style: CSSProperties;
} {
  const nonTerminal = !isTerminalStatus(r.status);
  if (r.priority === "urgent" && nonTerminal) {
    return {
      className: "h-2.5 w-2.5 shrink-0 rounded-full",
      style: { backgroundColor: "#fb923c" },
    };
  }
  if (r.priority === "emergency" && nonTerminal) {
    return {
      className: "h-3 w-3 shrink-0 rounded-full",
      style: {
        backgroundColor: "#ef4444",
        boxShadow: "0 0 0 1px rgba(239, 68, 68, 0.4)",
      },
    };
  }
  const st = r.status;
  let bg = "#6b7280";
  if (st === "new") {
    bg = "#ffffff";
  } else if (
    st === "in_review" ||
    st === "approved" ||
    st === "in_progress" ||
    st === "waiting"
  ) {
    bg = "#60a5fa";
  } else if (st === "completed") {
    bg = "#34d399";
  } else if (st === "declined" || st === "cancelled") {
    bg = "#6b7280";
  }
  return {
    className: "h-2 w-2 shrink-0 rounded-full",
    style: { backgroundColor: bg },
  };
}

function MarketingCollapsedListDotSpan({ r }: { r: InternalRequestRow }) {
  const d = marketingCollapsedListDot(r);
  return <span className={d.className} style={d.style} aria-hidden />;
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

function requestCardLeftBorderColor(r: InternalRequestRow): string {
  if (r.priority === "emergency") return "border-l-red-500/70";
  if (r.priority === "urgent") return "border-l-orange-400/70";
  if (r.status === "completed") return "border-l-emerald-400/60";
  if (r.status === "declined" || r.status === "cancelled") return "border-l-zinc-500/50";
  if (
    r.status === "in_review" ||
    r.status === "approved" ||
    r.status === "in_progress" ||
    r.status === "waiting"
  ) return "border-l-blue-400/60";
  if (r.status === "new") return "border-l-white/40";
  return "border-l-[#E8C84A]/40";
}

export function HomeEmployeeRequestsWidget({ surface }: { surface: Surface }) {
  const { profile, loading, role } = useUserRole();
  const { showToast } = useAppToast();
  const [rows, setRows] = useState<InternalRequestRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [marketingFilter, setMarketingFilter] = useState<string>("all");
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<
    {
      id: string;
      job_name: string;
      job_number: string;
      customer_name: string;
    }[]
  >([]);
  const [jobSearch, setJobSearch] = useState<Record<string, string>>({});
  const [jobDropdownOpen, setJobDropdownOpen] = useState<
    Record<string, boolean>
  >({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );
  const [expandedSignedUrls, setExpandedSignedUrls] = useState<
    Record<string, string>
  >({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [dragOverRequestId, setDragOverRequestId] = useState<string | null>(
    null,
  );
  const [fileUploadTargetId, setFileUploadTargetId] = useState<string | null>(
    null,
  );
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [jobBusyId, setJobBusyId] = useState<string | null>(null);
  const [pendingStatusById, setPendingStatusById] = useState<
    Record<string, InternalRequestRow["status"]>
  >({});
  const [commentDraftById, setCommentDraftById] = useState<
    Record<string, string>
  >({});
  const [commentInternalById, setCommentInternalById] = useState<
    Record<string, boolean>
  >({});
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("jobs")
          .select("id,job_name,job_number,customers(company_name,contact_name)")
          .order("job_number", { ascending: false })
          .limit(300);
        if (cancelled || error) return;
        setJobs(
          (data ?? []).map((row) => {
            const rec = row as Record<string, unknown>;
            const c = Array.isArray(rec.customers)
              ? rec.customers[0]
              : rec.customers;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded customers row
            const customer_name = (c as any)?.company_name || (c as any)?.contact_name || "";
            return {
              id: String(rec.id ?? ""),
              job_name: String(rec.job_name ?? ""),
              job_number: String(rec.job_number ?? ""),
              customer_name: String(customer_name ?? ""),
            };
          }),
        );
      } catch {
        if (!cancelled) setJobs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const next: Record<string, InternalRequestRow["status"]> = {};
    for (const id of expandedIds) {
      const row = rows.find((x) => x.id === id);
      if (row) next[id] = row.status;
    }
    setPendingStatusById(next);
  }, [expandedIds, rows]);

  useEffect(() => {
    if (expandedIds.size === 0) return;
    let cancelled = false;
    void (async () => {
      const sb = createBrowserClient();
      for (const id of expandedIds) {
        if (cancelled) return;
        const row = rows.find((x) => x.id === id);
        if (!row) continue;

        const { count, error: cErr } = await sb
          .from("request_comments")
          .select("id", { count: "exact", head: true })
          .eq("request_id", id);
        if (!cancelled && !cErr) {
          setCommentCounts((prev) => ({
            ...prev,
            [id]: count ?? 0,
          }));
        }

        for (const path of row.photos ?? []) {
          if (cancelled) return;
          if (!isImageStoragePath(path) && !isPdfStoragePath(path)) continue;
          if (expandedSignedUrls[path]) continue;
          const { data, error: sErr } = await sb.storage
            .from("internal-request-files")
            .createSignedUrl(path, 3600);
          if (!cancelled && !sErr && data?.signedUrl) {
            setExpandedSignedUrls((prev) =>
              prev[path] === data.signedUrl
                ? prev
                : { ...prev, [path]: data.signedUrl },
            );
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedIds, rows, refreshTick, expandedSignedUrls]);

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

  const saveJobId = async (requestId: string, jobId: string | null) => {
    setJobBusyId(requestId);
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("internal_requests")
        .update({ job_id: jobId })
        .eq("id", requestId);
      if (error) throw error;
      setRefreshTick((t) => t + 1);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not update job link.",
        variant: "error",
      });
    } finally {
      setJobBusyId(null);
    }
  };

  const applyStatusUpdate = async (
    requestId: string,
    newStatus: InternalRequestRow["status"],
  ) => {
    setStatusBusyId(requestId);
    try {
      const sb = createBrowserClient();
      const row = rows.find((x) => x.id === requestId);
      const wasTerminal = row ? isTerminalStatus(row.status) : false;
      const nowTerminal = isTerminalStatus(newStatus);
      const nowTerminalResolved =
        newStatus === "completed" || newStatus === "declined";
      const payload: {
        status: InternalRequestRow["status"];
        updated_at: string;
        resolved_at?: string | null;
      } = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (nowTerminalResolved) {
        payload.resolved_at = new Date().toISOString();
      } else if (wasTerminal && !nowTerminal) {
        payload.resolved_at = null;
      }
      const { error } = await sb
        .from("internal_requests")
        .update(payload)
        .eq("id", requestId);
      if (error) throw error;
      showToast({ message: "Status updated.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Status update failed.",
        variant: "error",
      });
    } finally {
      setStatusBusyId(null);
    }
  };

  const postComment = async (requestId: string) => {
    const text = (commentDraftById[requestId] ?? "").trim();
    if (!text || !profile?.id) return;
    setCommentBusyId(requestId);
    try {
      const sb = createBrowserClient();
      const internal = Boolean(
        isAdminRole && commentInternalById[requestId],
      );
      const { error } = await sb.from("request_comments").insert({
        request_id: requestId,
        author_id: profile.id,
        comment: text,
        is_internal: internal,
      });
      if (error) throw error;
      setCommentDraftById((p) => ({ ...p, [requestId]: "" }));
      showToast({ message: "Comment added.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not post comment.",
        variant: "error",
      });
    } finally {
      setCommentBusyId(null);
    }
  };

  const openFilePickerForRequest = (requestId: string) => {
    setFileUploadTargetId(requestId);
    queueMicrotask(() => hiddenFileInputRef.current?.click());
  };

  const runUploadForRequest = async (requestId: string, files: FileList) => {
    const allowed = acceptInternalRequestUploadFiles(Array.from(files));
    if (allowed.length === 0) {
      showToast({
        message: "Only images and PDF files are allowed.",
        variant: "error",
      });
      return;
    }
    setUploadingId(requestId);
    setUploadProgress({ current: 0, total: allowed.length });
    try {
      const sb = createBrowserClient();
      const newPaths: string[] = [];
      for (let i = 0; i < allowed.length; i++) {
        const file = allowed[i];
        setUploadProgress({ current: i + 1, total: allowed.length });
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const path = `requests/${requestId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await sb.storage
          .from("internal-request-files")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
          });
        if (upErr) throw upErr;
        newPaths.push(path);
      }
      const { data: existing, error: fetchErr } = await sb
        .from("internal_requests")
        .select("photos")
        .eq("id", requestId)
        .single();
      if (fetchErr) throw fetchErr;
      const prevPhotos = Array.isArray(existing?.photos)
        ? (existing!.photos as unknown[]).map((x) => String(x))
        : [];
      const { error: rowErr } = await sb
        .from("internal_requests")
        .update({ photos: [...prevPhotos, ...newPaths] })
        .eq("id", requestId);
      if (rowErr) throw rowErr;
      showToast({ message: "Files attached.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Upload failed.",
        variant: "error",
      });
    } finally {
      setUploadingId(null);
      setUploadProgress(null);
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
                  const tabColor = MARKETING_TAB_COLORS[tab.id] ?? "#E8C84A";
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMarketingFilter(tab.id)}
                      className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-semibold transition ${
                        active
                          ? ""
                          : "border-transparent text-white/55 hover:text-white/85"
                      }`}
                      style={
                        active
                          ? {
                              borderColor: tabColor,
                              borderBottomColor: tabColor,
                              color: tabColor,
                            }
                          : undefined
                      }
                    >
                      {tab.label}
                      <span
                        className={`rounded-full bg-white/10 px-1.5 py-0 text-[10px] font-bold tabular-nums ${
                          active ? "" : "text-white/70"
                        }`}
                        style={active ? { color: tabColor } : undefined}
                      >
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
                    <div className={`rounded-lg border border-white/10 border-l-2 ${requestCardLeftBorderColor(r)} bg-white/[0.04] px-3 py-2 text-left transition hover:border-[#E8C84A]/35`}>
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
                            <MarketingCollapsedListDotSpan r={r} />
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
                            {(() => {
                              const canManageJobLink =
                                isAdminRole ||
                                (profile?.id === r.submitted_by &&
                                  r.status === "new");
                              const linkedJob = r.job_id
                                ? jobs.find((j) => j.id === r.job_id)
                                : null;
                              return canManageJobLink ? (
                                <div className="mt-2">
                                  {r.job_id ? (
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/75">
                                      <span className="min-w-0 truncate">
                                        Job:{" "}
                                        {linkedJob
                                          ? `${linkedJob.job_name} (#${linkedJob.job_number})`
                                          : r.job_id}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={jobBusyId === r.id}
                                        className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
                                        title="Clear job link"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void saveJobId(r.id, null);
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className="relative mt-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="text"
                                        className="w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-[#E8C84A]/50 focus:outline-none"
                                        placeholder="Search jobs by name, number, or customer…"
                                        value={jobSearch[r.id] ?? ""}
                                        onChange={(e) => {
                                          setJobSearch((prev) => ({
                                            ...prev,
                                            [r.id]: e.target.value,
                                          }));
                                          setJobDropdownOpen((prev) => ({
                                            ...prev,
                                            [r.id]: true,
                                          }));
                                        }}
                                        onFocus={() =>
                                          setJobDropdownOpen((prev) => ({
                                            ...prev,
                                            [r.id]: true,
                                          }))
                                        }
                                        onBlur={() =>
                                          setTimeout(
                                            () =>
                                              setJobDropdownOpen((prev) => ({
                                                ...prev,
                                                [r.id]: false,
                                              })),
                                            150,
                                          )
                                        }
                                      />
                                      {jobDropdownOpen[r.id] &&
                                        (() => {
                                          const q = (
                                            jobSearch[r.id] ?? ""
                                          )
                                            .toLowerCase()
                                            .trim();
                                          const filtered =
                                            q.length < 1
                                              ? []
                                              : jobs
                                                  .filter(
                                                    (j) =>
                                                      j.job_name
                                                        .toLowerCase()
                                                        .includes(q) ||
                                                      j.job_number
                                                        .toLowerCase()
                                                        .includes(q) ||
                                                      j.customer_name
                                                        .toLowerCase()
                                                        .includes(q),
                                                  )
                                                  .slice(0, 8);
                                          return filtered.length > 0 ? (
                                            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/15 bg-[#0a1628] shadow-xl">
                                              {filtered.map((j) => (
                                                <button
                                                  key={j.id}
                                                  type="button"
                                                  className="w-full px-3 py-2 text-left hover:bg-white/[0.06] focus:outline-none"
                                                  onMouseDown={(e) =>
                                                    e.preventDefault()
                                                  }
                                                  onClick={async () => {
                                                    setJobDropdownOpen(
                                                      (prev) => ({
                                                        ...prev,
                                                        [r.id]: false,
                                                      }),
                                                    );
                                                    setJobSearch((prev) => ({
                                                      ...prev,
                                                      [r.id]: "",
                                                    }));
                                                    const sb =
                                                      createBrowserClient();
                                                    await sb
                                                      .from(
                                                        "internal_requests",
                                                      )
                                                      .update({
                                                        job_id: j.id,
                                                        updated_at:
                                                          new Date().toISOString(),
                                                      })
                                                      .eq("id", r.id);
                                                    setRefreshTick((t) => t + 1);
                                                  }}
                                                >
                                                  <p className="text-sm text-white">
                                                    {j.job_number} ·{" "}
                                                    {j.job_name}
                                                  </p>
                                                  {j.customer_name ? (
                                                    <p className="text-xs text-white/50">
                                                      {j.customer_name}
                                                    </p>
                                                  ) : null}
                                                </button>
                                              ))}
                                            </div>
                                          ) : null;
                                        })()}
                                    </div>
                                  )}
                                </div>
                              ) : null;
                            })()}
                            {isAdminRole ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/75">
                                <span className="shrink-0 font-medium text-white/60">
                                  Status:
                                </span>
                                <div className="relative flex-1">
                                  <select
                                    value={
                                      pendingStatusById[r.id] ?? r.status
                                    }
                                    disabled={statusBusyId === r.id}
                                    className="w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-1.5 text-sm text-white focus:border-[#E8C84A]/50 focus:outline-none appearance-none cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const v = e.target
                                        .value as InternalRequestRow["status"];
                                      setPendingStatusById((p) => ({
                                        ...p,
                                        [r.id]: v,
                                      }));
                                    }}
                                  >
                                    {ALL_REQUEST_STATUSES.map((st) => (
                                      <option key={st} value={st}>
                                        {statusLabel(st)}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/40 text-xs">
                                    ▾
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  disabled={statusBusyId === r.id}
                                  className="shrink-0 rounded-lg bg-[#E8C84A] px-2.5 py-1.5 text-[10px] font-bold text-[#0a1628] transition hover:bg-[#f0d56e] disabled:opacity-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next =
                                      pendingStatusById[r.id] ?? r.status;
                                    void applyStatusUpdate(r.id, next);
                                  }}
                                >
                                  {statusBusyId === r.id
                                    ? "…"
                                    : "Update"}
                                </button>
                              </div>
                            ) : null}
                            <div className="mt-2">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                                <span aria-hidden>💬</span>
                                <span className="rounded-full border border-white/15 bg-white/5 px-1.5 py-0 text-[10px] font-bold tabular-nums text-white/70">
                                  {commentCounts[r.id] ?? 0}
                                </span>
                                <span>comments</span>
                              </div>
                              <textarea
                                rows={2}
                                value={commentDraftById[r.id] ?? ""}
                                disabled={commentBusyId === r.id}
                                placeholder="Add a comment…"
                                className="mt-1.5 w-full resize-none rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/35 outline-none focus:border-[#E8C84A]/50"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setCommentDraftById((p) => ({
                                    ...p,
                                    [r.id]: e.target.value,
                                  }));
                                }}
                              />
                              {isAdminRole ? (
                                <label
                                  className="mt-1.5 flex cursor-pointer items-center gap-2 text-[10px] text-white/55"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(
                                      commentInternalById[r.id],
                                    )}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setCommentInternalById((p) => ({
                                        ...p,
                                        [r.id]: e.target.checked,
                                      }));
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded border-white/30"
                                  />
                                  Internal note (admins only)
                                </label>
                              ) : null}
                              <button
                                type="button"
                                disabled={commentBusyId === r.id}
                                className="mt-1.5 rounded-lg bg-[#E8C84A] px-2.5 py-1 text-[10px] font-bold text-[#0a1628] transition hover:bg-[#f0d56e] disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void postComment(r.id);
                                }}
                              >
                                {commentBusyId === r.id
                                  ? "Posting…"
                                  : "Post"}
                              </button>
                            </div>
                            {r.photos?.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {r.photos.map((path) => {
                                  const url = expandedSignedUrls[path];
                                  if (isImageStoragePath(path)) {
                                    return url ? (
                                      <a
                                        key={path}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block shrink-0 overflow-hidden rounded border border-white/15"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-14 w-14 object-cover"
                                        />
                                      </a>
                                    ) : (
                                      <span
                                        key={path}
                                        className="flex h-14 w-14 items-center justify-center rounded border border-white/10 bg-white/5 text-[9px] text-white/40"
                                      >
                                        …
                                      </span>
                                    );
                                  }
                                  if (isPdfStoragePath(path)) {
                                    const name = attachmentDisplayName(path);
                                    return url ? (
                                      <a
                                        key={path}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex max-w-full items-center truncate rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/75 hover:bg-white/10"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        📄 {name}
                                      </a>
                                    ) : (
                                      <span
                                        key={path}
                                        className="inline-flex max-w-full truncate rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/45"
                                      >
                                        📄 {name}
                                      </span>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            ) : null}
                            <div
                              className={`mt-2 cursor-pointer rounded-lg border border-dashed p-3 text-center text-xs transition ${
                                dragOverRequestId === r.id
                                  ? "border-[#E8C84A]/60 bg-[#E8C84A]/5 text-white/70"
                                  : "border-white/20 text-white/45"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (uploadingId === r.id) return;
                                openFilePickerForRequest(r.id);
                              }}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" ||
                                  e.key === " "
                                ) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (uploadingId === r.id) return;
                                  openFilePickerForRequest(r.id);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              onDragEnter={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverRequestId(r.id);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDragLeave={(e) => {
                                e.stopPropagation();
                                const next = e.relatedTarget as Node | null;
                                if (
                                  next &&
                                  e.currentTarget.contains(next)
                                ) {
                                  return;
                                }
                                setDragOverRequestId((cur) =>
                                  cur === r.id ? null : cur,
                                );
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverRequestId(null);
                                if (uploadingId === r.id) return;
                                void runUploadForRequest(
                                  r.id,
                                  e.dataTransfer.files,
                                );
                              }}
                            >
                              {uploadingId === r.id && uploadProgress ? (
                                <span className="text-white/70">
                                  Uploading {uploadProgress.current}/
                                  {uploadProgress.total}…
                                </span>
                              ) : uploadingId === r.id ? (
                                <span className="text-white/70">
                                  Uploading…
                                </span>
                              ) : (
                                <>
                                  Drop files or tap to attach
                                  <span className="mt-0.5 block text-[10px] text-white/35">
                                    Images or PDF
                                  </span>
                                </>
                              )}
                            </div>
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
      <input
        ref={hiddenFileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const id = fileUploadTargetId;
          const list = e.target.files;
          e.target.value = "";
          if (!id || !list?.length) return;
          void runUploadForRequest(id, list);
          setFileUploadTargetId(null);
        }}
      />
    </div>
  );
}
