"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  mapInternalRequestRow,
  mapRequestCommentRow,
  mapStatusEventRow,
} from "@/lib/internal-request-mappers";
import type { InternalRequestRow } from "@/lib/internal-request-types";
import { REQUEST_TYPE_OPTIONS } from "@/lib/internal-request-types";
import {
  daysOpen,
  internalRequestDetailsRows,
  priorityBadgeClass,
  statusBadgeClass,
  statusLabel,
} from "@/lib/internal-request-utils";
import { createBrowserClient } from "@/lib/supabase/client";
import type {
  InternalRequestStatusEventRow,
  RequestCommentRow,
} from "@/lib/internal-request-types";

type JobOpt = { id: string; job_name: string; job_number: string };
type AssetOpt = { id: string; name: string; asset_number: string };

const REQUEST_STATUS_PIPELINE: InternalRequestRow["status"][] = [
  "new",
  "in_review",
  "approved",
  "in_progress",
  "waiting",
  "completed",
];

function RequestStatusStepCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M3.5 8.2 6.3 11 12.5 4.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RequestStatusStepper({ status }: { status: InternalRequestRow["status"] }) {
  if (status === "declined" || status === "cancelled") {
    return (
      <div className="mt-6 rounded-xl border border-white/10 bg-[#0a1628] p-4">
        <p className="text-center text-sm font-semibold capitalize text-red-400">
          {statusLabel(status)}
        </p>
        <p className="mt-1 text-center text-xs text-red-400/70">
          This request will not continue through the normal workflow.
        </p>
      </div>
    );
  }

  const currentIndex = REQUEST_STATUS_PIPELINE.indexOf(status);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-[#0a1628] p-4">
      <div className="hidden items-stretch gap-0 md:flex">
        {REQUEST_STATUS_PIPELINE.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center">
              {i > 0 ? (
                <div
                  className="mx-1 h-px min-w-[8px] flex-1 border-t border-white/15"
                  aria-hidden
                />
              ) : null}
              <div
                className={`flex shrink-0 flex-col items-center gap-1 px-1 text-center ${
                  current ? "min-w-[4.5rem]" : "min-w-0"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    done
                      ? "border-[#E8C84A]/35 bg-[#E8C84A]/10 text-[#E8C84A]/70"
                      : current
                        ? "border-[#E8C84A] bg-[#E8C84A]/20 text-[#E8C84A]"
                        : "border-white/15 bg-white/[0.04] text-white/35"
                  }`}
                >
                  {done ? (
                    <RequestStatusStepCheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-[10px] font-bold tabular-nums text-current">
                      {i + 1}
                    </span>
                  )}
                </span>
                <span
                  className={`max-w-[5.5rem] text-[10px] font-medium capitalize leading-tight sm:max-w-none sm:text-xs ${
                    done
                      ? "text-[#E8C84A]/55"
                      : current
                        ? "text-base font-bold text-[#E8C84A]"
                        : "text-white/50"
                  }`}
                >
                  {statusLabel(step)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-0 md:hidden">
        {REQUEST_STATUS_PIPELINE.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <div key={step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-[#E8C84A]/35 bg-[#E8C84A]/10 text-[#E8C84A]/70"
                      : current
                        ? "border-[#E8C84A] bg-[#E8C84A]/20 text-[#E8C84A]"
                        : "border-white/15 bg-white/[0.04] text-white/35"
                  }`}
                >
                  {done ? (
                    <RequestStatusStepCheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-[10px] font-bold tabular-nums text-current">
                      {i + 1}
                    </span>
                  )}
                </span>
                {i < REQUEST_STATUS_PIPELINE.length - 1 ? (
                  <div
                    className="my-0.5 min-h-[10px] w-px flex-1 border-l border-white/15"
                    aria-hidden
                  />
                ) : null}
              </div>
              <span
                className={`pb-3 text-left text-sm capitalize ${
                  done
                    ? "text-[#E8C84A]/55"
                    : current
                      ? "text-base font-bold text-[#E8C84A]"
                      : "text-white/50"
                }`}
              >
                {statusLabel(step)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RequestsDetailClient({ requestId }: { requestId: string }) {
  const { showToast } = useAppToast();
  const {
    profile,
    loading: roleLoading,
    canViewAdminRequestQueue: isStaff,
    canPostInternalRequestNotes: canInternal,
  } = useUserRole();

  const [req, setReq] = useState<InternalRequestRow | null>(null);
  const [comments, setComments] = useState<RequestCommentRow[]>([]);
  const [events, setEvents] = useState<InternalRequestStatusEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<
    { id: string; full_name: string | null; email: string | null }[]
  >([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [assets, setAssets] = useState<AssetOpt[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [commentText, setCommentText] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);

  const [adminStatus, setAdminStatus] = useState<string>("");
  const [assignTo, setAssignTo] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [oshaRecordable, setOshaRecordable] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data: row, error: e1 } = await sb
        .from("internal_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();
      if (e1) throw e1;
      if (!row) {
        setReq(null);
        return;
      }
      const R = mapInternalRequestRow(row as Record<string, unknown>);
      setReq(R);
      setAdminStatus(R.status);
      setAssignTo(R.assigned_to ?? "");
      setAdminNotes(R.admin_notes ?? "");
      setResolutionNotes(R.resolution_notes ?? "");
      setOshaRecordable(Boolean(R.details?.safety_osha_recordable));

      const [cRes, evRes] = await Promise.all([
        sb
          .from("request_comments")
          .select("*")
          .eq("request_id", requestId)
          .order("created_at"),
        sb
          .from("internal_request_status_events")
          .select("*")
          .eq("request_id", requestId)
          .order("created_at"),
      ]);
      setComments(
        (cRes.data ?? []).map((r) =>
          mapRequestCommentRow(r as Record<string, unknown>),
        ),
      );
      setEvents(
        (evRes.data ?? []).map((r) =>
          mapStatusEventRow(r as Record<string, unknown>),
        ),
      );

      const urls: Record<string, string> = {};
      for (const path of R.photos) {
        const { data: signed } = await sb.storage
          .from("internal-request-files")
          .createSignedUrl(path.trim(), 3600);
        if (signed?.signedUrl) urls[path] = signed.signedUrl;
      }
      setPhotoUrls(urls);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load request.",
        variant: "error",
      });
      setReq(null);
    } finally {
      setLoading(false);
    }
  }, [requestId, showToast]);

  const loadMeta = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const [jRes, aRes, uRes] = await Promise.all([
        sb.from("jobs").select("id,job_name,job_number").limit(200),
        sb
          .from("assets")
          .select("id,name,asset_number,asset_type")
          .order("asset_number")
          .limit(500),
        fetch("/api/users/for-assignment", { credentials: "include" }),
      ]);
      setJobs((jRes.data ?? []) as JobOpt[]);
      setAssets(
        (aRes.data ?? []).map((a) => ({
          id: String(a.id),
          name: String(a.name ?? ""),
          asset_number: String(a.asset_number ?? ""),
        })),
      );
      if (uRes.ok) {
        const j = (await uRes.json()) as {
          users?: { id: string; full_name?: string | null; email?: string | null }[];
        };
        setUsers(
          (j.users ?? []).map((u) => ({
            id: u.id,
            full_name: u.full_name ?? null,
            email: u.email ?? null,
          })),
        );
      }
    } catch {
      setJobs([]);
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const userLabel = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const u = users.find((x) => x.id === id);
      return u?.full_name?.trim() || u?.email?.trim() || id.slice(0, 8);
    },
    [users],
  );

  const jobLabel = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const j = jobs.find((x) => x.id === id);
      return j
        ? `${j.job_number?.trim() || ""} · ${j.job_name?.trim() || ""}`.trim()
        : id.slice(0, 8);
    },
    [jobs],
  );

  const assetLabel = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const a = assets.find((x) => x.id === id);
      return a
        ? `${a.asset_number} · ${a.name || "Asset"}`
        : id.slice(0, 8);
    },
    [assets],
  );

  const canView = useMemo(() => {
    if (!req || !profile?.id) return false;
    if (req.submitted_by === profile.id) return true;
    if (req.assigned_to === profile.id) return true;
    return isStaff;
  }, [req, profile?.id, isStaff]);

  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    const t = commentText.trim();
    if (!t || !profile?.id) return;
    if (commentInternal && !canInternal) {
      showToast({
        message: "Only admins can post internal notes.",
        variant: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const { error } = await sb.from("request_comments").insert({
        request_id: requestId,
        author_id: profile.id,
        comment: t,
        is_internal: canInternal ? commentInternal : false,
      });
      if (error) throw error;
      setCommentText("");
      setCommentInternal(false);
      showToast({ message: "Comment added.", variant: "success" });
      void load();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveAdmin = async () => {
    if (!isStaff || !req) return;
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const nextDetails = { ...req.details };
      if (req.request_type === "safety_incident" && canInternal) {
        nextDetails.safety_osha_recordable = oshaRecordable;
      }
      const terminal =
        adminStatus === "completed" || adminStatus === "declined";
      const { error } = await sb
        .from("internal_requests")
        .update({
          status: adminStatus as InternalRequestRow["status"],
          assigned_to: assignTo.trim() || null,
          admin_notes: adminNotes.trim() || null,
          resolution_notes: resolutionNotes.trim() || null,
          details: nextDetails,
          resolved_at: terminal
            ? (req.resolved_at ?? new Date().toISOString())
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (error) throw error;
      showToast({ message: "Saved.", variant: "success" });
      void load();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!isStaff || !req) return;
    const reason = window.prompt("Reason for declining?");
    if (reason == null) return;
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("internal_requests")
        .update({
          status: "declined",
          resolution_notes: reason.trim() || null,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (error) throw error;
      setAdminStatus("declined");
      setResolutionNotes(reason);
      showToast({ message: "Declined.", variant: "success" });
      void load();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center text-white/60">
          Loading…
        </main>
      </div>
    );
  }

  if (!req || !canView) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center">
          <p className="text-white/70">Request not found or access denied.</p>
          <Link
            href="/my-requests"
            className="mt-4 inline-block text-[#E8C84A] hover:underline"
          >
            Back to my requests
          </Link>
        </main>
      </div>
    );
  }

  const typeMeta = REQUEST_TYPE_OPTIONS.find(
    (x) => x.value === req.request_type,
  );
  const detailRows = internalRequestDetailsRows(req.request_type, req.details);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-3xl flex-1 py-6 md:py-10">
        <div className="flex flex-wrap gap-2">
          <Link
            href={isStaff ? "/requests" : "/my-requests"}
            className="text-sm text-[#E8C84A] hover:underline"
          >
            ← {isStaff ? "All requests" : "My requests"}
          </Link>
        </div>

        <header className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="text-3xl" aria-hidden>
              {typeMeta?.icon ?? "📋"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-[#E8C84A]">
                {req.request_number}
              </p>
              <h1 className="text-xl font-semibold text-white">{req.title}</h1>
              <p className="mt-1 text-xs text-white/50">
                {typeMeta?.label ?? req.request_type} · Submitted{" "}
                {userLabel(req.submitted_by)} ·{" "}
                {new Date(req.created_at).toLocaleString()} · {daysOpen(req)}d
                open
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${priorityBadgeClass(
                  req.priority,
                )}`}
              >
                {req.priority}
              </span>
              <span
                className={`rounded-lg px-4 py-2 text-sm font-bold uppercase ${statusBadgeClass(
                  req.status,
                )}`}
              >
                {statusLabel(req.status)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/70">
            Assigned:{" "}
            <span className="font-medium text-white">
              {userLabel(req.assigned_to)}
            </span>
          </p>
        </header>

        <RequestStatusStepper status={req.status} />

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]/90">
            Details
          </h2>
          {req.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-white/85">
              {req.description}
            </p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase text-white/40">Job</dt>
              <dd className="text-white/90">{jobLabel(req.job_id)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-white/40">
                Linked asset
              </dt>
              <dd className="text-white/90">{assetLabel(req.asset_id)}</dd>
            </div>
            {req.quantity != null ? (
              <div>
                <dt className="text-[10px] uppercase text-white/40">Quantity</dt>
                <dd className="text-white/90">{req.quantity}</dd>
              </div>
            ) : null}
            {req.amount != null ? (
              <div>
                <dt className="text-[10px] uppercase text-white/40">Amount</dt>
                <dd className="text-white/90">${Number(req.amount).toFixed(2)}</dd>
              </div>
            ) : null}
            {req.date_needed ? (
              <div>
                <dt className="text-[10px] uppercase text-white/40">
                  Date needed
                </dt>
                <dd className="text-white/90">{req.date_needed}</dd>
              </div>
            ) : null}
            {req.item_description ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase text-white/40">
                  Item / specs
                </dt>
                <dd className="text-white/90">{req.item_description}</dd>
              </div>
            ) : null}
          </dl>

          {detailRows.length > 0 ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-[#071422]/80 p-3">
              <p className="text-[10px] font-bold uppercase text-white/45">
                Extra information
              </p>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {detailRows.map((row) => (
                  <div key={row.key} className="min-w-0 sm:col-span-1">
                    <dt className="text-[10px] uppercase text-white/40">
                      {row.label}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-white/88">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {req.photos.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-white/55">Photos</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {req.photos.map((p) => (
                  <a
                    key={p}
                    href={photoUrls[p] ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-white/15"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrls[p] ?? ""}
                      alt=""
                      className="h-28 w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {req.admin_notes && isStaff ? (
            <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-500/10 p-3">
              <p className="text-xs font-bold text-amber-200">Admin notes</p>
              <p className="mt-1 text-sm text-white/85">{req.admin_notes}</p>
            </div>
          ) : null}
          {req.resolution_notes ? (
            <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-3">
              <p className="text-xs font-bold text-emerald-200">
                Resolution
              </p>
              <p className="mt-1 text-sm text-white/85">
                {req.resolution_notes}
              </p>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]/90">
            Status timeline
          </h2>
          <ul className="mt-4 space-y-3 border-l-2 border-white/15 pl-4">
            {events.map((ev, i) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#E8C84A] ring-2 ring-[#0a1628]" />
                <p className="text-sm font-medium capitalize text-white">
                  {statusLabel(ev.status as InternalRequestRow["status"])}
                </p>
                <p className="text-xs text-white/45">
                  {new Date(ev.created_at).toLocaleString()}
                  {ev.created_by
                    ? ` · ${userLabel(ev.created_by)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]/90">
            Comments
          </h2>
          <ul className="mt-4 space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className={`rounded-lg border p-3 text-sm ${
                  c.is_internal
                    ? "border-amber-400/35 bg-amber-500/10"
                    : "border-white/10 bg-[#071422]/60"
                }`}
              >
                <p className="text-xs text-white/45">
                  {userLabel(c.author_id)} ·{" "}
                  {new Date(c.created_at).toLocaleString()}
                  {c.is_internal ? (
                    <span className="ml-2 font-bold text-amber-200">
                      Internal
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-white/90">
                  {c.comment}
                </p>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void addComment(e)} className="mt-4 space-y-2">
            <textarea
              className="w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              rows={3}
              placeholder="Add a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            {canInternal ? (
              <label className="flex items-center gap-2 text-xs text-amber-100/90">
                <input
                  type="checkbox"
                  checked={commentInternal}
                  onChange={(e) => setCommentInternal(e.target.checked)}
                />
                Internal note (admins only)
              </label>
            ) : null}
            <button
              type="submit"
              disabled={busy || !commentText.trim()}
              className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-50"
            >
              Post comment
            </button>
          </form>
        </section>

        {isStaff ? (
          <section className="mt-6 rounded-xl border border-orange-400/25 bg-orange-500/5 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-orange-200/90">
              Admin actions
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/55">
                Status
                <select
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
                  value={adminStatus}
                  onChange={(e) => setAdminStatus(e.target.value)}
                >
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
              <label className="text-xs text-white/55">
                Assign to
                <select
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name?.trim() || u.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-xs text-white/55">
              Admin notes
              <textarea
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                rows={2}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs text-white/55">
              Resolution / decline reason
              <textarea
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                rows={2}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            </label>
            {req.request_type === "safety_incident" && canInternal ? (
              <label className="mt-3 flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={oshaRecordable}
                  onChange={(e) => setOshaRecordable(e.target.checked)}
                />
                OSHA recordable (admin)
              </label>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveAdmin()}
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-50"
              >
                Save changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decline()}
                className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/15"
              >
                Decline with reason
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
