"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DarkListSkeleton, EmptyState } from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { daysInclusive } from "@/lib/time-calendar-helpers";
import type { TimeOffRequestRow } from "@/lib/time-management-types";
import { createBrowserClient } from "@/lib/supabase/client";

const REQUEST_TYPES = [
  "pto",
  "sick",
  "personal",
  "unpaid",
  "holiday",
] as const;

function badgeType(t: string) {
  return "rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-100";
}

function statusBadge(status: string) {
  const base =
    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase";
  if (status === "approved") return `${base} bg-emerald-500/25 text-emerald-100`;
  if (status === "denied") return `${base} bg-red-500/25 text-red-100`;
  return `${base} bg-amber-500/25 text-amber-100`;
}

function initials(email: string, name: string) {
  const n = name?.trim();
  if (n) {
    const p = n.split(/\s+/);
    return (
      (p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")
    ).toUpperCase() || "?";
  }
  return email[0]?.toUpperCase() ?? "?";
}

export function TimeOffClient() {
  const { showToast } = useAppToast();
  const { profile, canManageTeamTime } = useUserRole();
  const [rows, setRows] = useState<TimeOffRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reqType, setReqType] =
    useState<(typeof REQUEST_TYPES)[number]>("pto");
  const [notes, setNotes] = useState("");

  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data, error: qe } = await sb
        .from("time_off_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (qe) throw qe;
      setRows((data ?? []) as TimeOffRequestRow[]);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not load requests.";
      setError(msg);
      setRows([]);
      showToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const uid = profile?.id ?? null;

  const myRequests = useMemo(
    () => rows.filter((r) => r.employee_id === uid),
    [rows, uid],
  );

  const pendingAll = useMemo(
    () => rows.filter((r) => r.status === "pending"),
    [rows],
  );

  useEffect(() => {
    if (!uid) return;
    const sb = createBrowserClient();
    const ch = sb
      .channel(`time-off-self-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "time_off_requests",
          filter: `employee_id=eq.${uid}`,
        },
        (payload) => {
          const n = payload.new as TimeOffRequestRow;
          const o = (payload.old ?? {}) as Partial<TimeOffRequestRow>;
          if (o.status === "pending" && n.status === "approved") {
            showToast({
              message: "Your time off request was approved.",
              variant: "success",
            });
          }
          if (o.status === "pending" && n.status === "denied") {
            showToast({
              message: `Time off denied${n.review_notes ? `: ${n.review_notes}` : ""}`,
              variant: "error",
            });
          }
          void load();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [uid, load, showToast]);

  const submit = async () => {
    if (!startDate || !endDate) {
      showToast({ message: "Choose start and end dates.", variant: "error" });
      return;
    }
    if (endDate < startDate) {
      showToast({ message: "End date must be on or after start.", variant: "error" });
      return;
    }
    const sb = createBrowserClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session?.user) return;
    setSubmitting(true);
    try {
      const { error: ie } = await sb.from("time_off_requests").insert({
        employee_id: session.user.id,
        employee_name:
          profile?.full_name?.trim() || profile?.email || session.user.email,
        start_date: startDate,
        end_date: endDate,
        request_type: reqType,
        notes: notes.trim() || null,
        status: "pending",
      });
      if (ie) throw ie;
      showToast({ message: "Request submitted.", variant: "success" });
      setNotes("");
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Submit failed.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (
    id: string,
    status: "approved" | "denied",
    reviewNotes: string | null,
  ) => {
    const sb = createBrowserClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    try {
      const { error: ue } = await sb
        .from("time_off_requests")
        .update({
          status,
          reviewed_by: session?.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
        })
        .eq("id", id);
      if (ue) throw ue;
      showToast({
        message: status === "approved" ? "Approved." : "Denied.",
        variant: "success",
      });
      setDenyId(null);
      setDenyNotes("");
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    }
  };

  const RequestCard = ({ r }: { r: TimeOffRequestRow }) => {
    const days = daysInclusive(r.start_date, r.end_date);
    const empLabel = r.employee_name ?? r.employee_id?.slice(0, 8) ?? "—";
    return (
      <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8C84A] text-sm font-bold text-[#0a1628]"
            aria-hidden
          >
            {initials("", empLabel)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{empLabel}</p>
            <p className="text-xs text-white/45">
              {r.start_date} → {r.end_date}{" "}
              <span className="text-white/60">({days} days)</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={badgeType(r.request_type)}>{r.request_type}</span>
              <span className={statusBadge(r.status)}>{r.status}</span>
            </div>
            {r.notes ? (
              <p className="mt-2 text-sm text-white/70">{r.notes}</p>
            ) : null}
            {r.review_notes ? (
              <p className="mt-2 text-xs text-white/50">
                Review: {r.review_notes}
              </p>
            ) : null}
          </div>
          {canManageTeamTime && r.status === "pending" ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              {denyId === r.id ? (
                <>
                  <textarea
                    className="app-input min-h-[4rem] text-xs"
                    placeholder="Reason (optional)"
                    value={denyNotes}
                    onChange={(e) => setDenyNotes(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void review(r.id, "denied", denyNotes || null)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                    >
                      Confirm deny
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDenyId(null);
                        setDenyNotes("");
                      }}
                      className="btn-secondary btn-h-11 !min-h-0 !py-2 !text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void review(r.id, "approved", null)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDenyId(r.id)}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="team_time" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-3xl flex-1 py-8 md:py-10">
        <Link href="/dashboard" className="text-sm text-[#E8C84A] hover:underline">
          ← Dashboard
        </Link>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold text-white">Time off</h1>
          {canManageTeamTime && pendingAll.length > 0 ? (
            <span className="rounded-full bg-amber-500/25 px-3 py-1 text-xs font-bold text-amber-100">
              {pendingAll.length} pending
            </span>
          ) : null}
        </div>

        {loading ? (
          <DarkListSkeleton className="mt-8" rows={6} />
        ) : error ? (
          <p className="mt-8 text-sm text-red-300" role="alert">
            {error}
            <span className="mt-2 block text-xs text-white/45">
              Apply <code className="text-[#E8C84A]">supabase/employee_time_management.sql</code>
            </span>
          </p>
        ) : (
          <>
            <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/55">
                New request
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-white/45">Start</label>
                  <input
                    type="date"
                    className="app-input mt-1 w-full"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/45">End</label>
                  <input
                    type="date"
                    className="app-input mt-1 w-full"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-white/45">Type</label>
                  <select
                    className="app-input mt-1 w-full"
                    value={reqType}
                    onChange={(e) =>
                      setReqType(e.target.value as (typeof REQUEST_TYPES)[number])
                    }
                  >
                    {REQUEST_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-white/45">Notes</label>
                  <textarea
                    className="app-input mt-1 min-h-[5rem] w-full"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="btn-primary btn-h-11 mt-4"
              >
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </section>

            {canManageTeamTime ? (
              <section className="mt-10">
                <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                  Pending (all employees)
                </h2>
                <div className="mt-4 space-y-3">
                  {pendingAll.length === 0 ? (
                    <EmptyState
                      icon={<span aria-hidden>✅</span>}
                      title="No pending requests"
                      description="When team members submit time off, they will appear here for approval."
                    />
                  ) : (
                    pendingAll.map((r) => <RequestCard key={r.id} r={r} />)
                  )}
                </div>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/55">
                My requests
              </h2>
              <div className="mt-4 space-y-3">
                {myRequests.length === 0 ? (
                  <EmptyState
                    icon={<span aria-hidden>🏖️</span>}
                    title="No time off requests yet"
                    description="Pick your dates and type above, add a short note if needed, then submit. Approved time shows on the work calendar."
                  />
                ) : (
                  myRequests.map((r) => <RequestCard key={r.id} r={r} />)
                )}
              </div>
            </section>

            {canManageTeamTime ? (
              <section className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h2 className="text-sm font-bold uppercase text-white/60">
                  Calendar preview (approved & pending)
                </h2>
                <p className="mt-1 text-xs text-white/40">
                  Full calendar:{" "}
                  <Link href="/calendar" className="text-[#E8C84A] hover:underline">
                    /calendar
                  </Link>
                </p>
                <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-xs text-white/70">
                  {rows
                    .filter((r) => r.status !== "denied")
                    .map((r) => (
                      <li key={r.id}>
                        <span
                          className={
                            r.status === "pending" ? "text-amber-200/90" : ""
                          }
                        >
                          {r.employee_name}: {r.start_date}–{r.end_date} ({r.request_type})
                        </span>
                        {r.status === "pending" ? " — pending" : ""}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
