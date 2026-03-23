"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  isElectricalSymbolRow,
  type ProjectSymbolRow,
} from "@/lib/project-symbol-types";

const RESCAN_FLASH_MS = 10000;
const IMG_BOX_PX = 80;
const HOVER_PREVIEW_PX = 200;

function formatCategory(c: string): string {
  return c.replace(/_/g, " ");
}

function confidenceLabel(confidence: number): string {
  const n = Number(confidence);
  if (!Number.isFinite(n)) return "—";
  if (n >= 0 && n <= 1) return `${Math.round(n * 100)}%`;
  return `${Math.round(n)}%`;
}

function CategoryGlyph({ category }: { category: string }) {
  const k = category.toLowerCase();
  const cls = "h-9 w-9 text-white/45";
  if (/(light|fixture|lamp|led|ceiling)/.test(k)) {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <circle cx="12" cy="8" r="3.5" />
        <path
          strokeLinecap="round"
          d="M12 11.5v3M9.5 17h5M10 20h4"
        />
      </svg>
    );
  }
  if (/(outlet|receptacle|socket|duplex)/.test(k)) {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <rect x="6" y="5" width="12" height="14" rx="2" />
        <circle cx="10" cy="11" r="1.1" fill="currentColor" />
        <circle cx="14" cy="11" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (/(switch|dimmer)/.test(k)) {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <rect x="8" y="4" width="8" height="16" rx="1.5" />
        <path strokeLinecap="round" d="M12 8v5" />
      </svg>
    );
  }
  if (/(panel|board|breaker)/.test(k)) {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path strokeLinecap="round" d="M8 7h8M8 11h8M8 15h5" />
      </svg>
    );
  }
  const letter = (category.trim().charAt(0) || "?").toUpperCase();
  return (
    <span className="text-2xl font-bold tabular-nums text-white/40">
      {letter}
    </span>
  );
}

function NoteGlyph() {
  return (
    <svg
      className="h-8 w-8 text-white/40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function PlanNoteRow({
  row,
  busy,
  editing,
  editDraft,
  setEditDraft,
  patchSymbol,
  startEdit,
  cancelEdit,
  saveEdit,
}: {
  row: ProjectSymbolRow;
  busy: boolean;
  editing: boolean;
  editDraft: string;
  setEditDraft: (v: string) => void;
  patchSymbol: (
    id: string,
    payload: { symbolDescription?: string; userConfirmed?: boolean },
  ) => Promise<void>;
  startEdit: (row: ProjectSymbolRow) => void;
  cancelEdit: () => void;
  saveEdit: (id: string) => Promise<void>;
}) {
  return (
    <li className="rounded-lg border border-white/12 bg-black/25 px-3 py-2.5">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            disabled={busy}
            rows={3}
            className="w-full rounded-lg border border-sky-500/40 bg-[#0a1628] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-400/40"
            aria-label="Edit note text"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !editDraft.trim()}
              onClick={() => void saveEdit(row.id)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelEdit}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.05]">
            <NoteGlyph />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm leading-snug text-white">{row.symbol_description}</p>
            <p className="text-[11px] text-white/50">
              Page {row.source_page} · confidence {confidenceLabel(row.confidence)}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/85">
                <input
                  type="checkbox"
                  checked={row.user_confirmed}
                  disabled={busy}
                  onChange={(e) =>
                    void patchSymbol(row.id, {
                      userConfirmed: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-white/30 bg-[#0a1628] text-emerald-500 focus:ring-emerald-400/50"
                />
                Reviewed
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => startEdit(row)}
                className="text-xs font-semibold text-sky-300 hover:text-sky-200"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function SymbolLegendPanel({
  open,
  onClose,
  projectId,
  symbols,
  onSymbolUpdated,
  onSymbolsRefresh,
  onStartCapture,
  onStartCaptureFromLegend,
  onStartMatch,
  legendRescanBusy,
  onLegendRescan,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  symbols: ProjectSymbolRow[];
  onSymbolUpdated: (row: ProjectSymbolRow) => void;
  onSymbolsRefresh: (rows: ProjectSymbolRow[]) => void;
  onStartCapture: (symbolId: string) => void;
  onStartCaptureFromLegend: (symbolId: string) => void;
  onStartMatch: (symbolId: string, opts?: { allPages?: boolean }) => void;
  legendRescanBusy: boolean;
  onLegendRescan: () => Promise<number>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [rescanFlash, setRescanFlash] = useState<string | null>(null);
  const [largePreview, setLargePreview] = useState<{
    left: number;
    top: number;
    src: string;
  } | null>(null);
  const [otherNotesOpen, setOtherNotesOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditDraft("");
      setRescanFlash(null);
      setLargePreview(null);
      setOtherNotesOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!rescanFlash) return;
    const t = window.setTimeout(() => setRescanFlash(null), RESCAN_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [rescanFlash]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const patchSymbol = useCallback(
    async (
      id: string,
      payload: { symbolDescription?: string; userConfirmed?: boolean },
    ) => {
      setSavingId(id);
      try {
        const res = await fetch("/api/project-symbols", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            ...(payload.symbolDescription !== undefined
              ? { symbolDescription: payload.symbolDescription }
              : {}),
            ...(payload.userConfirmed !== undefined
              ? { userConfirmed: payload.userConfirmed }
              : {}),
          }),
        });
        const json = (await res.json()) as {
          symbol?: ProjectSymbolRow;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Update failed.");
        if (json.symbol) onSymbolUpdated(json.symbol);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setSavingId(null);
      }
    },
    [onSymbolUpdated],
  );

  const startEdit = useCallback((row: ProjectSymbolRow) => {
    setEditingId(row.id);
    setEditDraft(row.symbol_description);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const saveEdit = useCallback(
    async (id: string) => {
      const t = editDraft.trim();
      if (!t) return;
      await patchSymbol(id, { symbolDescription: t });
      setEditingId(null);
      setEditDraft("");
    },
    [editDraft, patchSymbol],
  );

  const refreshList = useCallback(async () => {
    setListRefreshing(true);
    try {
      const res = await fetch(
        `/api/project-symbols?projectId=${encodeURIComponent(projectId)}`,
      );
      const json = (await res.json()) as {
        symbols?: ProjectSymbolRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load symbols.");
      onSymbolsRefresh(json.symbols ?? []);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setListRefreshing(false);
    }
  }, [projectId, onSymbolsRefresh]);

  const handleRescanLegend = useCallback(async () => {
    if (
      !window.confirm(
        "Re-scan will replace all current legend symbols. Continue?",
      )
    ) {
      return;
    }
    setRescanFlash(null);
    try {
      const n = await onLegendRescan();
      setRescanFlash(
        `Legend re-scanned — ${n} symbol${n === 1 ? "" : "s"} found`,
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Re-scan failed.");
    }
  }, [onLegendRescan]);

  const showImageHoverPreview = useCallback(
    (e: ReactMouseEvent<HTMLElement>, imgB64: string) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const pad = 10;
      const w = HOVER_PREVIEW_PX;
      let left = r.right + pad;
      if (left + w > window.innerWidth - 12) {
        left = r.left - w - pad;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = r.top + (r.height - w) / 2;
      top = Math.max(8, Math.min(top, window.innerHeight - w - 8));
      setLargePreview({
        left,
        top,
        src: `data:image/png;base64,${imgB64}`,
      });
    },
    [],
  );

  const symbolRows = useMemo(
    () => symbols.filter(isElectricalSymbolRow),
    [symbols],
  );
  const electricalNotes = useMemo(
    () => symbols.filter((r) => r.note_category === "electrical_note"),
    [symbols],
  );
  const generalNotes = useMemo(
    () => symbols.filter((r) => r.note_category === "general_note"),
    [symbols],
  );
  const otherTradeNotes = useMemo(
    () => symbols.filter((r) => r.note_category === "other_trade_note"),
    [symbols],
  );

  if (!open) return null;

  const hoverPortal =
    largePreview && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[300] rounded-xl border border-white/25 bg-white p-2 shadow-2xl"
            style={{
              left: largePreview.left,
              top: largePreview.top,
              width: HOVER_PREVIEW_PX,
              height: HOVER_PREVIEW_PX,
            }}
            aria-hidden
          >
            <img
              src={largePreview.src}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-[210] flex justify-end bg-black/55 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {hoverPortal}
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-white/15 bg-[#071422] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-legend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
          <h2
            id="symbol-legend-title"
            className="text-lg font-semibold text-white"
          >
            Symbol legend
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleRescanLegend()}
              disabled={legendRescanBusy}
              className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-950/55 disabled:opacity-50"
            >
              {legendRescanBusy ? "Re-scanning…" : "Re-scan legend"}
            </button>
            <button
              type="button"
              onClick={() => void refreshList()}
              disabled={listRefreshing}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50"
            >
              {listRefreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/15"
            >
              Close
            </button>
          </div>
        </div>
        {rescanFlash ? (
          <div className="shrink-0 border-b border-emerald-500/35 bg-emerald-950/40 px-4 py-2 text-center text-sm text-emerald-100">
            {rescanFlash}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {symbols.length === 0 ? (
            <p className="text-sm text-white/60">
              No electrical legend or plan notes stored for this project.
            </p>
          ) : (
            <div className="space-y-8">
              {symbolRows.length > 0 ? (
                <section>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-white/55">
                    Electrical symbols
                  </h3>
                  <ul className="space-y-5">
                    {symbolRows.map((row) => {
                const busy = savingId === row.id;
                const editing = editingId === row.id;
                const img = row.symbol_image_base64?.trim();
                const canMatch = row.user_confirmed && !busy;
                const capturePage = row.capture_page ?? row.source_page;
                const cardTint = row.user_confirmed
                  ? "border-emerald-500/35 bg-emerald-950/[0.22]"
                  : "border-amber-500/35 bg-amber-950/[0.18]";
                return (
                  <li
                    key={row.id}
                    className={[
                      "rounded-2xl border p-4 shadow-sm",
                      cardTint,
                    ].join(" ")}
                  >
                    {editing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          disabled={busy}
                          rows={3}
                          className="w-full rounded-lg border border-sky-500/40 bg-[#0a1628] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-400/40"
                          aria-label="Edit symbol description"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy || !editDraft.trim()}
                            onClick={() => void saveEdit(row.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={cancelEdit}
                            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-4">
                          <div className="flex shrink-0 flex-col items-center">
                            {img ? (
                              <button
                                type="button"
                                disabled={busy}
                                title="Click to recapture from legend"
                                onClick={() => onStartCaptureFromLegend(row.id)}
                                onMouseEnter={(e) =>
                                  showImageHoverPreview(e, img)
                                }
                                onMouseLeave={() => setLargePreview(null)}
                                className="rounded-lg border border-white/25 bg-white p-1 shadow-inner outline-none ring-offset-2 ring-offset-[#071422] hover:ring-2 hover:ring-cyan-400/50 disabled:opacity-45"
                                style={{
                                  width: IMG_BOX_PX,
                                  height: IMG_BOX_PX,
                                }}
                              >
                                <img
                                  src={`data:image/png;base64,${img}`}
                                  alt=""
                                  className="h-full w-full object-contain"
                                />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                title="Capture from legend"
                                onClick={() => onStartCaptureFromLegend(row.id)}
                                className="flex items-center justify-center rounded-lg border-2 border-dashed border-white/35 bg-white/[0.04] outline-none ring-offset-2 ring-offset-[#071422] hover:border-cyan-400/55 hover:bg-white/[0.07] disabled:opacity-45"
                                style={{
                                  width: IMG_BOX_PX,
                                  height: IMG_BOX_PX,
                                }}
                              >
                                <CategoryGlyph category={row.symbol_category} />
                              </button>
                            )}
                            <p className="mt-1.5 max-w-[5.5rem] text-center text-[10px] leading-tight text-white/55">
                              {img ? (
                                <>Captured from page {capturePage}</>
                              ) : (
                                <>No image — tap Capture</>
                              )}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-semibold leading-snug text-white">
                              {row.symbol_description}
                            </p>
                            <p className="text-xs text-white/75">
                              Category: {formatCategory(row.symbol_category)}
                            </p>
                            <p className="text-xs tabular-nums text-white/65">
                              Confidence: {confidenceLabel(row.confidence)}
                            </p>
                            <p className="text-xs text-white/65">
                              Source: Page {row.source_page}
                            </p>
                            {typeof row.match_count === "number" &&
                            row.match_count > 0 ? (
                              <p className="text-xs tabular-nums text-sky-200/90">
                                Matched: {row.match_count}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/85">
                                <input
                                  type="checkbox"
                                  checked={row.user_confirmed}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void patchSymbol(row.id, {
                                      userConfirmed: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 rounded border-white/30 bg-[#0a1628] text-emerald-500 focus:ring-emerald-400/50"
                                />
                                {row.user_confirmed ? "Confirmed" : "Confirm"}
                              </label>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startEdit(row)}
                                className="text-xs font-semibold text-sky-300 hover:text-sky-200"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onStartCaptureFromLegend(row.id)}
                            className="w-full rounded-lg border border-cyan-500/50 bg-cyan-950/45 px-3 py-2.5 text-left text-sm font-semibold text-cyan-50 hover:bg-cyan-950/60"
                          >
                            Capture from legend
                          </button>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!canMatch}
                              title={
                                !row.user_confirmed
                                  ? "Confirm this symbol first"
                                  : undefined
                              }
                              onClick={() => onStartMatch(row.id)}
                              className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-indigo-500/45 bg-indigo-950/40 px-3 py-2 text-center text-xs font-semibold text-indigo-100 hover:bg-indigo-950/55 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Find on plans
                            </button>
                            <button
                              type="button"
                              disabled={!canMatch}
                              title={
                                !row.user_confirmed
                                  ? "Confirm this symbol first"
                                  : undefined
                              }
                              onClick={() =>
                                onStartMatch(row.id, { allPages: true })
                              }
                              className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-violet-500/45 bg-violet-950/40 px-3 py-2 text-center text-xs font-semibold text-violet-100 hover:bg-violet-950/55 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Find all pages
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onStartCapture(row.id)}
                            className="w-full rounded-lg border border-sky-500/45 bg-sky-950/40 px-3 py-2.5 text-left text-sm font-semibold text-sky-100 hover:bg-sky-950/55"
                          >
                            Capture from plans
                          </button>
                          {canMatch && !img ? (
                            <p className="text-[11px] leading-snug text-amber-100/90">
                              No reference image — matching uses the description
                              only. Capture for visual assist.
                            </p>
                          ) : null}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
                  </ul>
                </section>
              ) : null}

              {electricalNotes.length > 0 ? (
                <section className="rounded-xl border border-emerald-500/45 bg-emerald-950/30 p-4 ring-1 ring-emerald-500/20">
                  <h3 className="mb-3 text-sm font-semibold text-emerald-100">
                    Electrical notes
                  </h3>
                  <ul className="space-y-3">
                    {electricalNotes.map((row) => (
                      <PlanNoteRow
                        key={row.id}
                        row={row}
                        busy={savingId === row.id}
                        editing={editingId === row.id}
                        editDraft={editDraft}
                        setEditDraft={setEditDraft}
                        patchSymbol={patchSymbol}
                        startEdit={startEdit}
                        cancelEdit={cancelEdit}
                        saveEdit={saveEdit}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {generalNotes.length > 0 ? (
                <section className="rounded-xl border border-sky-500/45 bg-sky-950/30 p-4 ring-1 ring-sky-500/20">
                  <h3 className="mb-3 text-sm font-semibold text-sky-100">
                    General notes
                  </h3>
                  <ul className="space-y-3">
                    {generalNotes.map((row) => (
                      <PlanNoteRow
                        key={row.id}
                        row={row}
                        busy={savingId === row.id}
                        editing={editingId === row.id}
                        editDraft={editDraft}
                        setEditDraft={setEditDraft}
                        patchSymbol={patchSymbol}
                        startEdit={startEdit}
                        cancelEdit={cancelEdit}
                        saveEdit={saveEdit}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {otherTradeNotes.length > 0 ? (
                <section className="rounded-xl border border-white/20 bg-white/[0.04] p-4">
                  <button
                    type="button"
                    onClick={() => setOtherNotesOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg text-left hover:bg-white/[0.04]"
                  >
                    <span className="text-sm font-semibold text-white/80">
                      Other trade notes
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-white/50">
                      {otherTradeNotes.length} item
                      {otherTradeNotes.length === 1 ? "" : "s"} ·{" "}
                      {otherNotesOpen ? "▼" : "▶"}
                    </span>
                  </button>
                  {otherNotesOpen ? (
                    <ul className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      {otherTradeNotes.map((row) => (
                        <PlanNoteRow
                          key={row.id}
                          row={row}
                          busy={savingId === row.id}
                          editing={editingId === row.id}
                          editDraft={editDraft}
                          setEditDraft={setEditDraft}
                          patchSymbol={patchSymbol}
                          startEdit={startEdit}
                          cancelEdit={cancelEdit}
                          saveEdit={saveEdit}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
