"use client";

import { useState } from "react";
import { useAppToast } from "@/components/toast-provider";

type Props = {
  logId: string;
  logDate: string;
  pdfStoragePath?: string | null;
  /** Smaller controls for dense tables / cards */
  compact?: boolean;
  /** Larger primary actions for list rows and headers */
  prominentExport?: boolean;
  onPdfSaved?: () => void;
};

export function DailyLogPdfActions({
  logId,
  logDate,
  pdfStoragePath,
  compact,
  prominentExport,
  onPdfSaved,
}: Props) {
  const { showToast } = useAppToast();
  const [busy, setBusy] = useState(false);
  const hasPdf = Boolean(pdfStoragePath?.trim());

  const inlinePdfUrl = `/api/daily-logs/${encodeURIComponent(logId)}/pdf`;
  const downloadPdfUrl = `/api/daily-logs/${encodeURIComponent(logId)}/pdf?download=1`;

  const generatePdf = async () => {
    setBusy(true);
    try {
      const res = await fetch(inlinePdfUrl, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error || `Could not generate PDF (${res.status})`);
      }
      onPdfSaved?.();
      showToast({ message: "PDF generated and saved.", variant: "success" });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "PDF generation failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const heroClass =
    prominentExport && !compact
      ? "w-full rounded-xl bg-[#E8C84A] px-5 py-3.5 text-center text-sm font-bold text-[#0a1628] shadow-lg shadow-black/25 hover:bg-[#f0d56e] disabled:opacity-50 sm:w-auto"
      : prominentExport
        ? "rounded-lg bg-[#E8C84A] px-4 py-2.5 text-xs font-bold text-[#0a1628] shadow hover:bg-[#f0d56e] disabled:opacity-50"
        : "rounded-md border border-sky-400/40 px-2 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-500/15 disabled:opacity-50";

  const secondaryClass =
    compact
      ? "rounded-md border border-white/20 px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-white/10"
      : "rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10";

  const linkDownloadClass =
    compact
      ? "inline-flex items-center justify-center rounded-md border border-white/20 px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-white/10"
      : "inline-flex items-center justify-center rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10";

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-1.5"
          : prominentExport
            ? "flex w-full max-w-xs flex-col gap-2"
            : "flex flex-wrap items-center gap-2"
      }
    >
      {hasPdf ? (
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95"
          title={`Stored: ${pdfStoragePath}`}
        >
          PDF ready
        </span>
      ) : null}

      {!hasPdf ? (
        <button
          type="button"
          title={`Generate and save PDF (${logDate})`}
          disabled={busy}
          onClick={() => void generatePdf()}
          className={heroClass}
        >
          {busy ? "Generating…" : "Generate PDF"}
        </button>
      ) : (
        <>
          <button
            type="button"
            title={`Export PDF (${logDate})`}
            className={heroClass}
            onClick={() =>
              window.open(inlinePdfUrl, "_blank", "noopener,noreferrer")
            }
          >
            Export PDF
          </button>
          <div
            className={
              compact
                ? "flex flex-wrap items-center gap-1.5"
                : "flex flex-wrap items-center gap-2"
            }
          >
            <button
              type="button"
              title="Open PDF in a new tab"
              className={secondaryClass}
              onClick={() =>
                window.open(inlinePdfUrl, "_blank", "noopener,noreferrer")
              }
            >
              View PDF
            </button>
            <a
              href={downloadPdfUrl}
              className={linkDownloadClass}
              title="Download PDF file"
            >
              Download PDF
            </a>
          </div>
        </>
      )}
    </div>
  );
}
