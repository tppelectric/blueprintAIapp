"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  JOB_STATUSES,
  JOB_TYPES,
  type CustomerRow,
  type JobAttachmentType,
  type JobListRow,
} from "@/lib/jobs-types";

export type NecQuestionLinkPayload = {
  question: string;
  answer: string;
  jurisdiction: string;
  necEdition: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, linking saves Q&A to `nec_questions` with `job_id` instead of job_attachments. */
  necQuestionLink?: NecQuestionLinkPayload;
  /** Required when not using `necQuestionLink`. */
  attachmentType?: JobAttachmentType;
  attachmentId?: string | null;
  attachmentLabel?: string;
};

export function LinkToJobDialog({
  open,
  onOpenChange,
  necQuestionLink,
  attachmentType,
  attachmentId,
  attachmentLabel,
}: Props) {
  const isNecMode = Boolean(necQuestionLink);
  const canLink = isNecMode ? true : Boolean(attachmentId);

  const [jobs, setJobs] = useState<JobListRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newJobName, setNewJobName] = useState("");
  const [newJobType, setNewJobType] = useState<string>(JOB_TYPES[0]!);
  const [newJobStatus, setNewJobStatus] = useState<string>(JOB_STATUSES[0]!);
  const [newCustomerId, setNewCustomerId] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const [jr, cr] = await Promise.all([
        sb
          .from("jobs")
          .select("id,job_name,job_number,status,job_type,updated_at,customer_id")
          .order("updated_at", { ascending: false })
          .limit(80),
        sb
          .from("customers")
          .select("id,company_name,contact_name,email,phone,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (!jr.error) setJobs((jr.data ?? []) as unknown as JobListRow[]);
      if (!cr.error) setCustomers((cr.data ?? []) as CustomerRow[]);
    } catch {
      setJobs([]);
      setCustomers([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    void load();
  }, [open, load]);

  const filteredJobs = jobs.filter((j) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      j.job_name.toLowerCase().includes(q) ||
      j.job_number.toLowerCase().includes(q)
    );
  });

  const linkToJob = async (jobId: string) => {
    if (!canLink) {
      setMsg(
        isNecMode
          ? "Missing question or answer."
          : "Save this item first so it has an ID, then link again.",
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const sb = createBrowserClient();
      if (necQuestionLink) {
        const { error } = await sb.from("nec_questions").insert({
          question: necQuestionLink.question.trim(),
          answer: necQuestionLink.answer.trim(),
          jurisdiction: necQuestionLink.jurisdiction,
          nec_edition: necQuestionLink.necEdition,
          job_id: jobId,
        });
        if (error) throw error;
        setMsg("Answer saved to job.");
      } else {
        if (!attachmentType) {
          setMsg("Missing attachment type.");
          return;
        }
        const { error } = await sb.from("job_attachments").insert({
          job_id: jobId,
          attachment_type: attachmentType,
          attachment_id: attachmentId!,
          label: attachmentLabel?.trim() || null,
        });
        if (error) throw error;
        setMsg("Linked successfully.");
      }
      window.setTimeout(() => onOpenChange(false), 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Link failed.");
    } finally {
      setBusy(false);
    }
  };

  const createAndLink = async () => {
    if (!canLink) {
      setMsg(
        isNecMode
          ? "Missing question or answer."
          : "Save this item first so it has an ID, then link again.",
      );
      return;
    }
    const name = newJobName.trim();
    if (!name) {
      setMsg("Enter a job name.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("jobs")
        .insert({
          job_name: name,
          job_type: newJobType,
          status: newJobStatus,
          customer_id: newCustomerId || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const jobId = data?.id as string | undefined;
      if (!jobId) throw new Error("No job id returned.");

      if (necQuestionLink) {
        const { error: nqErr } = await sb.from("nec_questions").insert({
          question: necQuestionLink.question.trim(),
          answer: necQuestionLink.answer.trim(),
          jurisdiction: necQuestionLink.jurisdiction,
          nec_edition: necQuestionLink.necEdition,
          job_id: jobId,
        });
        if (nqErr) throw nqErr;
        setMsg("Answer saved to job.");
      } else {
        if (!attachmentType) {
          setMsg("Missing attachment type.");
          return;
        }
        const { error: attErr } = await sb.from("job_attachments").insert({
          job_id: jobId,
          attachment_type: attachmentType,
          attachment_id: attachmentId!,
          label: attachmentLabel?.trim() || null,
        });
        if (attErr) throw attErr;
        setMsg("Created job and linked.");
      }
      window.setTimeout(() => onOpenChange(false), 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-job-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
        <h2 id="link-job-title" className="text-lg font-semibold text-white">
          {isNecMode ? "Save NEC answer to job" : "Link to job"}
        </h2>
        <p className="mt-1 text-xs text-white/55">
          {isNecMode
            ? "Choose a job to store this question and full answer in your records."
            : "Attach this record to a job for tracking. Requires a saved record ID."}
        </p>

        {!isNecMode && !attachmentId ? (
          <p className="mt-4 rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Save this item first (database save), then open Link to job again.
          </p>
        ) : null}

        {msg ? (
          <p className="mt-3 text-sm text-white/80">{msg}</p>
        ) : null}

        <label className="mt-4 block text-xs text-white/60">
          Search jobs
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or job number"
          />
        </label>

        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/10">
          {filteredJobs.length === 0 ? (
            <p className="p-3 text-sm text-white/45">No jobs found.</p>
          ) : (
            filteredJobs.map((j) => (
              <button
                key={j.id}
                type="button"
                disabled={busy || !canLink}
                onClick={() => void linkToJob(j.id)}
                className="flex w-full flex-col items-start border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/5 disabled:opacity-40"
              >
                <span className="font-medium text-white">
                  {j.job_number} · {j.job_name}
                </span>
                <span className="text-xs text-white/50">
                  {j.job_type} · {j.status}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#E8C84A]/90">
            Or create new job
          </p>
          <label className="mt-2 block text-xs text-white/60">
            Job name
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={newJobName}
              onChange={(e) => setNewJobName(e.target.value)}
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-white/60">
              Type
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
                value={newJobType}
                onChange={(e) => setNewJobType(e.target.value)}
              >
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-white/60">
              Status
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
                value={newJobStatus}
                onChange={(e) => setNewJobStatus(e.target.value)}
              >
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-2 block text-xs text-white/60">
            Customer (optional)
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-2 text-sm text-white"
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
            >
              <option value="">— None —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name || c.contact_name || c.email || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !canLink}
            onClick={() => void createAndLink()}
            className="mt-3 w-full rounded-lg bg-[#E8C84A] py-2.5 text-sm font-semibold text-[#0a1628] disabled:opacity-45"
          >
            {isNecMode ? "Create job & save answer" : "Create job & link"}
          </button>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-lg border border-white/20 py-2 text-sm text-white/80 hover:bg-white/5"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
