"use client";

import { useState } from "react";

type Props = {
  logId: string;
  logDate: string;
  pdfStoragePath?: string | null;
  /** Smaller controls for dense tables / cards */
  compact?: boolean;
  onPdfSaved?: () => void;
};

export function DailyLogPdfActions({
  logId,
  logDate,
  pdfStoragePath,
  compact,
  onPdfSaved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const hasPdf = Boolean(pdfStoragePath?.trim());

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/daily-logs/${encodeURIComponent(logId)}/pdf`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error || `Could not save PDF (${res.status})`);
      }
      onPdfSaved?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "PDF save failed.");
    } finally {
      setBusy(false);
    }
  };

  const viewHref = `/api/daily-logs/${encodeURIComponent(logId)}/pdf?view=1`;
  const downloadHref = `/api/daily-logs/${encodeURIComponent(logId)}/pdf?download=1`;

  const btn =
    "rounded-md border border-white/20 px-2 py-1 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-50";
  const link =
    "rounded-md border border-[#E8C84A]/40 px-2 py-1 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10";
  const primary =
    "rounded-md bg-[#E8C84A]/90 px-2 py-1 text-xs font-semibold text-[#0a1628] hover:bg-[#f0d56e] disabled:opacity-50";

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-1.5"
          : "flex flex-wrap items-center gap-2"
      }
    >
      {hasPdf ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95"
          title={`Stored: ${pdfStoragePath}`}
        >
          PDF
        </span>
      ) : null}
      {hasPdf ? (
        <a
          href={viewHref}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          View
        </a>
      ) : null}
      {hasPdf ? (
        <a href={downloadHref} className={btn}>
          Download
        </a>
      ) : null}
      <button
        type="button"
        title={`Daily log ${logDate}`}
        disabled={busy}
        onClick={() => void generate()}
        className={hasPdf ? btn : primary}
      >
        {busy ? "Working…" : hasPdf ? "Regenerate" : "Save PDF"}
      </button>
    </div>
  );
}
