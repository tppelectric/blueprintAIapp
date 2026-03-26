"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { extractMaterialLines } from "@/lib/daily-logs-helpers";
import type { DailyLogInsert, DailyLogRow } from "@/lib/daily-logs-types";
import { dailyLogsToJobtreadCsv } from "@/lib/jobtread-csv";
import { createBrowserClient } from "@/lib/supabase/client";

type JobOption = { id: string; job_name: string; job_number: string };

type AssigneeOption = {
  id: string;
  email: string;
  full_name: string;
};

function toTimeDb(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{1,2}:\d{2}$/.test(t)) return `${t.padStart(5, "0")}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return t;
}

const emptyForm: DailyLogInsert = {
  jobtread_id: null,
  log_date: new Date().toISOString().slice(0, 10),
  job_name: null,
  job_id: null,
  crew_user: null,
  notes: null,
  employees_onsite: null,
  check_in: null,
  check_out: null,
  job_status: null,
  trades_onsite: null,
  visitors_onsite: null,
  additional_notes: null,
  materials_used: null,
  materials_needed: null,
  materials_left_onsite: false,
  equipment_left_onsite: null,
  tpp_equipment_left: false,
  anticipated_delays: null,
  all_breakers_on: true,
  breakers_off_reason: null,
  supply_receipts: null,
  card_type: null,
  store_receipts: null,
  internal_notes: null,
};

export function DailyLogsNewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preJobId = searchParams.get("jobId")?.trim() || "";
  const preLogDate = searchParams.get("logDate")?.trim() || "";
  const preCheckIn = searchParams.get("checkIn")?.trim() || "";
  const preCheckOut = searchParams.get("checkOut")?.trim() || "";
  const { showToast } = useAppToast();

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [form, setForm] = useState<DailyLogInsert>(() => ({
    ...emptyForm,
    job_id: preJobId || null,
    log_date: preLogDate || emptyForm.log_date,
    check_in: preCheckIn ? toTimeDb(preCheckIn) : null,
    check_out: preCheckOut ? toTimeDb(preCheckOut) : null,
  }));
  const [saving, setSaving] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("jobs")
        .select("id,job_name,job_number")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setJobs(
        (data ?? []).map((j) => ({
          id: j.id as string,
          job_name: String(j.job_name ?? ""),
          job_number: String(j.job_number ?? ""),
        })),
      );
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/users/for-assignment", {
          credentials: "include",
        });
        const j = (await r.json()) as { users?: AssigneeOption[] };
        if (!cancelled && r.ok && j.users) setAssignees(j.users);
      } catch {
        if (!cancelled) setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.job_id) return;
    const j = jobs.find((x) => x.id === form.job_id);
    if (!j) return;
    setForm((f) => ({
      ...f,
      job_name: `${j.job_number} · ${j.job_name}`,
    }));
  }, [form.job_id, jobs]);

  const set =
    <K extends keyof DailyLogInsert>(key: K) =>
    (v: DailyLogInsert[K]) => {
      setForm((f) => ({ ...f, [key]: v }));
    };

  const save = async () => {
    if (!form.log_date?.trim()) {
      showToast({ message: "Choose a log date.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const sb = createBrowserClient();
      const payload: DailyLogInsert = {
        ...form,
        log_date: form.log_date.trim(),
        check_in: toTimeDb(String(form.check_in ?? "")),
        check_out: toTimeDb(String(form.check_out ?? "")),
        job_id: form.job_id?.trim() || null,
        job_name: form.job_name?.trim() || null,
        crew_user: form.crew_user?.trim() || null,
      };
      const { error } = await sb.from("daily_logs").insert(payload);
      if (error) throw error;
      showToast({ message: "Daily log saved.", variant: "success" });
      if (form.job_id) {
        router.push(`/jobs/${form.job_id}`);
      } else {
        router.push("/jobs/daily-logs");
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const exportDraftCsv = () => {
    const row: DailyLogRow = {
      id: "draft",
      created_at: new Date().toISOString(),
      jobtread_id: form.jobtread_id,
      log_date: form.log_date,
      job_name: form.job_name,
      job_id: form.job_id,
      crew_user: form.crew_user,
      notes: form.notes,
      employees_onsite: form.employees_onsite,
      check_in: form.check_in,
      check_out: form.check_out,
      job_status: form.job_status,
      trades_onsite: form.trades_onsite,
      visitors_onsite: form.visitors_onsite,
      additional_notes: form.additional_notes,
      materials_used: form.materials_used,
      materials_needed: form.materials_needed,
      materials_left_onsite: form.materials_left_onsite,
      equipment_left_onsite: form.equipment_left_onsite,
      tpp_equipment_left: form.tpp_equipment_left,
      anticipated_delays: form.anticipated_delays,
      all_breakers_on: form.all_breakers_on,
      breakers_off_reason: form.breakers_off_reason,
      supply_receipts: form.supply_receipts,
      card_type: form.card_type,
      store_receipts: form.store_receipts,
      internal_notes: form.internal_notes,
    };
    const csv = dailyLogsToJobtreadCsv([row]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-log-draft-${form.log_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ta =
    "app-input min-h-[5rem] w-full resize-y font-sans text-sm leading-relaxed";

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-3xl flex-1 py-8 md:py-10">
        <Link
          href="/jobs/daily-logs"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Daily logs
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">New daily log</h1>
        <p className="mt-1 text-sm text-white/50">
          Matches JobTread-style fields. Use one line per material when possible
          for cleaner summaries.
        </p>

        <div className="mt-8 space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-white/50">
                Log date *
              </label>
              <input
                type="date"
                className="app-input mt-1 w-full"
                value={form.log_date}
                onChange={(e) => set("log_date")(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                JobTread / external ID
              </label>
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={form.jobtread_id ?? ""}
                onChange={(e) =>
                  set("jobtread_id")(e.target.value.trim() || null)
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-white/50">
                Job
              </label>
              <select
                className="app-input mt-1 w-full"
                value={form.job_id ?? ""}
                onChange={(e) =>
                  set("job_id")(e.target.value.trim() || null)
                }
              >
                <option value="">— None —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number} · {j.job_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Crew (quick pick)
              </label>
              <select
                className="app-input mt-1 w-full"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const u = assignees.find((x) => x.id === id);
                  set("crew_user")(
                    u?.full_name?.trim() || u?.email?.trim() || null,
                  );
                  e.target.value = "";
                }}
              >
                <option value="">— Select user —</option>
                {assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Crew / employee (text)
              </label>
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={form.crew_user ?? ""}
                onChange={(e) =>
                  set("crew_user")(e.target.value.trim() || null)
                }
                placeholder="As it should appear on reports"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Check in
              </label>
              <input
                type="time"
                className="app-input mt-1 w-full"
                value={
                  form.check_in
                    ? String(form.check_in).slice(0, 5)
                    : ""
                }
                onChange={(e) =>
                  set("check_in")(e.target.value ? `${e.target.value}:00` : null)
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Check out
              </label>
              <input
                type="time"
                className="app-input mt-1 w-full"
                value={
                  form.check_out
                    ? String(form.check_out).slice(0, 5)
                    : ""
                }
                onChange={(e) =>
                  set("check_out")(
                    e.target.value ? `${e.target.value}:00` : null,
                  )
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-white/50">
                Job name (denormalized)
              </label>
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={form.job_name ?? ""}
                onChange={(e) =>
                  set("job_name")(e.target.value.trim() || null)
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-white/50">
                Job status
              </label>
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={form.job_status ?? ""}
                onChange={(e) =>
                  set("job_status")(e.target.value.trim() || null)
                }
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50">Notes</label>
            <textarea
              className={ta}
              value={form.notes ?? ""}
              onChange={(e) => set("notes")(e.target.value.trim() || null)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Employees onsite
            </label>
            <textarea
              className={ta}
              value={form.employees_onsite ?? ""}
              onChange={(e) =>
                set("employees_onsite")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Trades onsite
            </label>
            <textarea
              className={ta}
              value={form.trades_onsite ?? ""}
              onChange={(e) =>
                set("trades_onsite")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Visitors onsite
            </label>
            <textarea
              className={ta}
              value={form.visitors_onsite ?? ""}
              onChange={(e) =>
                set("visitors_onsite")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Additional notes
            </label>
            <textarea
              className={ta}
              value={form.additional_notes ?? ""}
              onChange={(e) =>
                set("additional_notes")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Materials used (one line per item when possible)
            </label>
            <textarea
              className={ta}
              value={form.materials_used ?? ""}
              onChange={(e) =>
                set("materials_used")(e.target.value.trim() || null)
              }
            />
            {form.materials_used?.trim() ? (
              <ul className="mt-2 list-inside list-disc text-xs text-white/45">
                {extractMaterialLines(form.materials_used).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Materials needed
            </label>
            <textarea
              className={ta}
              value={form.materials_needed ?? ""}
              onChange={(e) =>
                set("materials_needed")(e.target.value.trim() || null)
              }
            />
            {form.materials_needed?.trim() ? (
              <ul className="mt-2 list-inside list-disc text-xs text-amber-200/70">
                {extractMaterialLines(form.materials_needed).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.materials_left_onsite}
                onChange={(e) => set("materials_left_onsite")(e.target.checked)}
              />
              Materials left onsite
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.tpp_equipment_left}
                onChange={(e) => set("tpp_equipment_left")(e.target.checked)}
              />
              TPP equipment left
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.all_breakers_on}
                onChange={(e) => set("all_breakers_on")(e.target.checked)}
              />
              All breakers on
            </label>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50">
              Equipment left onsite
            </label>
            <textarea
              className={ta}
              value={form.equipment_left_onsite ?? ""}
              onChange={(e) =>
                set("equipment_left_onsite")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Anticipated delays
            </label>
            <textarea
              className={ta}
              value={form.anticipated_delays ?? ""}
              onChange={(e) =>
                set("anticipated_delays")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Breakers off reason
            </label>
            <textarea
              className={ta}
              value={form.breakers_off_reason ?? ""}
              onChange={(e) =>
                set("breakers_off_reason")(e.target.value.trim() || null)
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Supply receipts
            </label>
            <textarea
              className={ta}
              value={form.supply_receipts ?? ""}
              onChange={(e) =>
                set("supply_receipts")(e.target.value.trim() || null)
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-white/50">
                Card type
              </label>
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={form.card_type ?? ""}
                onChange={(e) =>
                  set("card_type")(e.target.value.trim() || null)
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Store receipts
              </label>
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={form.store_receipts ?? ""}
                onChange={(e) =>
                  set("store_receipts")(e.target.value.trim() || null)
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-white/50">
              Internal notes
            </label>
            <textarea
              className={ta}
              value={form.internal_notes ?? ""}
              onChange={(e) =>
                set("internal_notes")(e.target.value.trim() || null)
              }
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="btn-primary btn-h-11"
          >
            {saving ? "Saving…" : "Save log"}
          </button>
          <button
            type="button"
            onClick={exportDraftCsv}
            className="btn-secondary btn-h-11 border-[#E8C84A]/45 text-[#E8C84A]"
          >
            Export draft to CSV
          </button>
        </div>
      </main>
    </div>
  );
}
