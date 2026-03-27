"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DailyLogPdfActions } from "@/components/daily-log-pdf-actions";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import {
  extractMaterialLines,
  hoursWorked,
  netHoursAfterLunch,
} from "@/lib/daily-logs-helpers";
import type { DailyLogRow } from "@/lib/daily-logs-types";
import { createBrowserClient } from "@/lib/supabase/client";

function textLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitCrewNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]+|\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function crewAvatarInitials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] ?? "";
    const b = parts[parts.length - 1][0] ?? "";
    return (a + b).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

type PhotoRow = {
  id: string;
  file_path: string;
  caption: string | null;
  original_name: string;
};

export function DailyLogDetailClient({ logId }: { logId: string }) {
  const { showToast } = useAppToast();
  const [log, setLog] = useState<DailyLogRow | null>(null);
  const [photos, setPhotos] = useState<{ row: PhotoRow; url: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data: row, error: le } = await sb
        .from("daily_logs")
        .select("*")
        .eq("id", logId)
        .maybeSingle();
      if (le || !row) {
        setLog(null);
        if (le) showToast({ message: le.message, variant: "error" });
        return;
      }
      setLog(row as DailyLogRow);

      const { data: atts, error: ae } = await sb
        .from("daily_log_attachments")
        .select("id, file_path, caption, original_name, kind")
        .eq("daily_log_id", logId)
        .eq("kind", "photo")
        .order("created_at", { ascending: true });
      if (ae) {
        showToast({ message: ae.message, variant: "error" });
        setPhotos([]);
        return;
      }
      const list: { row: PhotoRow; url: string }[] = [];
      for (const a of atts ?? []) {
        const pr = a as PhotoRow & { kind: string };
        const { data: signed } = await sb.storage
          .from("daily-log-attachments")
          .createSignedUrl(pr.file_path, 3600);
        if (signed?.signedUrl) {
          list.push({ row: pr, url: signed.signedUrl });
        }
      }
      setPhotos(list);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
      setLog(null);
    } finally {
      setLoading(false);
    }
  }, [logId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const grossHours = log ? hoursWorked(log.check_in, log.check_out) : null;
  const netHours = log
    ? netHoursAfterLunch(
        log.check_in,
        log.check_out,
        log.lunch_duration_minutes,
      )
    : null;

  const materialsUsed = useMemo(
    () => (log ? extractMaterialLines(log.materials_used) : []),
    [log],
  );
  const materialsNeeded = useMemo(
    () => (log ? extractMaterialLines(log.materials_needed) : []),
    [log],
  );

  const crewMembers = useMemo(() => {
    if (!log) return [];
    const names = new Set<string>();
    const lead = log.crew_user?.trim();
    if (lead) names.add(lead);
    for (const line of textLines(log.employees_onsite)) names.add(line);
    for (const n of splitCrewNames(log.employees_onsite)) names.add(n);
    return [...names];
  }, [log]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-10">
          <p className="text-sm text-white/50">Loading daily log…</p>
        </main>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-10">
          <Link
            href="/jobs/daily-logs"
            className="text-sm text-[#E8C84A] hover:underline"
          >
            ← Back to Daily Logs
          </Link>
          <p className="mt-6 text-white/60">Log not found.</p>
        </main>
      </div>
    );
  }

  const jobTitle = log.job_name?.trim() || "—";
  const logDate = String(log.log_date).slice(0, 10);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-8 md:py-10">
        <Link
          href="/jobs/daily-logs"
          className="text-sm font-medium text-[#E8C84A] hover:underline"
        >
          ← Back to Daily Logs
        </Link>

        <header className="mt-6 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/45">
              Daily log
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">{logDate}</h1>
            <p className="mt-2 text-lg text-[#E8C84A]">
              {log.job_id ? (
                <Link href={`/jobs/${log.job_id}`} className="hover:underline">
                  {jobTitle}
                </Link>
              ) : (
                jobTitle
              )}
            </p>
          </div>
          <div className="shrink-0 sm:pt-1">
            <DailyLogPdfActions
              logId={log.id}
              logDate={log.log_date}
              pdfStoragePath={log.pdf_storage_path ?? null}
              prominentExport
              onPdfSaved={() => void load()}
            />
          </div>
        </header>

        <section
          aria-labelledby="summary-heading"
          className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
        >
          <h2
            id="summary-heading"
            className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90"
          >
            Summary
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-white/45">Check-in</dt>
              <dd className="font-mono text-white/90">
                {log.check_in?.trim() || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Check-out</dt>
              <dd className="font-mono text-white/90">
                {log.check_out?.trim() || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Hours</dt>
              <dd className="text-[#E8C84A]">
                {grossHours != null
                  ? netHours != null
                    ? `${grossHours}h gross · ${netHours}h net (after lunch)`
                    : `${grossHours}h`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Job status</dt>
              <dd className="text-white/90">{log.job_status?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-white/45">Weather</dt>
              <dd className="text-white/90">{log.weather?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-white/45">Lunch (minutes)</dt>
              <dd className="text-white/90">
                {log.lunch_duration_minutes != null
                  ? String(log.lunch_duration_minutes)
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {(log.notes?.trim() || log.additional_notes?.trim()) && (
          <section
            aria-labelledby="notes-heading"
            className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <h2
              id="notes-heading"
              className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90"
            >
              Notes
            </h2>
            {log.notes?.trim() ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-white/80">
                {log.notes}
              </p>
            ) : null}
            {log.additional_notes?.trim() ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-white/80">
                {log.additional_notes}
              </p>
            ) : null}
          </section>
        )}

        {crewMembers.length > 0 ? (
          <section
            aria-labelledby="crew-heading"
            className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <h2
              id="crew-heading"
              className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90"
            >
              Crew on site
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {crewMembers.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0a1628]/80 px-3 py-2"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8C84A]/25 text-xs font-bold text-[#E8C84A]"
                    aria-hidden
                  >
                    {crewAvatarInitials(name)}
                  </span>
                  <span className="text-sm text-white/90">{name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {photos.length > 0 ? (
          <section
            aria-labelledby="photos-heading"
            className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <h2
              id="photos-heading"
              className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90"
            >
              Photos
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map(({ row, url }) => (
                <a
                  key={row.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block overflow-hidden rounded-lg border border-white/10 bg-black/20"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={row.caption || row.original_name || "Log photo"}
                    className="aspect-square w-full object-cover transition group-hover:opacity-90"
                  />
                  {row.caption?.trim() ? (
                    <p className="line-clamp-2 p-2 text-[11px] text-white/60">
                      {row.caption}
                    </p>
                  ) : null}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {materialsUsed.length > 0 ? (
          <section
            aria-labelledby="mat-used-heading"
            className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <h2
              id="mat-used-heading"
              className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90"
            >
              Materials used
            </h2>
            <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-left text-sm text-white/85">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.05]">
                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-white/55">
                      Item
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materialsUsed.map((m, i) => (
                    <tr
                      key={`${i}-${m}`}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="p-3">{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {materialsNeeded.length > 0 ? (
          <section
            aria-labelledby="mat-needed-heading"
            className="mt-8 rounded-xl border border-amber-500/25 bg-amber-950/15 p-5"
          >
            <h2
              id="mat-needed-heading"
              className="text-xs font-bold uppercase tracking-wide text-amber-200/90"
            >
              Materials needed
            </h2>
            <div className="mt-4 overflow-x-auto rounded-lg border border-amber-500/20">
              <table className="min-w-full text-left text-sm text-amber-50/90">
                <thead>
                  <tr className="border-b border-amber-500/20 bg-amber-950/40">
                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                      Item
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materialsNeeded.map((m, i) => (
                    <tr
                      key={`${i}-${m}`}
                      className="border-b border-amber-500/10 last:border-0"
                    >
                      <td className="p-3">{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {log.trades_onsite?.trim() ||
        log.visitors_onsite?.trim() ||
        log.work_completed?.trim() ||
        log.next_day_plan?.trim() ? (
          <section
            aria-labelledby="more-heading"
            className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <h2
              id="more-heading"
              className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90"
            >
              Additional details
            </h2>
            <dl className="mt-4 space-y-4 text-sm">
              {log.trades_onsite?.trim() ? (
                <div>
                  <dt className="text-white/45">Trades on site</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-white/80">
                    {log.trades_onsite}
                  </dd>
                </div>
              ) : null}
              {log.visitors_onsite?.trim() ? (
                <div>
                  <dt className="text-white/45">Visitors</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-white/80">
                    {log.visitors_onsite}
                  </dd>
                </div>
              ) : null}
              {log.work_completed?.trim() ? (
                <div>
                  <dt className="text-white/45">Work completed</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-white/80">
                    {log.work_completed}
                  </dd>
                </div>
              ) : null}
              {log.next_day_plan?.trim() ? (
                <div>
                  <dt className="text-white/45">Next day plan</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-white/80">
                    {log.next_day_plan}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}
      </main>
    </div>
  );
}
