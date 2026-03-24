"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  loadPdfDocumentFromArrayBuffer,
  readPdfFileAsArrayBuffer,
  WIFI_PDF_LOAD_ERROR,
} from "@/lib/wifi-blueprint-preview";
import { capturePdfPageBase64FromArrayBuffer } from "@/lib/tool-floor-plan-pdf-capture";
import type { FloorPlanScanApiResponse } from "@/lib/tool-floor-plan-scan";

export type ToolBlueprintScanTool = "wifi" | "av" | "smarthome";

export type ToolBlueprintFloorPlanPanelProps = {
  tool: ToolBlueprintScanTool;
  onApplyScan: (result: FloorPlanScanApiResponse, mode: "append" | "replace") => void;
  /** When set, file upload UI is hidden; uses parent PDF state (Wi‑Fi analyzer). */
  embedded?: {
    pdfArrayBuffer: ArrayBuffer;
    selectedPage: number;
    pdfPageCount: number;
    previewDataUrl: string | null;
  };
  title?: ReactNode;
};

function pdfFailureMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : WIFI_PDF_LOAD_ERROR;
  return msg.includes("Invalid PDF") || msg.includes("password")
    ? msg
    : WIFI_PDF_LOAD_ERROR;
}

export function ToolBlueprintFloorPlanPanel({
  tool,
  onApplyScan,
  embedded,
  title = "Floor plan PDF & AI room scan",
}: ToolBlueprintFloorPlanPanelProps) {
  const [localBuffer, setLocalBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [pending, setPending] = useState<FloorPlanScanApiResponse | null>(null);
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);
  const [lastNotes, setLastNotes] = useState("");

  const buf = embedded?.pdfArrayBuffer ?? localBuffer;
  const activePage = embedded?.selectedPage ?? page;
  const maxPages = embedded?.pdfPageCount ?? pageCount;
  const previewUrl = embedded?.previewDataUrl ?? localPreview;

  const onPdfFile = async (file: File | undefined) => {
    if (!file) return;
    const ok = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!ok) return;
    setPdfBusy(true);
    setPdfErr(null);
    try {
      const b = await readPdfFileAsArrayBuffer(file);
      setLocalBuffer(b);
      const doc = await loadPdfDocumentFromArrayBuffer(b);
      const n = doc.numPages;
      setPageCount(n);
      setPage(1);
      const maxThumb = Math.min(n, 12);
      const t: string[] = [];
      for (let i = 1; i <= maxThumb; i++) {
        t.push(await doc.renderPageToDataUrl(i, 140));
      }
      setThumbs(t);
    } catch (e) {
      setPdfErr(pdfFailureMessage(e));
      setLocalBuffer(null);
      setPageCount(0);
      setThumbs([]);
      setLocalPreview(null);
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    if (embedded || !localBuffer || page < 1) return;
    let c = false;
    void (async () => {
      try {
        const doc = await loadPdfDocumentFromArrayBuffer(localBuffer);
        try {
          const url = await doc.renderPageToDataUrl(page, 880);
          if (!c) setLocalPreview(url);
        } finally {
          doc.destroy();
        }
      } catch {
        if (!c) setLocalPreview(null);
      }
    })();
    return () => {
      c = true;
    };
  }, [embedded, localBuffer, page]);

  const clearLocal = () => {
    setLocalBuffer(null);
    setPageCount(0);
    setThumbs([]);
    setPage(1);
    setLocalPreview(null);
    setPdfErr(null);
    setPending(null);
    setLastSuggestions([]);
    setLastNotes("");
  };

  const runScan = useCallback(async () => {
    if (!buf || activePage < 1) return;
    setScanBusy(true);
    setScanErr(null);
    setPending(null);
    try {
      const cap = await capturePdfPageBase64FromArrayBuffer(buf, activePage);
      const res = await fetch("/api/tools/scan-floor-plan-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: cap.base64,
          imageMediaType: cap.mediaType,
          tool,
        }),
      });
      const json = (await res.json()) as FloorPlanScanApiResponse & {
        error?: string;
        raw?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Scan failed.");
      }
      setPending({
        rooms: json.rooms ?? [],
        equipment_placement_suggestions:
          json.equipment_placement_suggestions ?? [],
        scan_notes: json.scan_notes ?? "",
      });
      setLastSuggestions(json.equipment_placement_suggestions ?? []);
      setLastNotes(json.scan_notes ?? "");
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanBusy(false);
    }
  }, [buf, activePage, tool]);

  if (!embedded && !localBuffer) {
    return (
      <section className="space-y-4 rounded-xl border border-[#E8C84A]/25 bg-[#071422]/60 p-4">
        <h3 className="border-l-4 border-[#E8C84A] pl-3 text-sm font-bold uppercase tracking-wide text-white/90">
          {title}
        </h3>
        <p className="text-xs text-white/55">
          Upload a floor-plan PDF. AI reads the selected page, proposes rooms
          with approximate size and floor, and suggests equipment placement.
          You can replace or append to your manual room list and edit any row
          afterward.
        </p>
        {pdfErr ? (
          <p className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-sm text-red-200">
            {pdfErr}
          </p>
        ) : null}
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E8C84A]/40 bg-[#0a1628]/60 px-4 py-8 text-center transition hover:border-[#E8C84A]/70"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void onPdfFile(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={pdfBusy}
            onChange={(e) => void onPdfFile(e.target.files?.[0])}
          />
          <span className="text-sm font-semibold text-[#E8C84A]">
            Upload floor plan PDF
          </span>
          <span className="mt-1 text-xs text-white/50">PDF only · stays in browser</span>
        </label>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-[#E8C84A]/25 bg-[#071422]/60 p-4">
      <h3 className="border-l-4 border-[#E8C84A] pl-3 text-sm font-bold uppercase tracking-wide text-white/90">
        {embedded ? "AI room scan (reference page)" : title}
      </h3>
      <p className="text-xs text-white/55">
        {embedded
          ? `Scans page ${activePage} of ${maxPages}. Use thumbnails above to change the page, then scan again if needed.`
          : "Select a page, then run AI scan. Merge results into your room list below."}
      </p>

      {!embedded ? (
        <>
          {pdfErr ? (
            <p className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-sm text-red-200">
              {pdfErr}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {thumbs.map((src, idx) => {
              const p = idx + 1;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`overflow-hidden rounded border-2 ${
                    page === p ? "border-[#E8C84A]" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Page ${p}`}
                    className="h-16 w-auto max-w-[64px] object-cover"
                  />
                </button>
              );
            })}
          </div>
          {pageCount > thumbs.length ? (
            <label className="block text-xs text-white/60">
              Page # (1–{pageCount})
              <input
                type="number"
                min={1}
                max={pageCount}
                value={page}
                onChange={(e) =>
                  setPage(
                    Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="ml-2 w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-white"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={clearLocal}
            className="text-xs font-medium text-red-300/90 hover:text-red-200"
          >
            Remove PDF from this panel
          </button>
        </>
      ) : null}

      {previewUrl ? (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
          <p className="border-b border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#E8C84A]/90">
            Reference — page {activePage}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Floor plan page ${activePage}`}
            className="max-h-72 w-full object-contain object-top"
          />
        </div>
      ) : (
        <p className="text-xs text-amber-200/80">
          Preview not ready — wait for rendering or re-upload the PDF.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={scanBusy || !buf}
          onClick={() => void runScan()}
          className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-40"
        >
          {scanBusy ? "Scanning…" : "Scan page with AI"}
        </button>
      </div>
      {scanErr ? (
        <p className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-sm text-red-200">
          {scanErr}
        </p>
      ) : null}

      {pending && pending.rooms.length > 0 ? (
        <div className="rounded-lg border border-sky-500/35 bg-sky-950/25 px-3 py-3 text-sm">
          <p className="font-semibold text-sky-100">
            Found {pending.rooms.length} room{pending.rooms.length === 1 ? "" : "s"}
          </p>
          {pending.scan_notes ? (
            <p className="mt-2 text-xs text-white/65">{pending.scan_notes}</p>
          ) : null}
          {pending.equipment_placement_suggestions.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#E8C84A]/90">
                Equipment ideas
              </p>
              <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto text-xs text-white/70">
                {pending.equipment_placement_suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="mt-2 max-h-36 list-inside list-disc overflow-y-auto text-xs text-white/75">
            {pending.rooms.map((r) => (
              <li key={`${r.room_name}-${r.floor}-${r.confidence}`}>
                {r.room_name}
                {r.floor != null ? ` · fl ${r.floor}` : ""}
                {r.length_ft != null && r.width_ft != null
                  ? ` · ~${r.length_ft}×${r.width_ft} ft`
                  : r.sq_ft != null
                    ? ` · ~${r.sq_ft} sq ft`
                    : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              onClick={() => {
                onApplyScan(pending, "replace");
                setPending(null);
              }}
            >
              Replace room list
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              onClick={() => {
                onApplyScan(pending, "append");
                setPending(null);
              }}
            >
              Append to rooms
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
              onClick={() => setPending(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {pending && pending.rooms.length === 0 ? (
        <p className="text-sm text-amber-200/90">
          No rooms met the confidence threshold. Try another page or add rooms
          manually.
        </p>
      ) : null}

      {(lastSuggestions.length > 0 || lastNotes) && !pending ? (
        <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
          {lastNotes ? (
            <p className="text-xs text-white/70">
              <span className="font-semibold text-emerald-200/90">Scan notes: </span>
              {lastNotes}
            </p>
          ) : null}
          {lastSuggestions.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#E8C84A]/90">
                Equipment placement ideas
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs text-white/75">
                {lastSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
