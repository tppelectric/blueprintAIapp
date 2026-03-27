"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DailyLogPdfActions } from "@/components/daily-log-pdf-actions";
import { createBrowserClient } from "@/lib/supabase/client";
import type { DailyLogRow } from "@/lib/daily-logs-types";
import {
  extractMaterialLines,
  hoursWorked,
  sumHours,
} from "@/lib/daily-logs-helpers";

export function JobDailyLogsTab({
  jobId,
  jobName,
  projectBreakdownHref,
}: {
  jobId: string;
  jobName: string;
  projectBreakdownHref: string | null;
}) {
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data, error: qe } = await sb
        .from("daily_logs")
        .select("*")
        .eq("job_id", jobId)
        .order("log_date", { ascending: false })
        .order("check_in", { ascending: true });
      if (qe) {
        setError(qe.message);
        setLogs([]);
        return;
      }
      setLogs((data ?? []) as DailyLogRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalHours = useMemo(() => sumHours(logs), [logs]);

  const usedMaterials = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      for (const line of extractMaterialLines(l.materials_used)) {
        set.add(line);
      }
    }
    return [...set].slice(0, 80);
  }, [logs]);

  const neededMaterials = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      for (const line of extractMaterialLines(l.materials_needed)) {
        set.add(line);
      }
    }
    return [...set].slice(0, 80);
  }, [logs]);

  if (loading) {
    return <p className="mt-4 text-sm text-white/50">Loading daily logs…</p>;
  }
  if (error) {
    return (
      <p className="mt-4 text-sm text-red-300" role="alert">
        {error}
        {error.includes("daily_logs") || error.includes("schema") ? (
          <span className="mt-2 block text-white/50">
            Run <code className="text-[#E8C84A]">supabase/daily_logs.sql</code>{" "}
            if the table is missing.
          </span>
        ) : null}
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white/60">
            Total hours logged:{" "}
            <span className="font-semibold text-[#E8C84A]">{totalHours}h</span>
          </p>
          <p className="mt-1 text-xs text-white/40">
            {logs.length} log{logs.length === 1 ? "" : "s"} for {jobName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/jobs/daily-logs/new?jobId=${encodeURIComponent(jobId)}`}
            className="rounded-lg bg-[#E8C84A] px-3 py-2 text-xs font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
          >
            New daily log
          </Link>
          <Link
            href="/jobs/daily-logs"
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/10"
          >
            All daily logs
          </Link>
          {projectBreakdownHref ? (
            <Link
              href={projectBreakdownHref}
              className="rounded-lg border border-[#E8C84A]/45 px-3 py-2 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
            >
              Project breakdown
            </Link>
          ) : (
            <Link
              href="/tools/project-breakdown"
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/55 hover:bg-white/5"
            >
              Open breakdown tool
            </Link>
          )}
        </div>
      </div>

      {usedMaterials.length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
            Materials used (from logs)
          </h3>
          <ul className="mt-2 list-inside list-disc text-sm text-white/75">
            {usedMaterials.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {neededMaterials.length > 0 ? (
        <section className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-200/90">
            Materials needed
          </h3>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-100/85">
            {neededMaterials.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {logs.length === 0 ? (
        <p className="text-sm text-white/45">
          No daily logs for this job yet. Add one or import from JobTread CSV on
          the Daily Logs page.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-white/15 pl-5">
          {logs.map((l) => {
            const h = hoursWorked(l.check_in, l.check_out);
            return (
              <li key={l.id} className="relative">
                <span
                  className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#E8C84A]"
                  aria-hidden
                />
                <div className="rounded-xl border border-white/10 bg-[#0a1628]/80 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {l.log_date}
                      {l.crew_user ? (
                        <span className="font-normal text-white/55">
                          {" "}
                          · {l.crew_user}
                        </span>
                      ) : null}
                    </p>
                    {h != null ? (
                      <span className="text-xs font-medium text-[#E8C84A]">
                        {h}h
                      </span>
                    ) : null}
                  </div>
                  {l.check_in || l.check_out ? (
                    <p className="mt-1 font-mono text-xs text-white/45">
                      {l.check_in ?? "—"} → {l.check_out ?? "—"}
                    </p>
                  ) : null}
                  {l.job_status ? (
                    <p className="mt-2 text-xs text-white/55">
                      Status: {l.job_status}
                    </p>
                  ) : null}
                  {l.notes ? (
                    <p className="mt-2 text-sm text-white/75">{l.notes}</p>
                  ) : null}
                  {l.materials_used ? (
                    <div className="mt-2 text-xs text-white/50">
                      <span className="font-semibold text-white/60">
                        Materials:
                      </span>{" "}
                      {extractMaterialLines(l.materials_used).slice(0, 5).join(
                        " · ",
                      )}
                      {extractMaterialLines(l.materials_used).length > 5
                        ? "…"
                        : ""}
                    </div>
                  ) : null}
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <DailyLogPdfActions
                      logId={l.id}
                      logDate={l.log_date}
                      pdfStoragePath={l.pdf_storage_path ?? null}
                      compact
                      onPdfSaved={() => void load()}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
