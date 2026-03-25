"use client";

import Link from "next/link";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { DetectedRoomRow } from "@/lib/detected-room-types";
import {
  getPdfjs,
  type PDFDocumentProxy,
  type RenderTask,
} from "@/lib/pdfjs-worker";
import { renderPdfPageToPngBase64 } from "@/lib/pdf-page-image";
import {
  isElectricalSymbolRow,
  type ProjectSymbolRow,
} from "@/lib/project-symbol-types";
import { fetchBlueprintSignedUrl } from "@/lib/fetch-blueprint-signed-url";
import {
  getManualDotAppearance,
  getManualDotStyle,
  getManualItemKind,
  manualKindPluralLabel,
  type ManualDotAppearance,
} from "@/lib/manual-count-style";
import {
  electricalItemsForManualRoom,
  isItemUnassignedForPage,
  itemMatchesDetectedRoom,
  roomHueIndexForManualDots,
} from "@/lib/room-item-match";
import {
  symbolMatchTip,
  symbolMatchZoomPercent,
} from "@/lib/symbol-match-tips";
import {
  capturePdfLegendClickPngBase64,
  normBbox60Centered,
} from "@/lib/symbol-legend-capture";
import {
  AnalysisResultsPanel,
  mergeById,
} from "./analysis-results-panel";
import { formatAutoScanName } from "@/lib/saved-scan-format";
import type { SavedScanRow } from "@/lib/saved-scan-types";
import { parseScanItems, parseScanRooms } from "@/lib/saved-scan-types";
import {
  clusterSavedScansIntoSessions,
  formatRecallSessionDate,
  mergeSessionItemsAndRooms,
  recallScanStorageKey,
  recallThumbMaps,
  type SavedScanSession,
} from "@/lib/saved-scan-sessions";
import { ScanHistoryPanel } from "./scan-history-panel";
import { SymbolLegendPanel } from "./symbol-legend-panel";
import { TakeoffExportDialog } from "./takeoff-export-dialog";
import { ScanModeDialog } from "./scan-mode-dialog";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { ProjectRoomScanDialog } from "@/components/project-room-scan-dialog";
import {
  formatRoomScanBannerDate,
  projectRoomScanRowToResponse,
  summarizeScanRow,
  type ProjectRoomScanListItem,
  type ProjectRoomScanRow,
} from "@/lib/project-room-scans";
import type { FloorPlanScanApiResponse } from "@/lib/tool-floor-plan-scan";
import {
  ScanProgressOverlay,
  type ScanProgressPageRow,
} from "./scan-progress-overlay";
import {
  formatUsd,
  scanModeById,
  totalCostPerPage,
  type ScanModeId,
} from "@/lib/scan-modes";
import {
  downloadPageSummaryCsv,
  openPageSummaryPdfReport,
  renderPageThumbDataUrl,
  type PageSummaryExportRow,
  type PageThumbScanStatusExport,
} from "@/lib/page-summary-export";
import { runTakeoffExport, type TakeoffExportInclude } from "@/lib/scan-export";

type PageThumbScanStatus = "ok" | "warn" | "error" | "spin" | "wait";

const DEFAULT_TAKEOFF_INCLUDE: TakeoffExportInclude = {
  aiCounts: true,
  manualCounts: true,
  finalCounts: true,
  confidence: true,
  planNotes: true,
  summaryTotals: true,
  lowConfidenceFlagged: false,
};

const RESUME_STORAGE_KEY = "blueprint-scan-resume-v1";

const LS_VIEWER_THUMB = "blueprint-viewer-thumb-sidebar-v1";
const LS_VIEWER_RESULTS = "blueprint-viewer-results-sidebar-v1";
const THUMB_SIDEBAR = { min: 180, max: 400, def: 220 } as const;
const RESULTS_SIDEBAR = { min: 280, max: 600, def: 380 } as const;

type ResumePayload = {
  projectId: string;
  nextPage: number;
  totalPages: number;
  mode: ScanModeId;
};

/**
 * Maps 0–100 intra-page progress into this page's slice of a batch run.
 * Percent is based only on pages from batchStartPage through totalPages (resume-safe).
 */
function batchSlotProgressPct(
  intra0to100: number,
  batchStartPage: number,
  totalPages: number,
  currentPage: number,
): number {
  const remaining = Math.max(1, totalPages - batchStartPage + 1);
  const pageOffset = Math.max(0, currentPage - batchStartPage);
  const base = (pageOffset / remaining) * 100;
  const span = 100 / remaining;
  return Math.min(99, Math.round(base + (intra0to100 / 100) * span));
}

type ProjectRow = {
  id: string;
  project_name: string | null;
  sheet_count: number | null;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
};

type SheetRow = {
  id: string;
  project_id: string;
  sheet_name: string;
  file_url: string;
  file_size: number;
  page_count: number | null;
  sheet_order: number;
  created_at: string;
};

function globalPageToLocal(
  globalPage: number,
  docs: PDFDocumentProxy[],
): { doc: PDFDocumentProxy; localPage: number } | null {
  if (!docs.length || globalPage < 1) return null;
  let remaining = globalPage;
  for (const doc of docs) {
    const n = doc.numPages;
    if (remaining <= n) return { doc, localPage: remaining };
    remaining -= n;
  }
  return null;
}

type ManualDot = {
  id: string;
  nx: number;
  ny: number;
  itemId: string;
  sequence: number;
  /** Room context when the dot was placed (hue family). */
  countingRoomId: string | "UNASSIGNED";
};

type ManualAction =
  | { kind: "dot"; itemId: string; dotId: string }
  | { kind: "delta"; itemId: string; delta: number };

type SymbolMatchDot = { id: string; nx: number; ny: number; n: number };

type SymbolCaptureState = {
  symbolId: string;
  symbolDescription: string;
  mode: "rectangle" | "legend_click";
  phase: "select" | "review";
  dragStartNorm: { nx: number; ny: number } | null;
  rectNorm: { nx: number; ny: number; nw: number; nh: number } | null;
  draftBase64: string | null;
  pointerNorm: { nx: number; ny: number } | null;
};

type SymbolMatchState = {
  symbolId: string;
  symbolDescription: string;
  category: string;
  dots: SymbolMatchDot[];
  allPages: boolean;
  pagesSavedThisSession: number;
};

function cropCanvasToPngBase64(
  canvas: HTMLCanvasElement,
  nx: number,
  ny: number,
  nw: number,
  nh: number,
): string {
  const x = Math.floor(nx * canvas.width);
  const y = Math.floor(ny * canvas.height);
  const w = Math.max(1, Math.floor(nw * canvas.width));
  const h = Math.max(1, Math.floor(nh * canvas.height));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return out.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

function normRectFromDrag(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  minNw: number,
  minNh: number,
): { nx: number; ny: number; nw: number; nh: number } {
  let nx = Math.min(ax, bx);
  let ny = Math.min(ay, by);
  let nw = Math.max(Math.abs(bx - ax), minNw);
  let nh = Math.max(Math.abs(by - ay), minNh);
  nx = Math.max(0, Math.min(nx, 1 - nw));
  ny = Math.max(0, Math.min(ny, 1 - nh));
  return { nx, ny, nw, nh };
}

function dotTextColorForFill(fill: string): string {
  const light = new Set([
    "#eab308",
    "#f97316",
    "#38bdf8",
    "#f8fafc",
    "#ec4899",
  ]);
  return light.has(fill.toLowerCase()) ? "#0f172a" : "#ffffff";
}

function ManualCountDotVisual({
  appearance,
  sequence,
  sizeClass = "h-4 w-4",
  hideSequence = false,
}: {
  appearance: ManualDotAppearance;
  sequence: number;
  sizeClass?: string;
  /** Toolbar preview: show shape only, no placement index. */
  hideSequence?: boolean;
}) {
  const { fill, stroke, glyph, variant } = appearance;
  const base = `pointer-events-none flex ${sizeClass} shrink-0 items-center justify-center rounded-full shadow-md`;
  if (variant === "filled") {
    return (
      <span
        className={base}
        style={{
          backgroundColor: fill,
          border: `1px solid ${stroke}`,
        }}
        aria-hidden
      >
        {!hideSequence ? (
          <span
            className="text-[6px] font-black tabular-nums leading-none drop-shadow-[0_0_2px_rgba(0,0,0,0.85)]"
            style={{ color: dotTextColorForFill(fill) }}
          >
            {sequence}
          </span>
        ) : null}
      </span>
    );
  }
  if (variant === "ring_x") {
    return (
      <span
        className={`${base} relative`}
        style={{
          border: `2px solid ${stroke}`,
          background: "transparent",
        }}
        aria-hidden
      >
        <span
          className="text-[9px] font-black leading-none drop-shadow-[0_0_2px_rgba(0,0,0,0.75)]"
          style={{ color: stroke }}
        >
          ×
        </span>
        {!hideSequence ? (
          <span className="absolute bottom-0 right-0 translate-x-0.5 translate-y-0.5 text-[5px] font-black tabular-nums text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
            {sequence}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={`${base} relative`}
      style={{
        border: `2px solid ${stroke}`,
        backgroundColor: `${fill}44`,
      }}
      aria-hidden
    >
      <span
        className="text-[7px] font-black leading-none drop-shadow-[0_0_2px_rgba(0,0,0,0.65)]"
        style={{ color: stroke }}
      >
        {glyph}
      </span>
      {!hideSequence ? (
        <span className="absolute bottom-0 right-0 translate-x-0.5 translate-y-0.5 text-[5px] font-black tabular-nums text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
          {sequence}
        </span>
      ) : null}
    </span>
  );
}

function projectDisplayName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").trim() || fileName;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const MAIN_BASE_SCALE = 1.35;
/** Legend click-capture: ~200% viewer zoom before picking */
const LEGEND_CAPTURE_PAGE_ZOOM = 2;
/** Circular cursor guide diameter (px) while picking a legend symbol */
const LEGEND_CURSOR_RING_PX = 40;
/** ~50% larger thumbnails for page recognition */
const THUMB_SCALE = 0.27;
/** Slightly lower res for batched legend upload to reduce POST size. */
const LEGEND_PAGE_RENDER = { targetLongEdgeCssPx: 2200 } as const;

function thumbStatusGlyph(s: PageThumbScanStatus | undefined): string {
  switch (s) {
    case "ok":
      return "✅";
    case "warn":
      return "⚠️";
    case "error":
      return "❌";
    case "spin":
      return "🔄";
    default:
      return "○";
  }
}

function PageThumbnail({
  pdfDoc,
  pageNumber,
  globalPageLabel,
  selected,
  onSelect,
  disabled,
  scanStatus,
  thumbNote,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  /** Global page index shown under the thumb (across all sheets). */
  globalPageLabel: number;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  scanStatus?: PageThumbScanStatus;
  /** Extra line under page number (e.g. recall item count). */
  thumbNote?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const viewport = page.getViewport({ scale: THUMB_SCALE });
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* cancelled or replaced */
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, pageNumber]);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={[
        "relative shrink-0 rounded-lg border p-1 transition-colors",
        selected
          ? "border-sky-400 bg-sky-500/15 ring-1 ring-sky-400/50"
          : "border-white/15 bg-white/[0.04] hover:border-white/30",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      aria-current={selected ? "page" : undefined}
      aria-label={`Page ${globalPageLabel}`}
    >
      {scanStatus ? (
        <span
          className={[
            "pointer-events-none absolute right-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/20 bg-[#0a1628]/90 text-[11px] shadow-sm",
            scanStatus === "spin" ? "animate-pulse" : "",
          ].join(" ")}
          aria-hidden
        >
          {thumbStatusGlyph(scanStatus)}
        </span>
      ) : null}
      <canvas ref={canvasRef} className="block max-h-52 rounded-md bg-white" />
      <span className="mt-1 block text-center text-xs text-white/70">
        {globalPageLabel}
      </span>
      {thumbNote ? (
        <span className="mt-0.5 block text-center text-[10px] leading-tight text-white/50">
          {thumbNote}
        </span>
      ) : null}
    </button>
  );
}

const MainPageCanvas = forwardRef<
  HTMLCanvasElement,
  {
    pdfDoc: PDFDocumentProxy;
    pageNumber: number;
    zoom: number;
  }
>(function MainPageCanvas({ pdfDoc, pageNumber, zoom }, forwardedRef) {
  const innerRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  const setRefs = useCallback(
    (el: HTMLCanvasElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const canvas = innerRef.current;
      if (!canvas) return;

      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: MAIN_BASE_SCALE * zoom });

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* cancelled */
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, pageNumber, zoom]);

  return (
    <canvas
      ref={setRefs}
      className="max-w-full rounded-lg bg-white shadow-lg shadow-black/40"
    />
  );
});

export function ProjectViewer({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [sheets, setSheets] = useState<SheetRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);

  const [pdfDocs, setPdfDocs] = useState<PDFDocumentProxy[] | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageJumpEditing, setPageJumpEditing] = useState(false);
  const [pageJumpDraft, setPageJumpDraft] = useState("");
  const pageJumpInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(1);
  /** Last fit-width zoom (for dot sizing vs readable default) */
  const [fitWidthZoom, setFitWidthZoom] = useState(1);
  /** Scroll area, zoom/pan target, resize observer, and fullscreen element */
  const blueprintViewportRef = useRef<HTMLDivElement>(null);
  const mainPdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageBaseSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const fitWidthZoomRef = useRef(1);
  const zoomTouchedByUserRef = useRef(false);
  const panPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [viewerFs, setViewerFs] = useState(false);

  const [analysisItems, setAnalysisItems] = useState<ElectricalItemRow[]>([]);
  const [detectedRooms, setDetectedRooms] = useState<DetectedRoomRow[]>([]);
  const [analyzePhase, setAnalyzePhase] = useState<
    "idle" | "page" | "all" | "verifying"
  >("idle");
  const [analyzeAllProgress, setAnalyzeAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  /** Pages where Claude returned unusable JSON (user can retry). */
  const [pageAnalysisWarnings, setPageAnalysisWarnings] = useState<
    Record<number, string>
  >({});
  const [takeoffExportOpen, setTakeoffExportOpen] = useState(false);
  const [takeoffExportRoom, setTakeoffExportRoom] =
    useState<DetectedRoomRow | null>(null);
  const [jobLinkOpen, setJobLinkOpen] = useState(false);
  const [mobileThumbsOpen, setMobileThumbsOpen] = useState(false);
  const [mobileResultsOpen, setMobileResultsOpen] = useState(false);

  const [thumbCollapsedDesktop, setThumbCollapsedDesktop] = useState(false);
  const [thumbWidthPx, setThumbWidthPx] = useState<number>(THUMB_SIDEBAR.def);
  const [resultsCollapsedDesktop, setResultsCollapsedDesktop] = useState(false);
  const [resultsWidthPx, setResultsWidthPx] = useState<number>(
    RESULTS_SIDEBAR.def,
  );
  const thumbResizeDragRef = useRef<{ startX: number; startW: number } | null>(
    null,
  );
  const resultsResizeDragRef = useRef<{ startX: number; startW: number } | null>(
    null,
  );
  const [viewerDesktopLayout, setViewerDesktopLayout] = useState(false);

  const [scanModeDialogOpen, setScanModeDialogOpen] = useState(false);
  const [scanModeDialogTarget, setScanModeDialogTarget] = useState<
    "page" | "all" | null
  >(null);
  const scanModeDialogTargetRef = useRef<"page" | "all" | null>(null);
  const [scanProgressOpen, setScanProgressOpen] = useState(false);
  const [scanProgressVariant, setScanProgressVariant] = useState<
    "single" | "batch"
  >("single");
  const [scanProgressMode, setScanProgressMode] = useState<ScanModeId>("standard");
  const [scanProgressPct, setScanProgressPct] = useState(0);
  const [scanPhasePrimary, setScanPhasePrimary] = useState("");
  const [scanPhaseSecondary, setScanPhaseSecondary] = useState<string | null>(
    null,
  );
  const [scanPageRows, setScanPageRows] = useState<ScanProgressPageRow[]>([]);
  const [scanCostSoFar, setScanCostSoFar] = useState(0);
  const [scanSessionEstimate, setScanSessionEstimate] = useState<number | null>(
    null,
  );
  const [scanCompleteMessage, setScanCompleteMessage] = useState<string | null>(
    null,
  );
  const [scanCurrentPage, setScanCurrentPage] = useState(1);
  const [scanTotalPages, setScanTotalPages] = useState(1);
  /** First page in the current batch run (for resume messaging and progress denominator). */
  const [scanBatchStartPage, setScanBatchStartPage] = useState(1);
  /** Incremented when a scan overlay opens so the progress bar resets visually. */
  const [scanProgressSessionKey, setScanProgressSessionKey] = useState(0);
  const [pageScanErrors, setPageScanErrors] = useState<Record<number, string>>(
    {},
  );
  const [thumbByPage, setThumbByPage] = useState<
    Record<number, PageThumbScanStatus>
  >({});
  const [pageScanMeta, setPageScanMeta] = useState<
    Record<number, { at: string; modeLabel: string }>
  >({});
  const [pageSummaryExportOpen, setPageSummaryExportOpen] = useState(false);
  const [pageSummaryExportBusy, setPageSummaryExportBusy] = useState(false);
  const [resumeSnapshot, setResumeSnapshot] = useState<ResumePayload | null>(
    null,
  );
  const [projectUsageTotal, setProjectUsageTotal] = useState<number | null>(null);
  const [scanClock, setScanClock] = useState(0);

  const scanCancelRequestedRef = useRef(false);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const scanStartedAtRef = useRef<number>(0);
  const lastScanModeRef = useRef<ScanModeId>("standard");
  const batchCostAccumRef = useRef(0);

  const [manualMode, setManualMode] = useState(false);
  const [manualDots, setManualDots] = useState<ManualDot[]>([]);
  const [manualCounts, setManualCounts] = useState<Record<string, number>>({});
  const [selectedManualItemId, setSelectedManualItemId] = useState<string | null>(
    null,
  );
  const [manualActionStack, setManualActionStack] = useState<ManualAction[]>(
    [],
  );
  const [manualBanner, setManualBanner] = useState<string | null>(null);
  const [manualCountingRoomId, setManualCountingRoomId] = useState<
    string | "UNASSIGNED"
  >("UNASSIGNED");
  const [roomAssignmentView, setRoomAssignmentView] = useState(false);

  const [legendStatus, setLegendStatus] = useState<
    "idle" | "checking" | "scanning" | "ready" | "error"
  >("idle");
  const [legendMeta, setLegendMeta] = useState<{
    found: boolean;
    primaryPage: number | null;
    symbolCount: number;
    noteCount: number;
  } | null>(null);
  const [projectSymbols, setProjectSymbols] = useState<ProjectSymbolRow[]>([]);
  const [legendError, setLegendError] = useState<string | null>(null);
  const [legendPanelOpen, setLegendPanelOpen] = useState(false);
  const [legendRunId, setLegendRunId] = useState(0);
  const [legendManualRescanBusy, setLegendManualRescanBusy] = useState(false);
  const [symbolCaptureSuccessBanner, setSymbolCaptureSuccessBanner] = useState<
    string | null
  >(null);

  const [symbolCaptureState, setSymbolCaptureState] =
    useState<SymbolCaptureState | null>(null);
  const [legendCaptureBusy, setLegendCaptureBusy] = useState(false);
  const legendCaptureBusyRef = useRef(false);
  const [symbolMatchState, setSymbolMatchState] =
    useState<SymbolMatchState | null>(null);
  const [symbolMatchBanner, setSymbolMatchBanner] = useState<string | null>(
    null,
  );
  const [matchRoomDialog, setMatchRoomDialog] = useState<null | {
    kind: "done" | "savePage";
    dots: SymbolMatchDot[];
  }>(null);
  const [matchRoomMode, setMatchRoomMode] = useState<"single" | "spread">(
    "single",
  );
  const [matchSingleRoom, setMatchSingleRoom] = useState("UNASSIGNED");
  const [matchSpreadRooms, setMatchSpreadRooms] = useState<string[]>([]);
  const [savingSymbolMatch, setSavingSymbolMatch] = useState(false);
  const symbolMatchPageTrackRef = useRef<number | null>(null);
  const symbolCaptureRef = useRef<SymbolCaptureState | null>(null);
  const symbolMatchStateRef = useRef<SymbolMatchState | null>(null);
  const pendingManualVerifyItemIdRef = useRef<string | null>(null);

  const [scanHistoryOpen, setScanHistoryOpen] = useState(false);
  const [roomScanOpen, setRoomScanOpen] = useState(false);
  const [roomScanBusy, setRoomScanBusy] = useState(false);
  const [roomScanData, setRoomScanData] =
    useState<FloorPlanScanApiResponse | null>(null);
  const [roomScanHistory, setRoomScanHistory] = useState<
    ProjectRoomScanListItem[]
  >([]);
  const [roomScanAutosave, setRoomScanAutosave] = useState(true);
  const [roomScanDialogPage, setRoomScanDialogPage] = useState(1);
  const [selectedRoomScanId, setSelectedRoomScanId] = useState<string | null>(
    null,
  );
  const [roomScanSavedAtLabel, setRoomScanSavedAtLabel] = useState<
    string | null
  >(null);
  const [scanReloadToken, setScanReloadToken] = useState(0);
  const [takeoffViewMode, setTakeoffViewMode] = useState<"live" | "recall">(
    "live",
  );
  const takeoffViewModeRef = useRef<"live" | "recall">(takeoffViewMode);
  takeoffViewModeRef.current = takeoffViewMode;
  const [activeRecallSession, setActiveRecallSession] =
    useState<SavedScanSession | null>(null);
  const [recallPickerOpen, setRecallPickerOpen] = useState(false);
  const [recallPickerLoading, setRecallPickerLoading] = useState(false);
  const [recallPickerSessions, setRecallPickerSessions] = useState<
    SavedScanSession[]
  >([]);
  const [recallPickerError, setRecallPickerError] = useState<string | null>(
    null,
  );
  const [resetDialog, setResetDialog] = useState<{
    itemCount: number;
    roomCount: number;
  } | null>(null);
  const [resetScanName, setResetScanName] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetResult, setTargetResult] = useState<{
    query: string;
    items: ElectricalItemRow[];
    rooms: DetectedRoomRow[];
  } | null>(null);

  useEffect(() => {
    setLegendStatus("idle");
    setLegendMeta(null);
    setProjectSymbols([]);
    setLegendError(null);
    setLegendPanelOpen(false);
    setLegendRunId(0);
    setScanHistoryOpen(false);
    setTargetResult(null);
    setTargetDialogOpen(false);
    setResetDialog(null);
    setSymbolCaptureState(null);
    setSymbolMatchState(null);
    setSymbolMatchBanner(null);
    setMatchRoomDialog(null);
    setLegendManualRescanBusy(false);
    setSymbolCaptureSuccessBanner(null);
    setScanModeDialogOpen(false);
    setScanProgressOpen(false);
    scanProgressOpenRef.current = false;
    setScanCompleteMessage(null);
    setResumeSnapshot(null);
    setRoomScanHistory([]);
    setSelectedRoomScanId(null);
    setRoomScanSavedAtLabel(null);
    setPageScanMeta({});
    setTakeoffViewMode("live");
    setActiveRecallSession(null);
    setRecallPickerOpen(false);
    setRecallPickerSessions([]);
    setRecallPickerError(null);
    setScanReloadToken(0);
  }, [projectId]);

  const reloadRoomScanHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("project_room_scans")
        .select(
          "id, project_id, created_at, scan_page, rooms_json, equipment_suggestions_json, scan_notes, total_sqft, floor_count",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as ProjectRoomScanRow[];
      setRoomScanHistory(rows.map(summarizeScanRow));
    } catch {
      setRoomScanHistory([]);
    }
  }, [projectId]);

  useEffect(() => {
    void reloadRoomScanHistory();
  }, [reloadRoomScanHistory]);

  useEffect(() => {
    if (roomScanOpen) void reloadRoomScanHistory();
  }, [roomScanOpen, reloadRoomScanHistory]);

  const handleSelectHistoryScan = useCallback(
    (id: string) => {
      const row = roomScanHistory.find((h) => h.id === id);
      if (!row) return;
      setSelectedRoomScanId(id);
      setRoomScanData(projectRoomScanRowToResponse(row));
      setRoomScanDialogPage(row.scan_page);
      setRoomScanAutosave(false);
      setRoomScanSavedAtLabel(formatRoomScanBannerDate(row.created_at));
    },
    [roomScanHistory],
  );

  const openLatestSavedRoomScan = useCallback(() => {
    const row = roomScanHistory[0];
    if (!row) return;
    handleSelectHistoryScan(row.id);
    setRoomScanOpen(true);
  }, [roomScanHistory, handleSelectHistoryScan]);

  const manualCountsRef = useRef(manualCounts);
  manualCountsRef.current = manualCounts;
  const manualActionStackRef = useRef<ManualAction[]>([]);
  manualActionStackRef.current = manualActionStack;
  const manualCountingRoomIdRef = useRef(manualCountingRoomId);
  manualCountingRoomIdRef.current = manualCountingRoomId;

  const analyzeBusy =
    analyzePhase !== "idle" || scanProgressOpen || scanModeDialogOpen;

  useEffect(() => {
    if (!scanProgressOpen || scanCompleteMessage) return;
    const id = window.setInterval(() => setScanClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, [scanProgressOpen, scanCompleteMessage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `/api/api-usage?projectId=${encodeURIComponent(projectId)}`,
        );
        const j = (await r.json()) as { totalCost?: number };
        if (
          !cancelled &&
          typeof j.totalCost === "number" &&
          Number.isFinite(j.totalCost)
        ) {
          setProjectUsageTotal(j.totalCost);
        }
      } catch {
        /* table may not exist yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, scanReloadToken]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_STORAGE_KEY);
      if (!raw) {
        setResumeSnapshot(null);
        return;
      }
      const x = JSON.parse(raw) as ResumePayload;
      if (x.projectId === projectId && x.nextPage <= x.totalPages) {
        setResumeSnapshot(x);
      } else {
        setResumeSnapshot(null);
      }
    } catch {
      setResumeSnapshot(null);
    }
  }, [projectId]);

  useEffect(() => {
    if (takeoffViewMode === "recall") return;
    if (scanProgressOpen) return;
    if (analyzePhase !== "idle") return;
    if (numPages < 1) return;
    setThumbByPage((prev) => {
      const next: Record<number, PageThumbScanStatus> = { ...prev };
      for (let p = 1; p <= numPages; p++) {
        if (pageAnalysisWarnings[p]) next[p] = "warn";
        else if (pageScanErrors[p]) next[p] = "error";
        else if (analysisItems.some((i) => i.page_number === p))
          next[p] = "ok";
        else next[p] = "wait";
      }
      return next;
    });
  }, [
    takeoffViewMode,
    scanProgressOpen,
    analyzePhase,
    numPages,
    analysisItems,
    pageAnalysisWarnings,
    pageScanErrors,
  ]);

  const legendBusy =
    legendStatus === "checking" ||
    legendStatus === "scanning" ||
    legendManualRescanBusy;

  const blockPageNav = useMemo(
    () =>
      analyzeBusy ||
      manualMode ||
      legendBusy ||
      symbolCaptureState !== null ||
      scanProgressOpen,
    [
      analyzeBusy,
      manualMode,
      legendBusy,
      symbolCaptureState,
      scanProgressOpen,
    ],
  );

  const onProjectSymbolUpdated = useCallback((row: ProjectSymbolRow) => {
    setProjectSymbols((prev) => prev.map((x) => (x.id === row.id ? row : x)));
  }, []);

  const pageItemsForManual = useMemo(
    () => analysisItems.filter((i) => i.page_number === currentPage),
    [analysisItems, currentPage],
  );

  const pageRoomsForManual = useMemo(() => {
    return detectedRooms
      .filter((r) => r.page_number === currentPage)
      .slice()
      .sort((a, b) => a.room_name.localeCompare(b.room_name));
  }, [detectedRooms, currentPage]);

  const legendRoomNameOptions = useMemo(() => {
    const names = [
      ...new Set(
        detectedRooms
          .map((r) => r.room_name)
          .filter((n): n is string => Boolean(n?.trim())),
      ),
    ];
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [detectedRooms]);

  const pageCountableItems = useMemo(
    () =>
      pageItemsForManual.filter((i) => !getManualDotStyle(i).skipDot),
    [pageItemsForManual],
  );

  const manualToolbarItems = useMemo(() => {
    if (!manualMode) return pageCountableItems;
    return electricalItemsForManualRoom(
      pageItemsForManual,
      manualCountingRoomId,
      pageRoomsForManual,
    ).filter((i) => !getManualDotStyle(i).skipDot);
  }, [
    manualMode,
    pageCountableItems,
    pageItemsForManual,
    manualCountingRoomId,
    pageRoomsForManual,
  ]);

  const manualRunningSummary = useMemo(() => {
    if (!manualMode) return "";
    const roomLabel =
      manualCountingRoomId === "UNASSIGNED"
        ? "UNASSIGNED"
        : pageRoomsForManual.find((r) => r.id === manualCountingRoomId)
            ?.room_name ?? "Room";
    const inRoom = electricalItemsForManualRoom(
      pageItemsForManual,
      manualCountingRoomId,
      pageRoomsForManual,
    );
    const byKind = new Map<
      ReturnType<typeof getManualItemKind>,
      number
    >();
    for (const it of inRoom) {
      if (getManualDotStyle(it).skipDot) continue;
      const q = Math.round(Number(manualCounts[it.id] ?? 0));
      if (q <= 0) continue;
      const k = getManualItemKind(it);
      byKind.set(k, (byKind.get(k) ?? 0) + q);
    }
    if (byKind.size === 0) return `${roomLabel}: nothing counted yet`;
    const parts = Array.from(byKind.entries()).map(
      ([k, n]) => `${n} ${manualKindPluralLabel(k)}`,
    );
    return `${roomLabel}: ${parts.join(", ")} counted`;
  }, [
    manualMode,
    manualCountingRoomId,
    pageRoomsForManual,
    pageItemsForManual,
    manualCounts,
  ]);

  const analysisItemsRef = useRef(analysisItems);
  analysisItemsRef.current = analysisItems;

  useEffect(() => {
    setManualDots([]);
    setManualBanner(null);
    setManualMode(false);
    setManualCounts({});
    setSelectedManualItemId(null);
    setManualActionStack([]);
    setManualCountingRoomId("UNASSIGNED");
    setRoomAssignmentView(false);
  }, [currentPage]);

  const enterManualVerifyForItem = useCallback(
    (item: ElectricalItemRow) => {
      if (symbolCaptureState || symbolMatchState) {
        window.alert(
          "Exit symbol capture or match mode before manual verify.",
        );
        return;
      }
      if (getManualDotStyle(item).skipDot) {
        window.alert("Plan notes are not counted on the blueprint.");
        return;
      }
      if (!pageCountableItems.some((i) => i.id === item.id)) {
        window.alert("This item cannot be manually counted on the blueprint.");
        return;
      }
      let roomId: string | "UNASSIGNED" = "UNASSIGNED";
      for (const r of pageRoomsForManual) {
        if (
          itemMatchesDetectedRoom(item, r) &&
          !isItemUnassignedForPage(item, pageRoomsForManual)
        ) {
          roomId = r.id;
          break;
        }
      }
      if (!manualMode) {
        const zeros = Object.fromEntries(
          pageItemsForManual.map((i) => [i.id, 0]),
        );
        setManualCounts(zeros);
        setManualDots([]);
        setManualActionStack([]);
        setManualCountingRoomId(roomId);
        setRoomAssignmentView(false);
        setManualMode(true);
      } else {
        setManualCountingRoomId(roomId);
      }
      setSelectedManualItemId(item.id);
      setManualBanner(`Click the blueprint to count: ${item.description}`);
      zoomTouchedByUserRef.current = true;
      const fw = fitWidthZoomRef.current;
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(z, fw * 1.35, 1.45)));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const sc = blueprintViewportRef.current;
          if (sc) {
            sc.scrollLeft = Math.max(
              0,
              (sc.scrollWidth - sc.clientWidth) / 2,
            );
            sc.scrollTop = Math.max(
              0,
              (sc.scrollHeight - sc.clientHeight) / 2,
            );
          }
        });
      });
    },
    [
      manualMode,
      pageCountableItems,
      pageItemsForManual,
      pageRoomsForManual,
      symbolCaptureState,
      symbolMatchState,
    ],
  );

  const onRequestItemVerify = useCallback(
    (item: ElectricalItemRow) => {
      if (item.page_number !== currentPage) {
        pendingManualVerifyItemIdRef.current = item.id;
        setCurrentPage(item.page_number);
        return;
      }
      enterManualVerifyForItem(item);
    },
    [currentPage, enterManualVerifyForItem],
  );

  useEffect(() => {
    const id = pendingManualVerifyItemIdRef.current;
    if (!id) return;
    pendingManualVerifyItemIdRef.current = null;
    const item = analysisItems.find(
      (i) => i.id === id && i.page_number === currentPage,
    );
    if (item) enterManualVerifyForItem(item);
  }, [currentPage, analysisItems, enterManualVerifyForItem]);

  useEffect(() => {
    if (!manualMode) return;
    if (
      selectedManualItemId &&
      manualToolbarItems.some((i) => i.id === selectedManualItemId)
    ) {
      return;
    }
    setSelectedManualItemId(manualToolbarItems[0]?.id ?? null);
  }, [manualMode, manualCountingRoomId, manualToolbarItems, selectedManualItemId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recallKey = recallScanStorageKey(projectId);
      const recallId =
        typeof window !== "undefined" ? localStorage.getItem(recallKey) : null;
      let scansPayload: SavedScanRow[] = [];
      try {
        const scanRes = await fetch(
          `/api/saved-scans?projectId=${encodeURIComponent(projectId)}`,
        );
        const sj = (await scanRes.json()) as {
          scans?: SavedScanRow[];
          error?: string;
        };
        if (scanRes.ok) {
          scansPayload = sj.scans ?? [];
        }
      } catch {
        scansPayload = [];
      }
      try {
        const supabase = createBrowserClient();
        const [itemsRes, roomsRes] = await Promise.all([
          supabase
            .from("electrical_items")
            .select("*")
            .eq("project_id", projectId)
            .order("page_number", { ascending: true }),
          supabase
            .from("detected_rooms")
            .select("*")
            .eq("project_id", projectId)
            .order("page_number", { ascending: true }),
        ]);
        if (cancelled) return;
        if (recallId && scansPayload.length > 0) {
          const sessions = clusterSavedScansIntoSessions(scansPayload);
          const session = sessions.find((s) => s.id === recallId);
          if (session) {
            const { items, rooms } = mergeSessionItemsAndRooms(session.rows);
            setAnalysisItems(items);
            setDetectedRooms(rooms);
            setTakeoffViewMode("recall");
            setActiveRecallSession(session);
            return;
          }
          localStorage.removeItem(recallKey);
        }
        if (itemsRes.data) {
          setAnalysisItems(itemsRes.data as ElectricalItemRow[]);
        }
        if (roomsRes.data) {
          setDetectedRooms(roomsRes.data as DetectedRoomRow[]);
        }
        setTakeoffViewMode("live");
        setActiveRecallSession(null);
      } catch {
        if (!cancelled) {
          setTakeoffViewMode("live");
          setActiveRecallSession(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (scanReloadToken === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createBrowserClient();
        const [itemsRes, roomsRes] = await Promise.all([
          supabase
            .from("electrical_items")
            .select("*")
            .eq("project_id", projectId)
            .order("page_number", { ascending: true }),
          supabase
            .from("detected_rooms")
            .select("*")
            .eq("project_id", projectId)
            .order("page_number", { ascending: true }),
        ]);
        if (cancelled) return;
        if (takeoffViewModeRef.current === "recall") {
          localStorage.removeItem(recallScanStorageKey(projectId));
          setTakeoffViewMode("live");
          setActiveRecallSession(null);
        }
        if (itemsRes.data) {
          setAnalysisItems(itemsRes.data as ElectricalItemRow[]);
        }
        if (roomsRes.data) {
          setDetectedRooms(roomsRes.data as DetectedRoomRow[]);
        }
      } catch {
        /* RLS or missing table */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, scanReloadToken]);

  const pdfDocsRef = useRef<PDFDocumentProxy[] | null>(null);
  const currentPageRef = useRef(currentPage);
  const zoomRef = useRef(zoom);
  const numPagesRef = useRef(numPages);
  const analyzePhaseRef = useRef(analyzePhase);

  pdfDocsRef.current = pdfDocs;
  currentPageRef.current = currentPage;
  zoomRef.current = zoom;
  numPagesRef.current = numPages;
  analyzePhaseRef.current = analyzePhase;

  useEffect(() => {
    let cancelled = false;
    setProjectLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data, error } = await supabase
          .from("projects")
          .select(
            "id, project_name, sheet_count, file_name, file_url, file_size, created_at",
          )
          .eq("id", projectId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          setProject(null);
          setSheets([]);
          return;
        }
        if (!data) {
          setLoadError("notfound");
          setProject(null);
          setSheets([]);
          return;
        }
        const { data: sheetRows } = await supabase
          .from("sheets")
          .select(
            "id, project_id, sheet_name, file_url, file_size, page_count, sheet_order, created_at",
          )
          .eq("project_id", projectId)
          .order("sheet_order", { ascending: true });

        if (!cancelled) {
          setProject(data as ProjectRow);
          setSheets((sheetRows ?? []) as SheetRow[]);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load project.",
          );
          setProject(null);
          setSheets([]);
        }
      } finally {
        if (!cancelled) setProjectLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const pdfSourceKey = useMemo(() => {
    if (!project) return "";
    if (sheets.length > 0) {
      return sheets.map((s) => s.file_url).join("\0");
    }
    return project.file_url ?? "";
  }, [project, sheets]);

  useEffect(() => {
    if (!project) return;

    const storedPaths =
      sheets.length > 0
        ? sheets.map((s) => s.file_url).filter(Boolean)
        : project.file_url
          ? [project.file_url]
          : [];

    if (storedPaths.length === 0) {
      setPdfLoading(false);
      setPdfError("No PDF files are linked to this project.");
      setPdfDocs(null);
      setNumPages(0);
      return;
    }

    let cancelled = false;
    const loadedDocs: PDFDocumentProxy[] = [];
    const loadingTasks: import("pdfjs-dist").PDFDocumentLoadingTask[] = [];

    setPdfLoading(true);
    setPdfError(null);
    setPdfDocs(null);
    setNumPages(0);
    setCurrentPage(1);

    let reloadBusy = false;

    const reload = async () => {
      if (reloadBusy) return;
      reloadBusy = true;
      try {
        const signedUrls = await Promise.all(
          storedPaths.map((p) => fetchBlueprintSignedUrl(p)),
        );
        if (cancelled) return;

        for (const t of loadingTasks) {
          void t.destroy();
        }
        loadingTasks.length = 0;
        for (const d of loadedDocs) {
          void d.destroy();
        }
        loadedDocs.length = 0;

        const pdfjs = await getPdfjs();
        const docs: PDFDocumentProxy[] = [];
        for (const url of signedUrls) {
          const loadingTask = pdfjs.getDocument({
            url,
            withCredentials: false,
          });
          loadingTasks.push(loadingTask);
          const pdf = await loadingTask.promise;
          if (cancelled) {
            void pdf.destroy();
            return;
          }
          docs.push(pdf);
        }
        loadedDocs.push(...docs);
        const total = docs.reduce((sum, d) => sum + d.numPages, 0);
        setPdfDocs(docs);
        setNumPages(total);
        setPdfLoading(false);
        setPdfError(null);

        const supabase = createBrowserClient();
        for (let i = 0; i < sheets.length && i < docs.length; i++) {
          const row = sheets[i];
          const d = docs[i];
          if (!row || !d) continue;
          const n = d.numPages;
          if (row.page_count !== n) {
            void supabase
              .from("sheets")
              .update({ page_count: n })
              .eq("id", row.id);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setPdfError(
          e instanceof Error
            ? e.message
            : "Could not open this PDF. Check that the file is available and try again.",
        );
        setPdfLoading(false);
      } finally {
        reloadBusy = false;
      }
    };

    void reload();
    const interval = window.setInterval(() => {
      void reload();
    }, 55 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      for (const t of loadingTasks) {
        void t.destroy();
      }
      for (const d of loadedDocs) {
        void d.destroy();
      }
    };
  }, [project, pdfSourceKey, sheets]);

  useEffect(() => {
    if (!pdfDocs?.length || numPages < 1 || pdfLoading) return;
    let cancelled = false;

    void (async () => {
      setLegendStatus("checking");
      setLegendError(null);
      try {
        const symRes = await fetch(
          `/api/project-symbols?projectId=${encodeURIComponent(projectId)}`,
        );
        const symJson = (await symRes.json()) as {
          symbols?: ProjectSymbolRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!symRes.ok) {
          throw new Error(symJson.error ?? "Could not load legend symbols.");
        }
        const existing = symJson.symbols ?? [];

        if (existing.length > 0) {
          setProjectSymbols(existing);
          const primary = Math.min(...existing.map((r) => r.source_page));
          const sym = existing.filter(isElectricalSymbolRow).length;
          setLegendMeta({
            found: true,
            primaryPage: primary,
            symbolCount: sym,
            noteCount: existing.length - sym,
          });
          setLegendStatus("ready");
          return;
        }

        setLegendStatus("scanning");
        const pageImages: string[] = [];
        for (let p = 1; p <= numPages; p++) {
          const mapped = globalPageToLocal(p, pdfDocs);
          if (!mapped) continue;
          const { base64: b64 } = await renderPdfPageToPngBase64(
            mapped.doc,
            mapped.localPage,
            LEGEND_PAGE_RENDER,
          );
          if (cancelled) return;
          pageImages.push(b64);
        }

        const res = await fetch("/api/detect-legend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, pageImages }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          primaryLegendPage?: number | null;
          symbolCount?: number;
          noteCount?: number;
          totalRowCount?: number;
          symbols?: ProjectSymbolRow[];
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "Legend detection failed.");

        const symRes2 = await fetch(
          `/api/project-symbols?projectId=${encodeURIComponent(projectId)}`,
        );
        const symJson2 = (await symRes2.json()) as {
          symbols?: ProjectSymbolRow[];
          error?: string;
        };
        if (cancelled) return;
        const rows = (
          symRes2.ok && symJson2.symbols?.length
            ? symJson2.symbols
            : json.symbols ?? []
        ) as ProjectSymbolRow[];
        setProjectSymbols(rows);
        const sym = rows.filter(isElectricalSymbolRow).length;
        const notes = rows.length - sym;
        const found = rows.length > 0;
        const primary =
          json.primaryLegendPage ??
          (rows.length ? Math.min(...rows.map((r) => r.source_page)) : null);
        setLegendMeta({
          found,
          primaryPage: found ? primary : null,
          symbolCount: json.symbolCount ?? sym,
          noteCount: json.noteCount ?? notes,
        });
        setLegendStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setLegendError(
            e instanceof Error ? e.message : "Legend scan failed.",
          );
          setLegendStatus("error");
          setLegendMeta(null);
          setProjectSymbols([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, pdfDocs, numPages, pdfLoading, legendRunId]);

  const runLegendRescan = useCallback(async (): Promise<number> => {
    const docs = pdfDocsRef.current;
    const total = numPagesRef.current;
    if (!docs?.length || total < 1) {
      throw new Error("PDF is not ready yet.");
    }
    setSymbolCaptureState(null);
    setSymbolMatchState(null);
    setMatchRoomDialog(null);
    setSymbolMatchBanner(null);
    setSymbolCaptureSuccessBanner(null);
    setLegendManualRescanBusy(true);
    setLegendError(null);
    try {
      const pageImages: string[] = [];
      for (let p = 1; p <= total; p++) {
        const mapped = globalPageToLocal(p, docs);
        if (!mapped) continue;
        const { base64: b64 } = await renderPdfPageToPngBase64(
          mapped.doc,
          mapped.localPage,
          LEGEND_PAGE_RENDER,
        );
        pageImages.push(b64);
      }

      const res = await fetch("/api/detect-legend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, pageImages }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        primaryLegendPage?: number | null;
        symbolCount?: number;
        noteCount?: number;
        totalRowCount?: number;
        symbols?: ProjectSymbolRow[];
      };
      if (!res.ok) throw new Error(json.error ?? "Legend detection failed.");

      const symRes2 = await fetch(
        `/api/project-symbols?projectId=${encodeURIComponent(projectId)}`,
      );
      const symJson2 = (await symRes2.json()) as {
        symbols?: ProjectSymbolRow[];
        error?: string;
      };
      const rows = (
        symRes2.ok && symJson2.symbols?.length
          ? symJson2.symbols
          : json.symbols ?? []
      ) as ProjectSymbolRow[];
      setProjectSymbols(rows);
      const sym = rows.filter(isElectricalSymbolRow).length;
      const notes = rows.length - sym;
      const found = rows.length > 0;
      const primary =
        json.primaryLegendPage ??
        (rows.length ? Math.min(...rows.map((r) => r.source_page)) : null);
      setLegendMeta({
        found,
        primaryPage: found ? primary : null,
        symbolCount: json.symbolCount ?? sym,
        noteCount: json.noteCount ?? notes,
      });
      setLegendStatus("ready");
      return json.totalRowCount ?? rows.length;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Legend re-scan failed.";
      setLegendError(msg);
      setLegendStatus("error");
      setLegendMeta(null);
      setProjectSymbols([]);
      throw e;
    } finally {
      setLegendManualRescanBusy(false);
    }
  }, [projectId]);

  const currentPdfAndPage = useMemo(() => {
    if (!pdfDocs?.length || currentPage < 1) return null;
    return globalPageToLocal(currentPage, pdfDocs);
  }, [pdfDocs, currentPage]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((p) => (numPages ? Math.min(numPages, p + 1) : p));
  }, [numPages]);

  const pageJumpOptions = useMemo(() => {
    if (numPages < 1) return [];
    const docs = pdfDocs ?? [];
    const ordered = [...sheets].sort((a, b) => a.sheet_order - b.sheet_order);
    const counts = docs.map((d) => d.numPages);
    const multi = ordered.length > 1;
    const out: { value: number; label: string }[] = [];
    let g = 1;
    const maxSheets = Math.max(ordered.length, counts.length);
    for (let i = 0; i < maxSheets && g <= numPages; i++) {
      const sheetLabel =
        ordered[i]?.sheet_name?.trim() || `Sheet ${i + 1}`;
      const n = counts[i] ?? 0;
      if (n <= 0) break;
      for (let lp = 1; lp <= n && g <= numPages; lp++) {
        out.push({
          value: g,
          label: multi ? `${sheetLabel} - Page ${lp}` : `Page ${g}`,
        });
        g++;
      }
    }
    while (out.length < numPages) {
      const v = out.length + 1;
      out.push({ value: v, label: `Page ${v}` });
    }
    return out;
  }, [sheets, pdfDocs, numPages]);

  const goPrevRef = useRef(goPrev);
  const goNextRef = useRef(goNext);
  const blockPageNavRef = useRef(blockPageNav);
  goPrevRef.current = goPrev;
  goNextRef.current = goNext;
  blockPageNavRef.current = blockPageNav;

  const digitBufferRef = useRef("");
  const digitBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (numPages < 1) return;

    const clearDigitTimer = () => {
      if (digitBufferTimerRef.current) {
        clearTimeout(digitBufferTimerRef.current);
        digitBufferTimerRef.current = null;
      }
    };

    const scheduleBufferClear = () => {
      clearDigitTimer();
      digitBufferTimerRef.current = setTimeout(() => {
        digitBufferRef.current = "";
      }, 1200);
    };

    const focusIsInFormField = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (blockPageNavRef.current) return;
      if (focusIsInFormField()) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevRef.current();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNextRef.current();
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        digitBufferRef.current += e.key;
        scheduleBufferClear();
        return;
      }

      if (e.key === "Enter" && digitBufferRef.current.length > 0) {
        e.preventDefault();
        const p = parseInt(digitBufferRef.current, 10);
        digitBufferRef.current = "";
        clearDigitTimer();
        const max = numPagesRef.current;
        if (Number.isFinite(p) && max > 0 && p >= 1 && p <= max) {
          setCurrentPage(p);
        }
        return;
      }

      if (e.key === "Escape") {
        digitBufferRef.current = "";
        clearDigitTimer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearDigitTimer();
    };
  }, [numPages]);

  const zoomIn = useCallback(() => {
    zoomTouchedByUserRef.current = true;
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    zoomTouchedByUserRef.current = true;
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  }, []);

  const applyFitWidthZoom = useCallback(() => {
    const sc = blueprintViewportRef.current;
    const base = pageBaseSizeRef.current;
    if (!sc || base.w <= 0) return;
    const pad = 48;
    const availW = Math.max(80, sc.clientWidth - pad);
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, availW / base.w));
    fitWidthZoomRef.current = z;
    setFitWidthZoom(z);
    setZoom(z);
    zoomTouchedByUserRef.current = false;
  }, []);

  const applyFitPageZoom = useCallback(() => {
    const sc = blueprintViewportRef.current;
    const base = pageBaseSizeRef.current;
    if (!sc || base.w <= 0) return;
    const pad = 48;
    const availW = Math.max(80, sc.clientWidth - pad);
    const availH = Math.max(80, sc.clientHeight - pad);
    const zW = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, availW / base.w));
    const z = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, Math.min(availW / base.w, availH / base.h)),
    );
    fitWidthZoomRef.current = zW;
    setFitWidthZoom(zW);
    setZoom(z);
    zoomTouchedByUserRef.current = false;
  }, []);

  const resetZoomDefault = useCallback(() => {
    applyFitWidthZoom();
  }, [applyFitWidthZoom]);

  const toggleBlueprintFullscreen = useCallback(() => {
    const el = blueprintViewportRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFs = () => setViewerFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!currentPdfAndPage) return;
    let cancelled = false;
    (async () => {
      const page = await currentPdfAndPage.doc.getPage(
        currentPdfAndPage.localPage,
      );
      const vp = page.getViewport({ scale: MAIN_BASE_SCALE });
      if (cancelled) return;
      pageBaseSizeRef.current = { w: vp.width, h: vp.height };
      zoomTouchedByUserRef.current = false;
      requestAnimationFrame(() => {
        const sc = blueprintViewportRef.current;
        if (!sc) return;
        const pad = 48;
        const availW = Math.max(80, sc.clientWidth - pad);
        const z = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, availW / vp.width),
        );
        fitWidthZoomRef.current = z;
        setFitWidthZoom(z);
        setZoom(z);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPdfAndPage]);

  useEffect(() => {
    let ro: ResizeObserver | null = null;
    const t = window.setTimeout(() => {
      const sc = blueprintViewportRef.current;
      if (!sc) return;
      ro = new ResizeObserver(() => {
        const base = pageBaseSizeRef.current;
        if (base.w <= 0) return;
        const pad = 48;
        const availW = Math.max(80, sc.clientWidth - pad);
        const newFitW = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, availW / base.w),
        );
        fitWidthZoomRef.current = newFitW;
        setFitWidthZoom(newFitW);
        if (!zoomTouchedByUserRef.current) {
          setZoom(newFitW);
        }
      });
      ro.observe(sc);
    }, 0);
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
    };
  }, [currentPdfAndPage]);

  const runGptVerification = useCallback(
    async (
      imageBase64: string,
      imageMediaType: "image/png" | "image/jpeg",
      pageNumber: number,
      newItems: ElectricalItemRow[],
      opts?: { signal?: AbortSignal },
    ) => {
      if (newItems.length === 0) return;
      setAnalyzePhase("verifying");
      const claudeItems = newItems.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: Number(i.quantity),
      }));
      const res = await fetch("/api/verify-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pageNumber,
          imageBase64,
          imageMediaType,
          claudeItems,
        }),
        signal: opts?.signal,
      });
      const json = (await res.json()) as {
        items?: ElectricalItemRow[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "GPT verification failed.");
      }
      const updated = json.items ?? [];
      if (updated.length) {
        setAnalysisItems((prev) => mergeById(prev, updated));
      }
    },
    [projectId],
  );

  type AnalyzePageResponseJson = {
    items?: ElectricalItemRow[];
    rooms?: DetectedRoomRow[];
    error?: string;
    persisted?: boolean;
    pageAnalysisWarning?: string;
  };

  const applyAnalyzePageJson = useCallback(
    async (
      pageToAnalyze: number,
      json: AnalyzePageResponseJson,
      pageImage: { base64: string; mediaType: "image/png" | "image/jpeg" },
      opts?: {
        skipGpt?: boolean;
        signal?: AbortSignal;
        onBeforeGpt?: () => void;
        onScanProgress?: (
          pct: number,
          primary: string,
          secondary?: string | null,
        ) => void;
      },
    ) => {
      if (json.persisted === false) {
        if (json.pageAnalysisWarning) {
          setPageAnalysisWarnings((prev) => ({
            ...prev,
            [pageToAnalyze]: `Page ${pageToAnalyze} — No electrical items detected. Please verify this page manually.`,
          }));
        }
        opts?.onScanProgress?.(88, "Finishing…", null);
        return;
      }
      setPageAnalysisWarnings((prev) => {
        if (!(pageToAnalyze in prev)) return prev;
        const next = { ...prev };
        delete next[pageToAnalyze];
        return next;
      });
      const incoming = (json.items ?? []) as ElectricalItemRow[];
      const incomingRooms = (json.rooms ?? []) as DetectedRoomRow[];
      setAnalysisItems((prev) => [...incoming, ...prev]);
      setDetectedRooms((prev) => [
        ...prev.filter((r) => r.page_number !== pageToAnalyze),
        ...incomingRooms,
      ]);
      if (incoming.length > 0 && !opts?.skipGpt) {
        opts?.onScanProgress?.(73, "GPT-4o verifying counts…", null);
        opts?.onBeforeGpt?.();
        await runGptVerification(
          pageImage.base64,
          pageImage.mediaType,
          pageToAnalyze,
          incoming,
          { signal: opts?.signal },
        );
      } else if (opts?.skipGpt) {
        opts?.onScanProgress?.(82, "Saving results…", null);
      } else {
        opts?.onScanProgress?.(88, "Saving results…", null);
      }
      opts?.onScanProgress?.(95, "Saving results…", null);
      setScanReloadToken((t) => t + 1);
    },
    [runGptVerification],
  );

  /** api_usage is recorded server-side in /api/analyze-page; refresh project totals for the UI. */
  const refreshProjectUsageTotal = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/api-usage?projectId=${encodeURIComponent(projectId)}`,
      );
      const j = (await r.json()) as { totalCost?: number };
      if (typeof j.totalCost === "number") setProjectUsageTotal(j.totalCost);
    } catch {
      /* non-blocking */
    }
  }, [projectId]);

  const scanProgressOpenRef = useRef(false);
  useEffect(() => {
    scanProgressOpenRef.current = scanProgressOpen;
  }, [scanProgressOpen]);

  const dismissScanProgress = useCallback(() => {
    setScanProgressOpen(false);
    scanProgressOpenRef.current = false;
    setScanCompleteMessage(null);
    scanAbortControllerRef.current = null;
    scanCancelRequestedRef.current = false;
  }, []);

  const recordPageScanMeta = useCallback((page: number, mode: ScanModeId) => {
    setPageScanMeta((prev) => ({
      ...prev,
      [page]: {
        at: new Date().toISOString(),
        modeLabel: scanModeById(mode).label,
      },
    }));
  }, []);

  const runOnePageWithMode = useCallback(
    async (
      pageToAnalyze: number,
      mode: ScanModeId,
      signal: AbortSignal,
      progressCallbacks?: {
        updateThumb: (page: number, s: PageThumbScanStatus) => void;
        onProgress?: (
          pct: number,
          primary: string,
          secondary?: string | null,
        ) => void;
      },
    ): Promise<{
      itemCount: number;
      outcome: "ok" | "empty" | "warn" | "error";
      errorMessage?: string;
    }> => {
      const updateThumb =
        progressCallbacks?.updateThumb ??
        ((pg: number, s: PageThumbScanStatus) =>
          setThumbByPage((prev) => ({ ...prev, [pg]: s })));
      const onProgress = progressCallbacks?.onProgress;

      if (mode === "manual") {
        updateThumb(pageToAnalyze, "wait");
        return { itemCount: 0, outcome: "ok" };
      }

      updateThumb(pageToAnalyze, "spin");
      onProgress?.(
        0,
        "Rendering page image…",
        mode === "quick" ? null : "Then GPT-4o verifies counts…",
      );

      const docs = pdfDocsRef.current;
      if (!docs?.length) {
        updateThumb(pageToAnalyze, "error");
        return {
          itemCount: 0,
          outcome: "error",
          errorMessage: "No PDF loaded.",
        };
      }
      const mapped = globalPageToLocal(pageToAnalyze, docs);
      if (!mapped) {
        updateThumb(pageToAnalyze, "error");
        return {
          itemCount: 0,
          outcome: "error",
          errorMessage: "Could not map page.",
        };
      }

      const pageImage = await renderPdfPageToPngBase64(
        mapped.doc,
        mapped.localPage,
      );
      if (signal.aborted) {
        updateThumb(pageToAnalyze, "wait");
        return { itemCount: 0, outcome: "error", errorMessage: "Cancelled" };
      }

      onProgress?.(
        20,
        "Claude analyzing…",
        mode === "quick" ? null : "Then GPT-4o verifies counts…",
      );

      let res: Response;
      try {
        res = await fetch("/api/analyze-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            pageNumber: pageToAnalyze,
            imageBase64: pageImage.base64,
            imageMediaType: pageImage.mediaType,
            scanType: mode,
          }),
          signal,
        });
      } catch {
        updateThumb(pageToAnalyze, "wait");
        return {
          itemCount: 0,
          outcome: "error",
          errorMessage: signal.aborted ? "Cancelled" : "Network error",
        };
      }
      const json = (await res.json()) as AnalyzePageResponseJson;
      if (!res.ok) {
        updateThumb(pageToAnalyze, "error");
        return {
          itemCount: 0,
          outcome: "error",
          errorMessage: json.error ?? "Analysis failed.",
        };
      }

      onProgress?.(
        70,
        mode === "quick"
          ? "Saving results…"
          : "GPT-4o verifying counts…",
        null,
      );

      try {
        await applyAnalyzePageJson(pageToAnalyze, json, pageImage, {
          skipGpt: mode === "quick",
          signal,
          onScanProgress: onProgress,
        });
      } catch {
        updateThumb(pageToAnalyze, "wait");
        return {
          itemCount: 0,
          outcome: "error",
          errorMessage: signal.aborted ? "Cancelled" : "Verification failed",
        };
      }

      if (signal.aborted) {
        updateThumb(pageToAnalyze, "wait");
        return { itemCount: 0, outcome: "error", errorMessage: "Cancelled" };
      }

      onProgress?.(98, "Saving results…", null);
      await refreshProjectUsageTotal();
      onProgress?.(100, "Complete", null);

      const incomingCount = ((json.items ?? []) as ElectricalItemRow[]).length;
      if (json.persisted === false && json.pageAnalysisWarning) {
        updateThumb(pageToAnalyze, "warn");
        recordPageScanMeta(pageToAnalyze, mode);
        return { itemCount: incomingCount, outcome: "warn" };
      }
      updateThumb(pageToAnalyze, "ok");
      recordPageScanMeta(pageToAnalyze, mode);
      return {
        itemCount: incomingCount,
        outcome: incomingCount > 0 ? "ok" : "empty",
      };
    },
    [
      projectId,
      applyAnalyzePageJson,
      refreshProjectUsageTotal,
      recordPageScanMeta,
    ],
  );

  const lastBatchPageCompletedRef = useRef(0);

  const runSinglePageScan = useCallback(
    async (pageToAnalyze: number, mode: ScanModeId) => {
      if (
        scanProgressOpenRef.current ||
        analyzePhaseRef.current !== "idle"
      ) {
        return;
      }
      const total = numPagesRef.current;
      if (pageToAnalyze < 1 || pageToAnalyze > total) return;

      lastScanModeRef.current = mode;
      if (mode === "manual") {
        setManualMode(true);
        return;
      }

      const meta = scanModeById(mode);
      scanAbortControllerRef.current = new AbortController();
      const signal = scanAbortControllerRef.current.signal;
      scanCancelRequestedRef.current = false;
      scanStartedAtRef.current = Date.now();
      setScanProgressSessionKey((k) => k + 1);
      setScanBatchStartPage(1);
      setScanProgressVariant("single");
      setScanProgressMode(mode);
      setScanProgressOpen(true);
      scanProgressOpenRef.current = true;
      setScanCompleteMessage(null);
      setScanTotalPages(1);
      setScanCurrentPage(pageToAnalyze);
      setScanPageRows([]);
      setScanCostSoFar(0);
      setScanSessionEstimate(totalCostPerPage(meta));
      setScanProgressPct(0);
      setScanPhasePrimary("Rendering page image…");
      setScanPhaseSecondary(
        mode === "quick" ? null : "Then GPT-4o verifies counts…",
      );
      setAnalyzePhase("page");
      setAnalyzeError(null);

      try {
        const r = await runOnePageWithMode(pageToAnalyze, mode, signal, {
          updateThumb: (pg, s) =>
            setThumbByPage((prev) => ({ ...prev, [pg]: s })),
          onProgress: (pct, primary, secondary) => {
            setScanProgressPct(pct);
            setScanPhasePrimary(primary);
            setScanPhaseSecondary(secondary ?? null);
          },
        });
        if (signal.aborted || scanCancelRequestedRef.current) {
          setScanCompleteMessage("Scan cancelled.");
          setAnalyzePhase("idle");
          return;
        }
        if (r.outcome === "error" && r.errorMessage && r.errorMessage !== "Cancelled") {
          setAnalyzeError(r.errorMessage);
          dismissScanProgress();
          setAnalyzePhase("idle");
          return;
        }
        setScanProgressPct(100);
        setScanCostSoFar(totalCostPerPage(meta));
        setScanCompleteMessage(
          `This scan cost ${formatUsd(totalCostPerPage(meta))}`,
        );
      } catch (e) {
        if (!signal.aborted && !scanCancelRequestedRef.current) {
          setAnalyzeError(
            e instanceof Error ? e.message : "Analysis failed. Try again.",
          );
        }
        dismissScanProgress();
      } finally {
        setAnalyzePhase("idle");
      }
    },
    [runOnePageWithMode, dismissScanProgress],
  );

  const runBatchScan = useCallback(
    async (startPage: number, totalPages: number, mode: ScanModeId) => {
      if (
        scanProgressOpenRef.current ||
        analyzePhaseRef.current !== "idle"
      ) {
        return;
      }
      if (startPage < 1 || startPage > totalPages || totalPages < 1) return;

      lastScanModeRef.current = mode;
      if (mode === "manual") {
        setManualMode(true);
        return;
      }

      const meta = scanModeById(mode);
      scanAbortControllerRef.current = new AbortController();
      const signal = scanAbortControllerRef.current.signal;
      scanCancelRequestedRef.current = false;
      scanStartedAtRef.current = Date.now();
      lastBatchPageCompletedRef.current = Math.max(0, startPage - 1);
      batchCostAccumRef.current = 0;

      const initialRows: ScanProgressPageRow[] = Array.from(
        { length: totalPages },
        (_, i) => {
          const pg = i + 1;
          if (pg < startPage)
            return {
              page: pg,
              state: "done_ok" as const,
              itemCount: undefined,
            };
          if (pg === startPage)
            return { page: pg, state: "running" as const };
          return { page: pg, state: "waiting" as const };
        },
      );
      setScanPageRows(initialRows);
      setScanProgressSessionKey((k) => k + 1);
      setScanBatchStartPage(startPage);
      setScanProgressVariant("batch");
      setScanProgressMode(mode);
      setScanProgressOpen(true);
      scanProgressOpenRef.current = true;
      setScanCompleteMessage(null);
      setScanTotalPages(totalPages);
      setScanCurrentPage(startPage);
      const priorCost =
        Math.max(0, startPage - 1) * totalCostPerPage(meta);
      batchCostAccumRef.current = priorCost;
      setScanCostSoFar(priorCost);
      setScanSessionEstimate(totalCostPerPage(meta) * totalPages);
      setScanProgressPct(0);
      setScanPhasePrimary("Rendering page image…");
      setScanPhaseSecondary(
        mode === "quick" ? null : "Then GPT-4o verifies counts…",
      );
      setAnalyzePhase("all");
      setAnalyzeError(null);
      setPageScanErrors({});
      setAnalyzeAllProgress({ current: startPage, total: totalPages });

      const batchFailures: string[] = [];
      let cancelled = false;

      const updateRow = (page: number, patch: Partial<ScanProgressPageRow>) => {
        setScanPageRows((rows) =>
          rows.map((r) => (r.page === page ? { ...r, ...patch } : r)),
        );
      };

      try {
        for (let p = startPage; p <= totalPages; p++) {
          if (scanCancelRequestedRef.current) {
            cancelled = true;
            break;
          }
          setScanCurrentPage(p);
          setCurrentPage(p);
          setAnalyzeAllProgress({ current: p, total: totalPages });
          updateRow(p, { state: "running" });

          setScanProgressPct(
            batchSlotProgressPct(0, startPage, totalPages, p),
          );

          const r = await runOnePageWithMode(p, mode, signal, {
            updateThumb: (pg, s) =>
              setThumbByPage((prev) => ({ ...prev, [pg]: s })),
            onProgress: (intra, primary, secondary) => {
              setScanProgressPct(
                batchSlotProgressPct(intra, startPage, totalPages, p),
              );
              setScanPhasePrimary(primary);
              setScanPhaseSecondary(secondary ?? null);
            },
          });

          if (signal.aborted || scanCancelRequestedRef.current) {
            cancelled = true;
            updateRow(p, { state: "waiting" });
            break;
          }

          if (r.outcome === "error") {
            updateRow(p, {
              state: "done_error",
              itemCount: r.itemCount,
            });
            setPageScanErrors((prev) => ({
              ...prev,
              [p]: r.errorMessage ?? "Error",
            }));
            batchFailures.push(`Page ${p}: ${r.errorMessage ?? "failed"}`);
          } else {
            lastBatchPageCompletedRef.current = p;
            const rowState: ScanProgressPageRow["state"] =
              r.outcome === "warn" || r.outcome === "empty"
                ? "done_empty"
                : "done_ok";
            updateRow(p, {
              state: rowState,
              itemCount: r.itemCount,
            });
            batchCostAccumRef.current += totalCostPerPage(meta);
            setScanCostSoFar(batchCostAccumRef.current);
          }

          if (p < totalPages) {
            updateRow(p + 1, { state: "running" });
          }
        }

        if (cancelled) {
          const next = lastBatchPageCompletedRef.current + 1;
          if (next <= totalPages) {
            const payload: ResumePayload = {
              projectId,
              nextPage: next,
              totalPages,
              mode,
            };
            try {
              localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(payload));
            } catch {
              /* ignore */
            }
            setResumeSnapshot(payload);
          }
          setScanCompleteMessage(null);
          dismissScanProgress();
          setAnalyzePhase("idle");
          setAnalyzeAllProgress(null);
          return;
        }

        setScanProgressPct(100);
        setScanPhasePrimary("Finished");
        setScanPhaseSecondary(null);
        setScanCompleteMessage(
          `This scan cost ${formatUsd(batchCostAccumRef.current)}`,
        );
        try {
          localStorage.removeItem(RESUME_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setResumeSnapshot(null);

        if (mode === "deep" && batchFailures.length === 0) {
          window.setTimeout(() => {
            window.confirm(
              "Deep scan complete. Review low-confidence items in the results panel?",
            );
          }, 400);
        }

        if (batchFailures.length > 0) {
          setAnalyzeError(batchFailures.join(" · "));
        }
        setScanReloadToken((t) => t + 1);
      } catch (e) {
        setAnalyzeError(
          e instanceof Error ? e.message : "Batch analysis failed.",
        );
        dismissScanProgress();
      } finally {
        setAnalyzePhase("idle");
        setAnalyzeAllProgress(null);
      }
    },
    [projectId, runOnePageWithMode, dismissScanProgress],
  );

  const onCancelScanConfirmed = useCallback(() => {
    scanCancelRequestedRef.current = true;
    scanAbortControllerRef.current?.abort();
  }, []);

  const onScanModeChosen = useCallback(
    (mode: ScanModeId) => {
      setScanModeDialogOpen(false);
      const target = scanModeDialogTargetRef.current;
      scanModeDialogTargetRef.current = null;
      setScanModeDialogTarget(null);
      lastScanModeRef.current = mode;
      if (mode === "manual") {
        setManualMode(true);
        return;
      }
      if (target === "page") {
        void runSinglePageScan(currentPageRef.current, mode);
      } else if (target === "all") {
        try {
          localStorage.removeItem(RESUME_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setResumeSnapshot(null);
        void runBatchScan(1, numPagesRef.current, mode);
      }
    },
    [runSinglePageScan, runBatchScan],
  );

  const openScanModeForPage = useCallback(() => {
    scanModeDialogTargetRef.current = "page";
    setScanModeDialogTarget("page");
    setScanModeDialogOpen(true);
  }, []);

  const openScanModeForAll = useCallback(() => {
    scanModeDialogTargetRef.current = "all";
    setScanModeDialogTarget("all");
    setScanModeDialogOpen(true);
  }, []);

  const resumeBatchScan = useCallback(() => {
    if (!resumeSnapshot || resumeSnapshot.projectId !== projectId) return;
    setScanModeDialogOpen(false);
    void runBatchScan(
      resumeSnapshot.nextPage,
      resumeSnapshot.totalPages,
      resumeSnapshot.mode,
    );
  }, [resumeSnapshot, projectId, runBatchScan]);

  const analyzePageNumber = useCallback(
    async (pageToAnalyze: number, mode?: ScanModeId) => {
      const m = mode ?? lastScanModeRef.current;
      await runSinglePageScan(pageToAnalyze, m);
    },
    [runSinglePageScan],
  );

  const analyzeThisPage = useCallback(() => {
    openScanModeForPage();
  }, [openScanModeForPage]);

  const runRoomScanCurrentPage = useCallback(async () => {
    if (
      analyzeBusy ||
      legendBusy ||
      roomScanBusy ||
      symbolCaptureState ||
      symbolMatchState
    )
      return;
    const docs = pdfDocsRef.current;
    if (!docs?.length) {
      window.alert("No PDF loaded.");
      return;
    }
    const mapped = globalPageToLocal(currentPage, docs);
    if (!mapped) {
      window.alert("Could not map page.");
      return;
    }
    setRoomScanBusy(true);
    try {
      const pageImage = await renderPdfPageToPngBase64(
        mapped.doc,
        mapped.localPage,
      );
      const res = await fetch("/api/tools/scan-floor-plan-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: pageImage.base64,
          imageMediaType: pageImage.mediaType,
          tool: "wifi",
        }),
      });
      const json = (await res.json()) as FloorPlanScanApiResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Room scan failed");
      setRoomScanData({
        rooms: json.rooms ?? [],
        equipment_placement_suggestions:
          json.equipment_placement_suggestions ?? [],
        scan_notes: json.scan_notes ?? "",
      });
      setRoomScanDialogPage(currentPage);
      setRoomScanAutosave(true);
      setSelectedRoomScanId(null);
      setRoomScanSavedAtLabel(null);
      setRoomScanOpen(true);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Room scan failed.",
      );
    } finally {
      setRoomScanBusy(false);
    }
  }, [
    analyzeBusy,
    legendBusy,
    roomScanBusy,
    currentPage,
    symbolCaptureState,
    symbolMatchState,
  ]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      setViewerDesktopLayout(mq.matches);
      if (mq.matches) {
        setMobileThumbsOpen(false);
        setMobileResultsOpen(false);
      }
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const tw = JSON.parse(localStorage.getItem(LS_VIEWER_THUMB) || "{}");
      const rw = JSON.parse(localStorage.getItem(LS_VIEWER_RESULTS) || "{}");
      const wThumb = Math.min(
        THUMB_SIDEBAR.max,
        Math.max(THUMB_SIDEBAR.min, Number(tw.width) || THUMB_SIDEBAR.def),
      );
      const wRes = Math.min(
        RESULTS_SIDEBAR.max,
        Math.max(RESULTS_SIDEBAR.min, Number(rw.width) || RESULTS_SIDEBAR.def),
      );
      setThumbWidthPx(wThumb);
      setResultsWidthPx(wRes);
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      if (mobile) {
        setThumbCollapsedDesktop(true);
        setResultsCollapsedDesktop(true);
      } else {
        setThumbCollapsedDesktop(Boolean(tw.collapsed));
        setResultsCollapsedDesktop(Boolean(rw.collapsed));
      }
    } catch {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setThumbCollapsedDesktop(true);
        setResultsCollapsedDesktop(true);
      }
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onMq = () => {
      if (mq.matches) {
        setThumbCollapsedDesktop(true);
        setResultsCollapsedDesktop(true);
      } else {
        try {
          const tw = JSON.parse(localStorage.getItem(LS_VIEWER_THUMB) || "{}");
          const rw = JSON.parse(
            localStorage.getItem(LS_VIEWER_RESULTS) || "{}",
          );
          setThumbCollapsedDesktop(Boolean(tw.collapsed));
          setResultsCollapsedDesktop(Boolean(rw.collapsed));
        } catch {
          /* ignore */
        }
      }
    };
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    localStorage.setItem(
      LS_VIEWER_THUMB,
      JSON.stringify({ collapsed: thumbCollapsedDesktop, width: thumbWidthPx }),
    );
  }, [thumbCollapsedDesktop, thumbWidthPx]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    localStorage.setItem(
      LS_VIEWER_RESULTS,
      JSON.stringify({
        collapsed: resultsCollapsedDesktop,
        width: resultsWidthPx,
      }),
    );
  }, [resultsCollapsedDesktop, resultsWidthPx]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "[") {
        e.preventDefault();
        setThumbCollapsedDesktop((c) => !c);
      }
      if (e.key === "]") {
        e.preventDefault();
        setResultsCollapsedDesktop((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onThumbResizePointerDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      thumbResizeDragRef.current = { startX: e.clientX, startW: thumbWidthPx };
      const onMove = (ev: globalThis.MouseEvent) => {
        const d = thumbResizeDragRef.current;
        if (!d) return;
        const dx = ev.clientX - d.startX;
        const nw = Math.min(
          THUMB_SIDEBAR.max,
          Math.max(THUMB_SIDEBAR.min, d.startW + dx),
        );
        setThumbWidthPx(nw);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        thumbResizeDragRef.current = null;
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [thumbWidthPx],
  );

  const onResultsResizePointerDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      resultsResizeDragRef.current = {
        startX: e.clientX,
        startW: resultsWidthPx,
      };
      const onMove = (ev: globalThis.MouseEvent) => {
        const d = resultsResizeDragRef.current;
        if (!d) return;
        const dx = ev.clientX - d.startX;
        const nw = Math.min(
          RESULTS_SIDEBAR.max,
          Math.max(RESULTS_SIDEBAR.min, d.startW - dx),
        );
        setResultsWidthPx(nw);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        resultsResizeDragRef.current = null;
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [resultsWidthPx],
  );

  const performPageReset = useCallback(async () => {
    setAnalyzeError(null);
    const res = await fetch("/api/analysis/reset-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        pageNumber: currentPage,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Reset failed.");
    setAnalysisItems((prev) =>
      prev.filter((i) => i.page_number !== currentPage),
    );
    setDetectedRooms((prev) =>
      prev.filter((r) => r.page_number !== currentPage),
    );
    setResetDialog(null);
  }, [projectId, currentPage]);

  const openResetDialog = useCallback(() => {
    const itemsOnPage = analysisItems.filter(
      (i) => i.page_number === currentPage,
    );
    const roomsOnPage = detectedRooms.filter(
      (r) => r.page_number === currentPage,
    );
    if (itemsOnPage.length === 0 && roomsOnPage.length === 0) {
      window.alert("No analysis results on this page to reset.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/saved-scans?projectId=${encodeURIComponent(projectId)}`,
        );
        const j = (await res.json()) as { scans?: unknown[] };
        const next = (j.scans?.length ?? 0) + 1;
        setResetScanName(formatAutoScanName(next));
      } catch {
        setResetScanName(formatAutoScanName(1));
      }
      setResetDialog({
        itemCount: itemsOnPage.length,
        roomCount: roomsOnPage.length,
      });
    })();
  }, [analysisItems, detectedRooms, currentPage, projectId]);

  const saveScanAndReset = useCallback(async () => {
    if (!resetDialog) return;
    const name = resetScanName.trim();
    if (!name) {
      window.alert("Enter a scan name.");
      return;
    }
    setResetSaving(true);
    try {
      const itemsOnPage = analysisItems.filter(
        (i) => i.page_number === currentPage,
      );
      const roomsOnPage = detectedRooms.filter(
        (r) => r.page_number === currentPage,
      );
      const saveRes = await fetch("/api/saved-scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pageNumber: currentPage,
          scanName: name,
          itemsSnapshot: itemsOnPage,
          roomsSnapshot: roomsOnPage,
          totalItems: itemsOnPage.length,
          notes: null,
        }),
      });
      const sj = (await saveRes.json()) as { error?: string };
      if (!saveRes.ok) throw new Error(sj.error ?? "Save failed.");
      await performPageReset();
      setScanReloadToken((t) => t + 1);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Save and reset failed.",
      );
    } finally {
      setResetSaving(false);
    }
  }, [
    resetDialog,
    resetScanName,
    analysisItems,
    detectedRooms,
    currentPage,
    projectId,
    performPageReset,
  ]);

  const resetWithoutSaving = useCallback(async () => {
    try {
      await performPageReset();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Reset failed.");
    }
  }, [performPageReset]);

  const applyViewScan = useCallback(
    (scan: SavedScanRow) => {
      const items = parseScanItems(scan.items_snapshot);
      const rooms = parseScanRooms(scan.rooms_snapshot);
      setCurrentPage(scan.page_number);
      setAnalysisItems((prev) => [
        ...prev.filter((i) => i.page_number !== scan.page_number),
        ...items,
      ]);
      setDetectedRooms((prev) => [
        ...prev.filter((r) => r.page_number !== scan.page_number),
        ...rooms,
      ]);
      setScanHistoryOpen(false);
      localStorage.removeItem(recallScanStorageKey(projectId));
      setTakeoffViewMode("live");
      setActiveRecallSession(null);
    },
    [projectId],
  );

  const applyRecallSession = useCallback(
    (session: SavedScanSession) => {
      const { items, rooms } = mergeSessionItemsAndRooms(session.rows);
      setAnalysisItems(items);
      setDetectedRooms(rooms);
      setTakeoffViewMode("recall");
      setActiveRecallSession(session);
      localStorage.setItem(recallScanStorageKey(projectId), session.id);
      setRecallPickerOpen(false);
      const p = session.pages[0];
      if (p != null && p >= 1) setCurrentPage(p);
      setManualMode(false);
      setManualDots([]);
      setManualCounts({});
      setSelectedManualItemId(null);
      setManualActionStack([]);
      setManualCountingRoomId("UNASSIGNED");
      setMobileThumbsOpen(false);
    },
    [projectId],
  );

  const switchToLiveTakeoff = useCallback(async () => {
    localStorage.removeItem(recallScanStorageKey(projectId));
    setTakeoffViewMode("live");
    setActiveRecallSession(null);
    setManualMode(false);
    setManualDots([]);
    setManualCounts({});
    setSelectedManualItemId(null);
    setManualActionStack([]);
    setManualCountingRoomId("UNASSIGNED");
    try {
      const supabase = createBrowserClient();
      const [itemsRes, roomsRes] = await Promise.all([
        supabase
          .from("electrical_items")
          .select("*")
          .eq("project_id", projectId)
          .order("page_number", { ascending: true }),
        supabase
          .from("detected_rooms")
          .select("*")
          .eq("project_id", projectId)
          .order("page_number", { ascending: true }),
      ]);
      if (itemsRes.data) {
        setAnalysisItems(itemsRes.data as ElectricalItemRow[]);
      }
      if (roomsRes.data) {
        setDetectedRooms(roomsRes.data as DetectedRoomRow[]);
      }
    } catch {
      /* keep prior state if fetch fails */
    }
  }, [projectId]);

  const openRecallScanPicker = useCallback(async () => {
    setRecallPickerOpen(true);
    setRecallPickerLoading(true);
    setRecallPickerError(null);
    try {
      const res = await fetch(
        `/api/saved-scans?projectId=${encodeURIComponent(projectId)}`,
      );
      const j = (await res.json()) as {
        scans?: SavedScanRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Could not load saved scans.");
      const sessions = clusterSavedScansIntoSessions(j.scans ?? []);
      sessions.sort(
        (a, b) =>
          new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime(),
      );
      setRecallPickerSessions(sessions);
    } catch (e) {
      setRecallPickerError(
        e instanceof Error ? e.message : "Could not load saved scans.",
      );
      setRecallPickerSessions([]);
    } finally {
      setRecallPickerLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!recallPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecallPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recallPickerOpen]);

  const runTargetScan = useCallback(async () => {
    const q = targetQuery.trim();
    if (q.length < 2) {
      window.alert("Enter at least 2 characters.");
      return;
    }
    const docs = pdfDocsRef.current;
    const page = currentPageRef.current;
    if (!docs?.length || page < 1) return;
    const mapped = globalPageToLocal(page, docs);
    if (!mapped) return;
    setTargetLoading(true);
    try {
      const pageImage = await renderPdfPageToPngBase64(
        mapped.doc,
        mapped.localPage,
      );
      const res = await fetch("/api/analyze-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pageNumber: page,
          imageBase64: pageImage.base64,
          imageMediaType: pageImage.mediaType,
          targetQuery: q,
        }),
      });
      const json = (await res.json()) as {
        items?: ElectricalItemRow[];
        rooms?: DetectedRoomRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Target scan failed.");
      setTargetResult({
        query: q,
        items: json.items ?? [],
        rooms: json.rooms ?? [],
      });
      setTargetDialogOpen(false);
      setTargetQuery("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Target scan failed.");
    } finally {
      setTargetLoading(false);
    }
  }, [projectId, targetQuery]);

  const analyzeAllPages = useCallback(() => {
    openScanModeForAll();
  }, [openScanModeForAll]);

  const toggleManualMode = useCallback(() => {
    if (symbolCaptureState || symbolMatchState) {
      window.alert("Exit symbol capture or match mode before using manual count.");
      return;
    }
    if (manualMode) {
      const dirty =
        manualDots.length > 0 ||
        pageItemsForManual.some((i) => (manualCounts[i.id] ?? 0) > 0);
      if (
        dirty &&
        !window.confirm("Exit manual mode? Unsaved count changes will be lost.")
      ) {
        return;
      }
      setManualMode(false);
      setManualDots([]);
      setManualCounts({});
      setSelectedManualItemId(null);
      setManualActionStack([]);
      setManualCountingRoomId("UNASSIGNED");
      return;
    }
    if (pageCountableItems.length === 0) {
      window.alert(
        "Analyze this page first. Manual dots are not available for plan notes only.",
      );
      return;
    }
    let initialRoom: string | "UNASSIGNED" = "UNASSIGNED";
    for (const r of pageRoomsForManual) {
      const inRoom = electricalItemsForManualRoom(
        pageItemsForManual,
        r.id,
        pageRoomsForManual,
      ).filter((i) => !getManualDotStyle(i).skipDot);
      if (inRoom.length > 0) {
        initialRoom = r.id;
        break;
      }
    }
    const zeros = Object.fromEntries(
      pageItemsForManual.map((i) => [i.id, 0]),
    );
    setManualCounts(zeros);
    setManualCountingRoomId(initialRoom);
    const firstInRoom = electricalItemsForManualRoom(
      pageItemsForManual,
      initialRoom,
      pageRoomsForManual,
    ).filter((i) => !getManualDotStyle(i).skipDot)[0];
    setSelectedManualItemId(
      firstInRoom?.id ?? pageCountableItems[0]!.id,
    );
    setManualDots([]);
    setManualActionStack([]);
    setRoomAssignmentView(false);
    setManualMode(true);
  }, [
    manualMode,
    manualDots.length,
    pageItemsForManual,
    pageCountableItems,
    pageRoomsForManual,
    manualCounts,
    symbolCaptureState,
    symbolMatchState,
  ]);

  const manualCountDelta = useCallback((id: string, delta: number) => {
    const c = manualCountsRef.current;
    const cur = c[id] ?? 0;
    if (delta < 0 && cur <= 0) return;
    const next = Math.max(0, cur + delta);
    if (next === cur) return;
    setManualCounts({ ...c, [id]: next });
    setManualActionStack((s) => [...s, { kind: "delta", itemId: id, delta }]);
  }, []);

  const onManualLayerClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const sid = selectedManualItemId;
      if (!sid) return;
      const item = analysisItemsRef.current.find((i) => i.id === sid);
      if (item && getManualDotStyle(item).skipDot) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const dotId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const c = manualCountsRef.current;
      const cur = c[sid] ?? 0;
      setManualCounts({ ...c, [sid]: cur + 1 });
      setManualDots((prev) => {
        const sequence = prev.length + 1;
        return [
          ...prev,
          {
            id: dotId,
            nx,
            ny,
            itemId: sid,
            sequence,
            countingRoomId: manualCountingRoomIdRef.current,
          },
        ];
      });
      setManualActionStack((s) => [
        ...s,
        { kind: "dot", itemId: sid, dotId },
      ]);
    },
    [selectedManualItemId],
  );

  const undoManualAction = useCallback(() => {
    const s = manualActionStackRef.current;
    if (s.length === 0) return;
    const last = s[s.length - 1]!;
    if (last.kind === "dot") {
      setManualDots((d) => {
        const filtered = d.filter((x) => x.id !== last.dotId);
        return filtered.map((dot, i) => ({ ...dot, sequence: i + 1 }));
      });
      setManualCounts((c) => ({
        ...c,
        [last.itemId]: Math.max(0, (c[last.itemId] ?? 0) - 1),
      }));
    } else {
      setManualCounts((c) => ({
        ...c,
        [last.itemId]: Math.max(0, (c[last.itemId] ?? 0) - last.delta),
      }));
    }
    setManualActionStack(s.slice(0, -1));
  }, []);

  const resetManualItemToAi = useCallback((id: string) => {
    setManualCounts((c) => ({ ...c, [id]: 0 }));
    setManualDots((d) => {
      const filtered = d.filter((x) => x.itemId !== id);
      return filtered.map((dot, i) => ({ ...dot, sequence: i + 1 }));
    });
    setManualActionStack((s) => s.filter((a) => a.itemId !== id));
  }, []);

  const clearAllManualAdjustments = useCallback(() => {
    const dirty =
      manualDots.length > 0 ||
      pageItemsForManual.some((i) => (manualCounts[i.id] ?? 0) > 0);
    if (!dirty) return;
    if (
      !window.confirm(
        "Remove all dots and clear every manual count on this page (back to zero)?",
      )
    ) {
      return;
    }
    setManualCounts(
      Object.fromEntries(pageItemsForManual.map((i) => [i.id, 0])),
    );
    setManualDots([]);
    setManualActionStack([]);
  }, [manualDots.length, pageItemsForManual, manualCounts]);

  const saveManualCounts = useCallback(async () => {
    if (pageItemsForManual.length === 0) return;
    const byId = pageItemsForManual.map((i) => {
      const ai = Math.round(Number(i.quantity));
      const manual = Math.round(Number(manualCounts[i.id] ?? 0));
      const final_count = manual > 0 ? manual : ai;
      return { id: i.id, final_count, ai, manual };
    });
    try {
      const res = await fetch("/api/electrical-items/manual-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pageNumber: currentPage,
          byId: byId.map(({ id, final_count }) => ({ id, final_count })),
        }),
      });
      const json = (await res.json()) as {
        items?: ElectricalItemRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      const updated = json.items ?? [];
      if (updated.length) {
        setAnalysisItems((prev) => mergeById(prev, updated));
      }
      const parts = byId
        .filter(({ manual }) => manual > 0)
        .map(({ ai, manual, id }) => {
          const row = pageItemsForManual.find((x) => x.id === id);
          const d = manual - ai;
          const sign = d > 0 ? "+" : "";
          return row
            ? `${row.description}: AI ${ai} → Manual ${manual} (${sign}${d})`
            : null;
        })
        .filter(Boolean);
      const unchanged = byId.filter(({ manual }) => manual === 0).length;
      setManualBanner(
        parts.length
          ? `Saved — ${parts.join(" · ")}${unchanged ? ` · ${unchanged} line(s) kept AI count` : ""}`
          : "Saved — all lines kept AI count (no manual clicks).",
      );
      setManualMode(false);
      setManualDots([]);
      setManualCounts({});
      setSelectedManualItemId(null);
      setManualActionStack([]);
      setManualCountingRoomId("UNASSIGNED");
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not save manual counts.",
      );
    }
  }, [pageItemsForManual, manualCounts, projectId, currentPage]);

  useEffect(() => {
    if (!matchRoomDialog) return;
    setMatchRoomMode("single");
    setMatchSingleRoom("UNASSIGNED");
    setMatchSpreadRooms(matchRoomDialog.dots.map(() => "UNASSIGNED"));
  }, [matchRoomDialog]);

  useEffect(() => {
    if (!symbolMatchState) {
      symbolMatchPageTrackRef.current = null;
      return;
    }
    if (symbolMatchPageTrackRef.current === null) {
      symbolMatchPageTrackRef.current = currentPage;
      return;
    }
    if (symbolMatchPageTrackRef.current !== currentPage) {
      symbolMatchPageTrackRef.current = currentPage;
      setSymbolMatchState((s) => (s ? { ...s, dots: [] } : null));
    }
  }, [currentPage, symbolMatchState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (symbolCaptureRef.current) {
        legendCaptureBusyRef.current = false;
        setLegendCaptureBusy(false);
        setSymbolCaptureState(null);
        return;
      }
      if (symbolMatchStateRef.current) {
        if (
          symbolMatchStateRef.current.dots.length > 0 &&
          !window.confirm("Exit symbol match? Unsaved marks on this page will be lost.")
        ) {
          return;
        }
        setSymbolMatchState(null);
        setMatchRoomDialog(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startSymbolCapture = useCallback(
    (symbolId: string) => {
      if (manualMode) {
        window.alert("Exit manual count mode before capturing a symbol.");
        return;
      }
      const row = projectSymbols.find((x) => x.id === symbolId);
      if (row && !isElectricalSymbolRow(row)) {
        window.alert("Capture applies to electrical symbols only, not plan notes.");
        return;
      }
      setSymbolMatchState(null);
      setSymbolMatchBanner(null);
      setSymbolCaptureSuccessBanner(null);
      setSymbolCaptureState({
        symbolId,
        symbolDescription: row?.symbol_description ?? "symbol",
        mode: "rectangle",
        phase: "select",
        dragStartNorm: null,
        rectNorm: null,
        draftBase64: null,
        pointerNorm: null,
      });
    },
    [manualMode, projectSymbols],
  );

  const startSymbolCaptureFromLegend = useCallback(
    (symbolId: string) => {
      if (manualMode) {
        window.alert("Exit manual count mode before capturing a symbol.");
        return;
      }
      const row = projectSymbols.find((x) => x.id === symbolId);
      if (!row) return;
      if (!isElectricalSymbolRow(row)) {
        window.alert(
          "Capture from legend applies to electrical symbols only, not plan notes.",
        );
        return;
      }
      setSymbolMatchState(null);
      setSymbolMatchBanner(null);
      setSymbolCaptureSuccessBanner(null);
      legendCaptureBusyRef.current = false;
      setLegendCaptureBusy(false);
      setCurrentPage(row.source_page);
      window.setTimeout(() => {
        zoomTouchedByUserRef.current = true;
        const z = Math.min(ZOOM_MAX, Math.max(LEGEND_CAPTURE_PAGE_ZOOM, 2));
        setZoom(z);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const sc = blueprintViewportRef.current;
            if (sc) {
              sc.scrollLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
              sc.scrollTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
            }
            setSymbolCaptureState({
              symbolId: row.id,
              symbolDescription: row.symbol_description,
              mode: "legend_click",
              phase: "select",
              dragStartNorm: null,
              rectNorm: null,
              draftBase64: null,
              pointerNorm: null,
            });
          });
        });
      }, 280);
    },
    [manualMode, projectSymbols],
  );

  const cancelSymbolCapture = useCallback(() => {
    legendCaptureBusyRef.current = false;
    setLegendCaptureBusy(false);
    setSymbolCaptureState(null);
  }, []);

  const confirmSymbolCapture = useCallback(async () => {
    const s = symbolCaptureRef.current;
    if (!s || s.phase !== "review" || !s.rectNorm || !s.draftBase64) return;
    const r = s.rectNorm;
    const page = currentPageRef.current;
    try {
      const res = await fetch("/api/project-symbols", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: s.symbolId,
          symbolImageBase64: s.draftBase64,
          symbolBbox: { nx: r.nx, ny: r.ny, nw: r.nw, nh: r.nh },
          capturePage: page,
          captureXPercent: r.nx * 100,
          captureYPercent: r.ny * 100,
          captureWidthPercent: r.nw * 100,
          captureHeightPercent: r.nh * 100,
          verifiedBy: "capture",
          ...(s.mode === "legend_click" ? { userConfirmed: true } : {}),
        }),
      });
      const json = (await res.json()) as {
        symbol?: ProjectSymbolRow;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.symbol) onProjectSymbolUpdated(json.symbol);
      setSymbolCaptureState(null);
      setSymbolCaptureSuccessBanner(
        s.mode === "legend_click"
          ? "Symbol captured from the legend, saved, and marked confirmed."
          : "Symbol captured — Find on Plans is now active.",
      );
      window.setTimeout(() => setSymbolCaptureSuccessBanner(null), 8000);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not save capture.",
      );
    }
  }, [onProjectSymbolUpdated]);

  const addCaptureToLibrary = useCallback(async () => {
    const s = symbolCaptureRef.current;
    if (!s || s.phase !== "review" || !s.draftBase64) return;
    const row = projectSymbols.find((x) => x.id === s.symbolId);
    if (!row) return;
    try {
      const res = await fetch("/api/symbol-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          description: row.symbol_description,
          category: row.symbol_category,
          symbolImageBase64: s.draftBase64,
          createdFromProject: projectId,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Library save failed.");
      window.alert("Saved to company symbol library.");
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not save to library.",
      );
    }
  }, [projectSymbols, projectId]);

  const onLegendCaptureClick = useCallback(
    async (e: MouseEvent<HTMLDivElement>) => {
      const s = symbolCaptureRef.current;
      if (
        !s ||
        s.mode !== "legend_click" ||
        s.phase !== "select" ||
        legendCaptureBusyRef.current
      )
        return;
      e.stopPropagation();
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const docs = pdfDocsRef.current;
      const page = currentPageRef.current;
      const z = zoomRef.current;
      if (!docs?.length || page < 1) return;
      const mapped = globalPageToLocal(page, docs);
      if (!mapped) return;
      legendCaptureBusyRef.current = true;
      setLegendCaptureBusy(true);
      try {
        const base64 = await capturePdfLegendClickPngBase64(
          mapped.doc,
          mapped.localPage,
          z,
          MAIN_BASE_SCALE,
          nx,
          ny,
        );
        const bbox = normBbox60Centered(nx, ny, rect.width, rect.height);
        setSymbolCaptureState((cur) =>
          cur &&
          cur.mode === "legend_click" &&
          cur.symbolId === s.symbolId
            ? {
                ...cur,
                phase: "review",
                draftBase64: base64,
                rectNorm: bbox,
                pointerNorm: null,
              }
            : cur,
        );
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : "Could not capture symbol.",
        );
      } finally {
        legendCaptureBusyRef.current = false;
        setLegendCaptureBusy(false);
      }
    },
    [],
  );

  const onLegendCaptureMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const s = symbolCaptureRef.current;
      if (
        !s ||
        s.mode !== "legend_click" ||
        s.phase !== "select" ||
        legendCaptureBusyRef.current
      )
        return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      setSymbolCaptureState((cur) =>
        cur &&
        cur.mode === "legend_click" &&
        cur.phase === "select" &&
        cur.symbolId === s.symbolId
          ? { ...cur, pointerNorm: { nx, ny } }
          : cur,
      );
    },
    [],
  );

  const onLegendCaptureLeave = useCallback(() => {
    setSymbolCaptureState((cur) =>
      cur?.mode === "legend_click" && cur.phase === "select"
        ? { ...cur, pointerNorm: null }
        : cur,
    );
  }, []);

  const onCapturePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const s = symbolCaptureRef.current;
      if (!s || s.mode !== "rectangle" || s.phase !== "select") return;
      if (e.button !== 0) return;
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      e.currentTarget.setPointerCapture(e.pointerId);
      setSymbolCaptureState((cur) =>
        cur && cur.phase === "select"
          ? { ...cur, dragStartNorm: { nx, ny }, rectNorm: null }
          : cur,
      );
    },
    [],
  );

  const onCapturePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const s = symbolCaptureRef.current;
      if (
        !s ||
        s.mode !== "rectangle" ||
        s.phase !== "select" ||
        !s.dragStartNorm
      )
        return;
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const minNw = 20 / rect.width;
      const minNh = 20 / rect.height;
      const r = normRectFromDrag(
        s.dragStartNorm.nx,
        s.dragStartNorm.ny,
        nx,
        ny,
        minNw,
        minNh,
      );
      setSymbolCaptureState((cur) =>
        cur && cur.phase === "select" && cur.dragStartNorm
          ? { ...cur, rectNorm: r }
          : cur,
      );
    },
    [],
  );

  const onCapturePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const s = symbolCaptureRef.current;
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (
        !s ||
        s.mode !== "rectangle" ||
        s.phase !== "select" ||
        !s.dragStartNorm
      )
        return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const minNw = 20 / rect.width;
      const minNh = 20 / rect.height;
      const r = normRectFromDrag(
        s.dragStartNorm.nx,
        s.dragStartNorm.ny,
        nx,
        ny,
        minNw,
        minNh,
      );
      const canvas = mainPdfCanvasRef.current;
      if (!canvas || canvas.width <= 0) return;
      const b64 = cropCanvasToPngBase64(canvas, r.nx, r.ny, r.nw, r.nh);
      if (!b64) return;
      setSymbolCaptureState({
        symbolId: s.symbolId,
        symbolDescription: s.symbolDescription,
        mode: "rectangle",
        phase: "review",
        dragStartNorm: null,
        rectNorm: r,
        draftBase64: b64,
        pointerNorm: null,
      });
    },
    [],
  );

  const startSymbolMatch = useCallback(
    (symbolId: string, opts?: { allPages?: boolean }) => {
      if (manualMode) {
        window.alert("Exit manual count mode before matching symbols.");
        return;
      }
      const row = projectSymbols.find((x) => x.id === symbolId);
      if (!row) return;
      if (!isElectricalSymbolRow(row)) {
        window.alert("Find on plans applies to electrical symbols only, not plan notes.");
        return;
      }
      if (!row.user_confirmed) {
        window.alert("Confirm this symbol in the legend before matching on plans.");
        return;
      }
      setSymbolCaptureState(null);
      setSymbolMatchBanner(null);
      symbolMatchPageTrackRef.current = null;
      setSymbolMatchState({
        symbolId,
        symbolDescription: row.symbol_description,
        category: row.symbol_category,
        dots: [],
        allPages: Boolean(opts?.allPages),
        pagesSavedThisSession: 0,
      });
    },
    [manualMode, projectSymbols],
  );

  const exitSymbolMatch = useCallback(() => {
    setSymbolMatchState(null);
    setMatchRoomDialog(null);
  }, []);

  const leaveMatchToCaptureReference = useCallback(() => {
    const sid = symbolMatchStateRef.current?.symbolId;
    if (!sid) return;
    setSymbolMatchState(null);
    setMatchRoomDialog(null);
    startSymbolCapture(sid);
  }, [startSymbolCapture]);

  const finishSymbolMatchMulti = useCallback(() => {
    const s = symbolMatchStateRef.current;
    if (!s?.allPages) return;
    if (s.dots.length > 0) {
      window.alert("Save this page or clear dots before finishing.");
      return;
    }
    const total = s.pagesSavedThisSession;
    setSymbolMatchBanner(
      `${s.symbolDescription}: finished multi-page matching (${total} page${total === 1 ? "" : "s"} saved this session).`,
    );
    setSymbolMatchState(null);
  }, []);

  const onSymbolMatchLayerClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const s = symbolMatchStateRef.current;
      if (!s) return;
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const dotId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setSymbolMatchState((prev) => {
        if (!prev) return prev;
        const n = prev.dots.length + 1;
        return {
          ...prev,
          dots: [...prev.dots, { id: dotId, nx, ny, n }],
        };
      });
    },
    [],
  );

  const undoSymbolMatchDot = useCallback(() => {
    setSymbolMatchState((prev) => {
      if (!prev || prev.dots.length === 0) return prev;
      const next = prev.dots.slice(0, -1);
      return {
        ...prev,
        dots: next.map((d, i) => ({ ...d, n: i + 1 })),
      };
    });
  }, []);

  const clearSymbolMatchDots = useCallback(() => {
    if (
      symbolMatchStateRef.current &&
      symbolMatchStateRef.current.dots.length > 0 &&
      !window.confirm("Remove all marks for this symbol on this page?")
    ) {
      return;
    }
    setSymbolMatchState((prev) => (prev ? { ...prev, dots: [] } : prev));
  }, []);

  const openMatchRoomDialog = useCallback(
    (kind: "done" | "savePage") => {
      const s = symbolMatchStateRef.current;
      if (!s) return;
      if (s.dots.length === 0) {
        window.alert("Click at least one match on the plan before saving.");
        return;
      }
      setMatchRoomDialog({ kind, dots: s.dots });
    },
    [],
  );

  const submitMatchRoomDialog = useCallback(async () => {
    const dlg = matchRoomDialog;
    const match = symbolMatchStateRef.current;
    if (!dlg || !match) return;
    const dotsPayload = dlg.dots.map((d, i) => ({
      nx: d.nx,
      ny: d.ny,
      n: d.n,
      room:
        matchRoomMode === "spread"
          ? matchSpreadRooms[i] === "UNASSIGNED"
            ? null
            : matchSpreadRooms[i]!
          : matchSingleRoom === "UNASSIGNED"
            ? null
            : matchSingleRoom,
    }));
    const roomScope =
      matchRoomMode === "spread"
        ? "multiple"
        : matchSingleRoom === "UNASSIGNED"
          ? null
          : matchSingleRoom;

    setSavingSymbolMatch(true);
    try {
      const res = await fetch("/api/symbol-match-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectSymbolId: match.symbolId,
          symbolDescription: match.symbolDescription,
          pageNumber: currentPageRef.current,
          dots: dotsPayload,
          roomScope,
        }),
      });
      const json = (await res.json()) as {
        symbol?: ProjectSymbolRow;
        pageMatchCount?: number;
        totalMatchCount?: number;
        items?: ElectricalItemRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.symbol) onProjectSymbolUpdated(json.symbol);
      if (json.items?.length) {
        setAnalysisItems((prev) => mergeById(prev, json.items!));
      }
      const pageC = json.pageMatchCount ?? dlg.dots.length;
      const totalC = json.totalMatchCount ?? pageC;
      setSymbolMatchBanner(
        `${match.symbolDescription}: ${pageC} on page ${currentPageRef.current} · ${totalC} total across plans`,
      );
      setMatchRoomDialog(null);

      if (dlg.kind === "savePage" && match.allPages) {
        setSymbolMatchState((s) =>
          s
            ? {
                ...s,
                dots: [],
                pagesSavedThisSession: s.pagesSavedThisSession + 1,
              }
            : s,
        );
      } else {
        setSymbolMatchState(null);
      }
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not save symbol match.",
      );
    } finally {
      setSavingSymbolMatch(false);
    }
  }, [
    matchRoomDialog,
    matchRoomMode,
    matchSingleRoom,
    matchSpreadRooms,
    projectId,
    onProjectSymbolUpdated,
  ]);

  symbolCaptureRef.current = symbolCaptureState;
  symbolMatchStateRef.current = symbolMatchState;

  const pageSummaryExportData = useMemo(() => {
    if (numPages < 1) {
      return {
        rows: [] as PageSummaryExportRow[],
        totals: {
          totalPages: 0,
          pagesScanned: 0,
          totalItems: 0,
          unscannedPages: 0,
        },
      };
    }
    const rows: PageSummaryExportRow[] = [];
    for (let p = 1; p <= numPages; p++) {
      const st = thumbByPage[p] as PageThumbScanStatusExport | undefined;
      const meta = pageScanMeta[p];
      rows.push({
        page: p,
        scanStatus: st,
        itemCount: analysisItems.filter((i) => i.page_number === p).length,
        roomCount: detectedRooms.filter((r) => r.page_number === p).length,
        lastScanned: meta?.at
          ? new Date(meta.at).toLocaleString()
          : "—",
        scanMode: meta?.modeLabel ?? "—",
      });
    }
    const pagesScanned = rows.filter(
      (r) => r.scanStatus === "ok" || r.scanStatus === "warn",
    ).length;
    return {
      rows,
      totals: {
        totalPages: numPages,
        pagesScanned,
        totalItems: analysisItems.length,
        unscannedPages: rows.filter(
          (r) => !r.scanStatus || r.scanStatus === "wait",
        ).length,
      },
    };
  }, [numPages, thumbByPage, pageScanMeta, analysisItems, detectedRooms]);

  const runPageSummaryCsvExport = useCallback(() => {
    if (pageSummaryExportData.rows.length === 0) return;
    const label = project
      ? project.project_name?.trim() ||
        projectDisplayName(project.file_name)
      : "Project";
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = label.replace(/[^\w\- ]+/g, "").trim() || "project";
    downloadPageSummaryCsv(
      `page-summary-${safe}-${stamp}.csv`,
      pageSummaryExportData.rows,
    );
    setPageSummaryExportOpen(false);
  }, [pageSummaryExportData.rows, project]);

  const runPageSummaryPdfExport = useCallback(async () => {
    if (!pdfDocs?.length || numPages < 1) return;
    setPageSummaryExportBusy(true);
    try {
      const rows: PageSummaryExportRow[] = [];
      for (let p = 1; p <= numPages; p++) {
        const mapped = globalPageToLocal(p, pdfDocs);
        let thumbDataUrl = "";
        if (mapped) {
          try {
            thumbDataUrl = await renderPageThumbDataUrl(
              mapped.doc,
              mapped.localPage,
            );
          } catch {
            thumbDataUrl = "";
          }
        }
        const st = thumbByPage[p] as PageThumbScanStatusExport | undefined;
        const meta = pageScanMeta[p];
        rows.push({
          page: p,
          scanStatus: st,
          itemCount: analysisItems.filter((i) => i.page_number === p).length,
          roomCount: detectedRooms.filter((r) => r.page_number === p).length,
          lastScanned: meta?.at
            ? new Date(meta.at).toLocaleString()
            : "—",
          scanMode: meta?.modeLabel ?? "—",
          thumbDataUrl: thumbDataUrl || undefined,
        });
      }
      const totals = {
        totalPages: numPages,
        pagesScanned: rows.filter(
          (r) => r.scanStatus === "ok" || r.scanStatus === "warn",
        ).length,
        totalItems: analysisItems.length,
        unscannedPages: rows.filter(
          (r) => !r.scanStatus || r.scanStatus === "wait",
        ).length,
      };
      const label = project
        ? project.project_name?.trim() ||
          projectDisplayName(project.file_name)
        : "Project";
      openPageSummaryPdfReport(label, rows, totals);
      setPageSummaryExportOpen(false);
    } finally {
      setPageSummaryExportBusy(false);
    }
  }, [
    pdfDocs,
    numPages,
    thumbByPage,
    pageScanMeta,
    analysisItems,
    detectedRooms,
    project,
  ]);

  const exportAllTakeoffPdf = useCallback(() => {
    if (!project) return;
    const pn =
      project.project_name?.trim() ||
      projectDisplayName(project.file_name);
    runTakeoffExport(
      {
        projectName: pn,
        analyzedAt: new Date(),
        totalPagesScanned: numPages,
        docNumPages:
          pdfDocs?.map((d) => d.numPages) ??
          sheets.map((s) => Math.max(1, s.page_count ?? 1)),
        sheets,
        items: analysisItems,
        rooms: detectedRooms,
        manualCounts,
        manualMode,
      },
      "pdf",
      "room_floor",
      DEFAULT_TAKEOFF_INCLUDE,
    );
  }, [
    project,
    numPages,
    pdfDocs,
    sheets,
    analysisItems,
    detectedRooms,
    manualCounts,
    manualMode,
  ]);

  const exportAllTakeoffCsv = useCallback(() => {
    if (!project) return;
    const pn =
      project.project_name?.trim() ||
      projectDisplayName(project.file_name);
    runTakeoffExport(
      {
        projectName: pn,
        analyzedAt: new Date(),
        totalPagesScanned: numPages,
        docNumPages:
          pdfDocs?.map((d) => d.numPages) ??
          sheets.map((s) => Math.max(1, s.page_count ?? 1)),
        sheets,
        items: analysisItems,
        rooms: detectedRooms,
        manualCounts,
        manualMode,
      },
      "csv",
      "room_floor",
      DEFAULT_TAKEOFF_INCLUDE,
    );
  }, [
    project,
    numPages,
    pdfDocs,
    sheets,
    analysisItems,
    detectedRooms,
    manualCounts,
    manualMode,
  ]);

  const recallThumbState = useMemo(() => {
    if (takeoffViewMode !== "recall" || !activeRecallSession || numPages < 1) {
      return null;
    }
    return recallThumbMaps(numPages, activeRecallSession);
  }, [takeoffViewMode, activeRecallSession, numPages]);

  const pageThumbnailItems = useMemo(() => {
    if (!pdfDocs?.length || numPages < 1) return null;
    return Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
      const mapped = globalPageToLocal(n, pdfDocs);
      if (!mapped) return null;
      const scanStatus =
        takeoffViewMode === "recall" && recallThumbState
          ? (recallThumbState.statusByPage[n] as PageThumbScanStatus)
          : thumbByPage[n];
      let thumbNote: string | null = null;
      if (takeoffViewMode === "recall" && recallThumbState) {
        const c = recallThumbState.itemCountByPage[n];
        thumbNote =
          c === null ? "Not scanned" : `${c} item${c === 1 ? "" : "s"}`;
      }
      return (
        <PageThumbnail
          key={n}
          pdfDoc={mapped.doc}
          pageNumber={mapped.localPage}
          globalPageLabel={n}
          selected={n === currentPage}
          onSelect={() => {
            setCurrentPage(n);
            if (
              typeof window !== "undefined" &&
              window.matchMedia("(max-width: 1023px)").matches
            ) {
              setMobileThumbsOpen(false);
            }
          }}
          disabled={blockPageNav}
          scanStatus={scanStatus}
          thumbNote={thumbNote}
        />
      );
    });
  }, [
    pdfDocs,
    numPages,
    currentPage,
    blockPageNav,
    thumbByPage,
    takeoffViewMode,
    recallThumbState,
  ]);

  if (projectLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a1628] px-6">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white"
          aria-hidden
        />
        <p className="text-sm text-white/60">Loading project…</p>
      </div>
    );
  }

  if (loadError === "notfound" || (!project && loadError)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a1628] px-6 text-center">
        <p className="text-lg font-medium text-white">
          {loadError === "notfound"
            ? "Project not found"
            : loadError ?? "Something went wrong"}
        </p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#0a1628] hover:bg-white/90"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const name =
    project.project_name?.trim() ||
    projectDisplayName(project.file_name);

  const symbolToolboxBusy = Boolean(symbolCaptureState || symbolMatchState);

  const matchRefRow = symbolMatchState
    ? projectSymbols.find((s) => s.id === symbolMatchState.symbolId)
    : undefined;
  const matchRefB64 = matchRefRow?.symbol_image_base64?.trim();

  const manualDotVisualScale = Math.max(
    0.65,
    Math.min(1.85, zoom / Math.max(0.001, fitWidthZoom)),
  );

  void scanClock;
  const scanElapsedSec =
    scanProgressOpen && scanStartedAtRef.current > 0
      ? Math.max(0, (Date.now() - scanStartedAtRef.current) / 1000)
      : 0;
  const progressMetaForUi = scanModeById(scanProgressMode);
  const scanDonePageCount = scanPageRows.filter((r) =>
    ["done_ok", "done_empty", "done_error"].includes(r.state),
  ).length;
  let scanEstRemainingSec: number | null = null;
  if (
    scanProgressOpen &&
    scanProgressVariant === "batch" &&
    !scanCompleteMessage &&
    scanTotalPages > 0
  ) {
    const remain = Math.max(0, scanTotalPages - scanDonePageCount);
    if (remain <= 0) scanEstRemainingSec = 0;
    else if (scanDonePageCount === 0)
      scanEstRemainingSec = remain * progressMetaForUi.estSecondsPerPage;
    else
      scanEstRemainingSec = (scanElapsedSec / scanDonePageCount) * remain;
  }

  const scanPageLine =
    scanProgressVariant === "batch"
      ? scanBatchStartPage > 1
        ? `Resuming from page ${scanBatchStartPage} of ${scanTotalPages} — Page ${scanCurrentPage} of ${scanTotalPages}`
        : `Page ${scanCurrentPage} of ${scanTotalPages}`
      : `Page ${scanCurrentPage}`;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a1628]">
      <header className="shrink-0 border-b border-white/10 bg-[#071422]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[100vw] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <TppLogoPill size="compact" className="hidden sm:inline-flex" />
            <Link
              href="/dashboard"
              className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              ← Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setMobileThumbsOpen(true)}
              className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/15 lg:hidden"
            >
              Pages
            </button>
            <button
              type="button"
              onClick={() => setJobLinkOpen(true)}
              className="shrink-0 rounded-lg border border-sky-500/45 bg-sky-500/15 px-3 py-1.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
            >
              Link to job
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-white sm:text-xl">
                {name}
              </h1>
              {projectUsageTotal != null && Number.isFinite(projectUsageTotal) ? (
                <p className="mt-0.5 text-xs text-emerald-200/90">
                  Total analysis cost: {formatUsd(projectUsageTotal)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {takeoffViewMode === "recall" && activeRecallSession ? (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-amber-950/45 px-4 py-2.5 text-center text-sm text-amber-50/95 backdrop-blur-sm"
          role="status"
        >
          <span className="font-medium">
            Viewing scan from{" "}
            {formatRecallSessionDate(activeRecallSession.scanDate)} —{" "}
            {activeRecallSession.pageCount} page
            {activeRecallSession.pageCount === 1 ? "" : "s"} |{" "}
            {analysisItems.length} item
            {analysisItems.length === 1 ? "" : "s"}
          </span>
          <span className="mx-2 text-amber-200/60">|</span>
          <button
            type="button"
            onClick={() => void switchToLiveTakeoff()}
            className="inline-flex items-center rounded-lg border border-white/25 bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25"
          >
            Switch to Live
          </button>
        </div>
      ) : null}

      {pdfLoading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white"
            aria-hidden
          />
          <p className="text-sm text-white/60">Loading PDF…</p>
        </div>
      )}

      {pdfError && !pdfLoading && (
        <div className="mx-auto max-w-lg px-6 py-12 text-center">
          <p className="rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm text-red-100">
            {pdfError}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#0a1628] hover:bg-white/90"
          >
            Back to dashboard
          </Link>
        </div>
      )}

      {scanProgressOpen && pdfDocs && pdfDocs.length > 0 && numPages > 0 ? (
        <ScanProgressOverlay
          open
          variant={scanProgressVariant}
          title={
            scanProgressVariant === "single"
              ? `Analyzing Page ${scanCurrentPage}`
              : "Analyzing Blueprint"
          }
          progressPct={scanProgressPct}
          progressSessionKey={scanProgressSessionKey}
          pageLine={scanPageLine}
          phasePrimary={scanPhasePrimary}
          phaseSecondary={scanPhaseSecondary}
          pageRows={scanPageRows}
          elapsedSec={scanElapsedSec}
          estRemainingSec={scanEstRemainingSec}
          costSoFar={scanCostSoFar}
          sessionCostEstimate={scanSessionEstimate}
          scanCompleteMessage={scanCompleteMessage}
          cancelPagesCompleted={
            scanProgressVariant === "batch" ? scanDonePageCount : undefined
          }
          onDismissComplete={dismissScanProgress}
          onCancelScan={onCancelScanConfirmed}
        />
      ) : null}

      <ScanModeDialog
        open={scanModeDialogOpen}
        pageCount={scanModeDialogTarget === "all" ? numPages : 1}
        onClose={() => {
          setScanModeDialogOpen(false);
          scanModeDialogTargetRef.current = null;
          setScanModeDialogTarget(null);
        }}
        onStart={onScanModeChosen}
      />

      {!pdfLoading && !pdfError && pdfDocs && pdfDocs.length > 0 && numPages > 0 && (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          {mobileThumbsOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-[50] bg-black/55 lg:hidden"
              aria-label="Close page list"
              onClick={() => setMobileThumbsOpen(false)}
            />
          ) : null}
          {thumbCollapsedDesktop ? (
            <div className="hidden w-9 shrink-0 flex-col border-r border-white/10 bg-[#071422]/90 transition-all duration-300 ease-in-out lg:flex">
              <button
                type="button"
                title="Expand thumbnails"
                aria-label="Expand thumbnails"
                onClick={() => setThumbCollapsedDesktop(false)}
                className="flex h-11 w-9 shrink-0 items-center justify-center text-sm text-white/85 hover:bg-white/10"
              >
                ▶
              </button>
              <button
                type="button"
                title="Recall past scan"
                aria-label="Recall past scan"
                onClick={() => void openRecallScanPicker()}
                className="flex min-h-[2.75rem] w-9 shrink-0 items-center justify-center border-t border-white/10 text-base leading-none text-white/80 hover:bg-white/10"
              >
                📋
              </button>
            </div>
          ) : (
            <div
              className="relative hidden shrink-0 flex-col border-r border-white/10 bg-[#071422]/60 transition-all duration-300 ease-in-out lg:flex"
              style={
                viewerDesktopLayout && !thumbCollapsedDesktop
                  ? {
                      width: thumbWidthPx,
                      flexShrink: 0,
                    }
                  : undefined
              }
            >
              <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 px-2 py-2">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    title="Collapse thumbnails"
                    aria-label="Collapse thumbnails"
                    onClick={() => setThumbCollapsedDesktop(true)}
                    className="rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10"
                  >
                    ◀
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void openRecallScanPicker()}
                  disabled={numPages < 1}
                  className="w-full rounded-lg border border-amber-500/40 bg-amber-950/35 px-2 py-2 text-[11px] font-semibold leading-tight text-amber-100 hover:bg-amber-950/50 disabled:opacity-40"
                >
                  📋 Recall Past Scan
                </button>
              </div>
              <aside
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 pb-2"
                aria-label="Page thumbnails"
              >
                {pageThumbnailItems}
              </aside>
              <div className="shrink-0 border-t border-white/10 px-2 py-2">
                <button
                  type="button"
                  disabled={numPages < 1}
                  onClick={() => setPageSummaryExportOpen(true)}
                  className="w-full rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-950/55 disabled:opacity-40"
                >
                  Export Page Summary
                </button>
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize thumbnails panel"
                className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-white/15 active:bg-white/25"
                onMouseDown={onThumbResizePointerDown}
              />
            </div>
          )}
          <aside
            className={[
              "shrink-0 gap-2 border-white/10 bg-[#071422]/60",
              "flex flex-col overflow-y-auto overflow-x-hidden",
              "border-b px-3 py-3 lg:hidden",
              mobileThumbsOpen
                ? "fixed bottom-0 left-0 top-0 z-[55] flex w-[min(88vw,18rem)] border-r p-2 shadow-2xl max-lg:flex"
                : "max-lg:hidden",
            ].join(" ")}
            aria-label="Page thumbnails"
          >
            <button
              type="button"
              onClick={() => void openRecallScanPicker()}
              disabled={numPages < 1}
              className="w-full shrink-0 rounded-lg border border-amber-500/40 bg-amber-950/35 px-2 py-2 text-[11px] font-semibold leading-tight text-amber-100 hover:bg-amber-950/50 disabled:opacity-40"
            >
              📋 Recall Past Scan
            </button>
            {pageThumbnailItems}
            <div className="mt-auto shrink-0 border-t border-white/10 pt-2">
              <button
                type="button"
                disabled={numPages < 1}
                onClick={() => setPageSummaryExportOpen(true)}
                className="w-full rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-950/55 disabled:opacity-40"
              >
                Export Page Summary
              </button>
            </div>
          </aside>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {legendBusy ? (
              <div
                className="flex shrink-0 items-center justify-center gap-2 border-b border-sky-500/30 bg-sky-950/40 px-4 py-3 text-sm text-sky-100"
                role="status"
                aria-live="polite"
              >
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-300/40 border-t-sky-100"
                  aria-hidden
                />
                {legendManualRescanBusy
                  ? "Re-scanning legend…"
                  : "Scanning for symbol legend…"}
              </div>
            ) : null}
            {legendStatus === "error" && legendError ? (
              <div className="flex shrink-0 flex-col gap-2 border-b border-red-500/35 bg-red-950/40 px-4 py-3 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0">{legendError}</p>
                <button
                  type="button"
                  onClick={() => setLegendRunId((n) => n + 1)}
                  className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {legendStatus === "ready" && legendMeta?.found ? (
              <div className="flex shrink-0 flex-col gap-2 border-b border-emerald-500/35 bg-emerald-950/45 px-4 py-3 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 font-medium">
                  Electrical legend on page {legendMeta.primaryPage ?? "—"} —{" "}
                  {legendMeta.symbolCount} symbol
                  {legendMeta.symbolCount === 1 ? "" : "s"}
                  {legendMeta.noteCount > 0
                    ? `, ${legendMeta.noteCount} plan note${legendMeta.noteCount === 1 ? "" : "s"}`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setLegendPanelOpen(true)}
                  className="shrink-0 rounded-lg border border-emerald-400/50 bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500/90"
                >
                  View Symbols
                </button>
              </div>
            ) : null}
            {legendStatus === "ready" && legendMeta && !legendMeta.found ? (
              <div className="shrink-0 border-b border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/65">
                No legend detected — using standard symbols
              </div>
            ) : null}
            {symbolCaptureState?.phase === "select" ? (
              symbolCaptureState.mode === "legend_click" ? (
                <div className="shrink-0 border-b border-cyan-500/45 bg-cyan-950/40 px-4 py-2.5 text-center text-sm font-semibold leading-snug text-cyan-50">
                  Click directly on the{" "}
                  <span className="text-white">
                    {symbolCaptureState.symbolDescription}
                  </span>{" "}
                  symbol in the legend below to capture it.
                </div>
              ) : (
                <div className="shrink-0 border-b border-sky-500/45 bg-sky-600/25 px-4 py-2.5 text-center text-sm font-semibold leading-snug text-sky-50">
                  Click and drag on the blueprint to capture this symbol. You can
                  capture from the legend area or from anywhere on the plans.
                </div>
              )
            ) : null}
            {symbolCaptureState?.phase === "review" ? (
              symbolCaptureState.mode === "legend_click" ? (
                <div className="shrink-0 border-b border-cyan-500/40 bg-cyan-950/50 px-4 py-2.5 text-center text-sm font-medium text-cyan-50">
                  Is this the right symbol? Use the buttons below to confirm or
                  try again.
                </div>
              ) : (
                <div className="shrink-0 border-b border-sky-500/35 bg-sky-950/45 px-4 py-2.5 text-center text-sm text-sky-100">
                  Review capture — choose Use this, Retake, or Cancel (toolbar
                  below)
                </div>
              )
            ) : null}
            {symbolMatchState ? (
              <div className="shrink-0 border-b border-indigo-500/45 bg-indigo-950/55 px-4 py-2.5 text-center text-sm font-medium text-indigo-50">
                Click each {symbolMatchState.symbolDescription} you see on this
                page · {symbolMatchState.dots.length} marked
                {symbolMatchState.allPages
                  ? ` · Multi-page session: ${symbolMatchState.pagesSavedThisSession} page(s) saved`
                  : ""}
              </div>
            ) : null}
            {symbolMatchBanner ? (
              <div className="shrink-0 border-b border-emerald-500/35 bg-emerald-950/40 px-4 py-2 text-center text-sm text-emerald-100">
                {symbolMatchBanner}
              </div>
            ) : null}
            {symbolCaptureSuccessBanner ? (
              <div className="shrink-0 border-b border-teal-500/40 bg-teal-950/45 px-4 py-2 text-center text-sm font-medium text-teal-100">
                {symbolCaptureSuccessBanner}
              </div>
            ) : null}
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-white/10 bg-[#0a1628] px-3 py-3 sm:gap-3 sm:px-4">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentPage <= 1 || blockPageNav}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/15"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={currentPage >= numPages || blockPageNav}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/15"
                >
                  Next
                </button>
                <span className="flex flex-wrap items-center gap-1 px-1 text-sm tabular-nums text-white/85">
                  <span>Page</span>
                  {pageJumpEditing ? (
                    <input
                      ref={pageJumpInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="Jump to page number"
                      className="w-10 rounded border border-sky-400/50 bg-[#071422] px-1 py-0.5 text-center text-sm font-semibold text-white outline-none focus:ring-1 focus:ring-sky-400"
                      value={pageJumpDraft}
                      onChange={(e) =>
                        setPageJumpDraft(e.target.value.replace(/\D/g, ""))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const p = parseInt(pageJumpDraft, 10);
                          if (
                            Number.isFinite(p) &&
                            p >= 1 &&
                            p <= numPages
                          ) {
                            setCurrentPage(p);
                          }
                          setPageJumpEditing(false);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setPageJumpEditing(false);
                        }
                      }}
                      onBlur={() => setPageJumpEditing(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={blockPageNav}
                      title="Click to type a page number"
                      className="min-w-[1.75rem] rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        setPageJumpDraft(String(currentPage));
                        setPageJumpEditing(true);
                        queueMicrotask(() => {
                          pageJumpInputRef.current?.focus();
                          pageJumpInputRef.current?.select();
                        });
                      }}
                    >
                      {currentPage}
                    </button>
                  )}
                  <span>of {numPages}</span>
                  {pageJumpOptions.length > 0 ? (
                    <select
                      value={currentPage}
                      disabled={blockPageNav}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) setCurrentPage(v);
                      }}
                      aria-label="Jump to page"
                      className="ml-1 max-w-[14rem] truncate rounded border border-white/20 bg-[#071422] px-1.5 py-1 text-xs text-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pageJumpOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </span>
              </div>

              <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => analyzeThisPage()}
                  disabled={analyzeBusy || legendBusy || symbolToolboxBusy}
                  className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-sm font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-sky-500/30"
                >
                  Analyze This Page
                </button>
                <button
                  type="button"
                  onClick={() => analyzeAllPages()}
                  disabled={analyzeBusy || legendBusy || symbolToolboxBusy}
                  className="rounded-lg border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-sm font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-violet-500/30"
                >
                  Analyze All Pages
                </button>
                <button
                  type="button"
                  onClick={() => void runRoomScanCurrentPage()}
                  disabled={
                    analyzeBusy ||
                    legendBusy ||
                    symbolToolboxBusy ||
                    roomScanBusy ||
                    blockPageNav
                  }
                  title="AI scan of current page for room names, dimensions, and square footage"
                  className="rounded-lg border border-teal-500/45 bg-teal-950/35 px-3 py-2 text-sm font-semibold text-teal-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-950/50"
                >
                  {roomScanBusy ? "Scanning rooms…" : "Scan Rooms and Sq Footage"}
                </button>
                {resumeSnapshot &&
                resumeSnapshot.projectId === projectId &&
                !analyzeBusy ? (
                  <button
                    type="button"
                    onClick={() => resumeBatchScan()}
                    disabled={legendBusy || symbolToolboxBusy}
                    className="rounded-lg border border-amber-500/45 bg-amber-950/40 px-3 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-950/55"
                    title={`Resume from page ${resumeSnapshot.nextPage}`}
                  >
                    Resume Scan
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setScanHistoryOpen(true)}
                  disabled={analyzeBusy || legendBusy || symbolToolboxBusy}
                  className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-white/15"
                >
                  Scan History
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTakeoffExportRoom(null);
                    setTakeoffExportOpen(true);
                  }}
                  disabled={
                    analyzeBusy ||
                    legendBusy ||
                    symbolToolboxBusy ||
                    analysisItems.length === 0
                  }
                  title={
                    analysisItems.length === 0
                      ? "Run analysis first to export a takeoff."
                      : undefined
                  }
                  className="rounded-lg border border-emerald-500/45 bg-emerald-950/35 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-950/50"
                >
                  Export Takeoff
                </button>
                <button
                  type="button"
                  onClick={() => setTargetDialogOpen(true)}
                  disabled={analyzeBusy || legendBusy || symbolToolboxBusy}
                  className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/20 px-3 py-2 text-sm font-semibold text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-fuchsia-500/30"
                >
                  Target Scan
                </button>
                <button
                  type="button"
                  onClick={() => setRoomAssignmentView((v) => !v)}
                  disabled={
                    analyzeBusy || manualMode || legendBusy || symbolToolboxBusy
                  }
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    roomAssignmentView
                      ? "border-cyan-400 bg-cyan-950/50 text-cyan-100 hover:bg-cyan-950/65"
                      : "border-cyan-500/35 bg-cyan-950/25 text-cyan-100 hover:bg-cyan-950/40",
                  ].join(" ")}
                >
                  {roomAssignmentView
                    ? "Exit room assignment"
                    : "Room assignment"}
                </button>
                <button
                  type="button"
                  onClick={toggleManualMode}
                  disabled={analyzeBusy || legendBusy || symbolToolboxBusy}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    manualMode
                      ? "border-sky-400 bg-sky-500/30 text-sky-50 ring-1 ring-sky-400/50 hover:bg-sky-500/40"
                      : "border-white/25 bg-white/10 text-white hover:bg-white/15",
                  ].join(" ")}
                >
                  {manualMode ? "Exit Manual Mode" : "Manual Count Mode"}
                </button>
                <button
                  type="button"
                  onClick={openResetDialog}
                  disabled={
                    analyzeBusy || manualMode || legendBusy || symbolToolboxBusy
                  }
                  className="rounded-lg border border-amber-500/45 bg-amber-950/35 px-3 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-950/50"
                >
                  Reset Analysis
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= ZOOM_MIN || analyzeBusy || legendBusy}
                  className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-white/15"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <span className="min-w-[3.25rem] text-center text-sm tabular-nums text-white/80">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= ZOOM_MAX || analyzeBusy || legendBusy}
                  className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-white/15"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={applyFitWidthZoom}
                  disabled={analyzeBusy || legendBusy}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs font-semibold text-white/90 disabled:opacity-40 hover:bg-white/15"
                  title="Fit page width to viewer"
                >
                  Fit width
                </button>
                <button
                  type="button"
                  onClick={applyFitPageZoom}
                  disabled={analyzeBusy || legendBusy}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs font-semibold text-white/90 disabled:opacity-40 hover:bg-white/15"
                  title="Fit entire page in viewer"
                >
                  Fit page
                </button>
                <button
                  type="button"
                  onClick={resetZoomDefault}
                  disabled={analyzeBusy || legendBusy}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs font-semibold text-white/90 disabled:opacity-40 hover:bg-white/15"
                  title="Reset to default (fit width)"
                >
                  Reset zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setThumbCollapsedDesktop(true);
                    setResultsCollapsedDesktop(true);
                  }}
                  className="rounded-lg border border-teal-500/35 bg-teal-950/35 px-2 py-2 text-xs font-semibold text-teal-100 hover:bg-teal-950/50"
                  title="Collapse thumbnails and results for maximum blueprint space"
                >
                  Focus mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setThumbCollapsedDesktop(false);
                    setResultsCollapsedDesktop(false);
                    setThumbWidthPx(THUMB_SIDEBAR.def);
                    setResultsWidthPx(RESULTS_SIDEBAR.def);
                    try {
                      localStorage.setItem(
                        LS_VIEWER_THUMB,
                        JSON.stringify({
                          collapsed: false,
                          width: THUMB_SIDEBAR.def,
                        }),
                      );
                      localStorage.setItem(
                        LS_VIEWER_RESULTS,
                        JSON.stringify({
                          collapsed: false,
                          width: RESULTS_SIDEBAR.def,
                        }),
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs font-semibold text-white/90 hover:bg-white/15"
                  title="Expand both sidebars and restore default widths (220px / 380px)"
                >
                  Reset layout
                </button>
                <button
                  type="button"
                  onClick={() => void toggleBlueprintFullscreen()}
                  disabled={analyzeBusy || legendBusy}
                  className="rounded-lg border border-violet-500/35 bg-violet-950/35 px-2 py-2 text-xs font-semibold text-violet-100 disabled:opacity-40 hover:bg-violet-950/50"
                  title="Fullscreen blueprint (Escape to exit)"
                >
                  {viewerFs ? "Exit full screen" : "Full screen"}
                </button>
              </div>
            </div>

            {roomScanHistory.length > 0 ? (
              <div className="shrink-0 w-full border-b border-teal-500/35 bg-teal-950/25 px-3 py-3 text-sm text-teal-50/95 sm:px-4">
                <div className="mx-auto flex max-w-[1200px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="min-w-0 font-medium leading-snug text-teal-100">
                    <span aria-hidden>📐 </span>
                    Room scan from{" "}
                    {formatRoomScanBannerDate(roomScanHistory[0]!.created_at)} —{" "}
                    {roomScanHistory[0]!.room_count} rooms |{" "}
                    {(roomScanHistory[0]!.total_sqft ?? 0).toLocaleString()} sq
                    ft
                  </p>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openLatestSavedRoomScan()}
                      className="rounded-lg border border-teal-400/50 bg-teal-600/30 px-3 py-1.5 text-xs font-semibold text-teal-50 hover:bg-teal-600/45"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => void runRoomScanCurrentPage()}
                      disabled={
                        analyzeBusy ||
                        legendBusy ||
                        symbolToolboxBusy ||
                        roomScanBusy ||
                        blockPageNav
                      }
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {roomScanBusy ? "Scanning…" : "Rescan"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {analyzeError && (
              <div className="border-b border-red-500/30 bg-red-950/40 px-4 py-2 text-center text-sm text-red-100">
                {analyzeError}
              </div>
            )}

            {manualBanner && (
              <div className="border-b border-sky-500/25 bg-sky-950/35 px-4 py-2 text-center text-sm text-sky-100">
                {manualBanner}
              </div>
            )}

            {manualMode && (
              <div className="border-b border-sky-500/30 bg-[#071a2e] px-3 py-3 sm:px-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-200/90">
                  Manual count — this page
                </p>
                <p className="mb-3 text-xs text-white/70">
                  Manual counts start at zero — each blueprint click adds one
                  for the selected symbol (separate from the AI count). Pick a
                  room, select a symbol (bright border), then click. Use [−] /
                  [+] on cards or Undo. Done saves: manual &gt; 0 → final =
                  manual; otherwise final stays AI.
                </p>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <label className="flex min-w-0 flex-col gap-1 text-[11px] text-white/75 sm:max-w-xs">
                    <span className="font-semibold text-sky-100/90">
                      Counting in
                    </span>
                    <select
                      value={manualCountingRoomId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setManualCountingRoomId(
                          v === "UNASSIGNED" ? "UNASSIGNED" : v,
                        );
                      }}
                      className="rounded-lg border border-white/20 bg-[#0a1628] px-2 py-1.5 text-sm text-white"
                    >
                      <option value="UNASSIGNED">UNASSIGNED</option>
                      {pageRoomsForManual.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.room_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="min-w-0 flex-1 text-xs leading-snug text-emerald-100/90">
                    {manualRunningSummary}
                  </p>
                </div>
                {manualToolbarItems.length === 0 ? (
                  <p className="mb-3 rounded-lg border border-amber-500/35 bg-amber-950/25 px-2 py-2 text-xs text-amber-100">
                    No countable items in this room. Select another room above,
                    or assign items to rooms in the results panel.
                  </p>
                ) : (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {manualToolbarItems.map((item) => {
                      const hueIdx = roomHueIndexForManualDots(
                        manualCountingRoomId,
                        pageRoomsForManual,
                      );
                      const ap = getManualDotAppearance(item, hueIdx);
                      const sel = selectedManualItemId === item.id;
                      const cnt = manualCounts[item.id] ?? 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedManualItemId(item.id)}
                          className={[
                            "flex min-w-0 max-w-[14rem] items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                            sel
                              ? "border-amber-300 bg-white/10 ring-2 ring-amber-300/90"
                              : "border-white/20 bg-white/[0.04] hover:border-white/35",
                          ].join(" ")}
                        >
                          <ManualCountDotVisual
                            appearance={ap}
                            sequence={1}
                            sizeClass="h-4 w-4 scale-90"
                            hideSequence
                          />
                          <span className="min-w-0 flex-1 truncate font-medium text-white">
                            {item.description}
                          </span>
                          <span className="shrink-0 tabular-nums text-white/85">
                            {cnt}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={undoManualAction}
                    disabled={manualActionStack.length === 0}
                    className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/15"
                  >
                    Undo Last
                  </button>
                  <button
                    type="button"
                    onClick={clearAllManualAdjustments}
                    className="rounded-lg border border-red-500/35 bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-950/45"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveManualCounts()}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                  >
                    Done Counting
                  </button>
                </div>
              </div>
            )}

            {symbolCaptureState?.phase === "review" ? (
              symbolCaptureState.mode === "legend_click" ? (
                <div className="flex shrink-0 flex-col items-center gap-3 border-b border-cyan-500/35 bg-[#061a24] px-3 py-4 sm:flex-row sm:flex-wrap sm:justify-center">
                  {symbolCaptureState.draftBase64 ? (
                    <img
                      src={`data:image/png;base64,${symbolCaptureState.draftBase64}`}
                      alt="Captured symbol preview"
                      className="h-[180px] w-[180px] rounded-lg border border-white/25 bg-white p-1 object-contain shadow-lg"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmSymbolCapture()}
                      className="rounded-lg border border-emerald-500/45 bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      Yes, use this
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSymbolCaptureState((s) =>
                          s
                            ? {
                                symbolId: s.symbolId,
                                symbolDescription: s.symbolDescription,
                                mode: s.mode,
                                phase: "select",
                                dragStartNorm: null,
                                rectNorm: null,
                                draftBase64: null,
                                pointerNorm: null,
                              }
                            : s,
                        )
                      }
                      className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={cancelSymbolCapture}
                      className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/85 hover:bg-white/15"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-sky-500/35 bg-[#071a2e] px-3 py-3 sm:gap-3">
                  {symbolCaptureState.draftBase64 ? (
                    <img
                      src={`data:image/png;base64,${symbolCaptureState.draftBase64}`}
                      alt=""
                      className="h-14 w-auto rounded border border-white/20 bg-white p-0.5"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void confirmSymbolCapture()}
                    className="rounded-lg border border-emerald-500/45 bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500/90"
                  >
                    Use this
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSymbolCaptureState((s) =>
                        s
                          ? {
                              symbolId: s.symbolId,
                              symbolDescription: s.symbolDescription,
                              mode: s.mode,
                              phase: "select",
                              dragStartNorm: null,
                              rectNorm: null,
                              draftBase64: null,
                              pointerNorm: null,
                            }
                          : s,
                      )
                    }
                    className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={cancelSymbolCapture}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/15"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void addCaptureToLibrary()}
                    className="rounded-lg border border-violet-500/40 bg-violet-950/40 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-950/55"
                  >
                    Save to library
                  </button>
                </div>
              )
            ) : null}

            {symbolMatchState ? (
              <div className="shrink-0 border-b border-indigo-500/35 bg-[#0c1220] px-3 py-3 sm:px-4">
                <p className="mb-2 text-xs text-indigo-100/85">
                  {symbolMatchState.symbolDescription}:{" "}
                  {symbolMatchState.dots.length} marked on this page
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={undoSymbolMatchDot}
                    disabled={symbolMatchState.dots.length === 0}
                    className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-white/15"
                  >
                    Undo last
                  </button>
                  <button
                    type="button"
                    onClick={clearSymbolMatchDots}
                    className="rounded-lg border border-red-500/35 bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-950/45"
                  >
                    Clear all
                  </button>
                  {!symbolMatchState.allPages ? (
                    <button
                      type="button"
                      onClick={() => openMatchRoomDialog("done")}
                      className="rounded-lg border border-emerald-500/45 bg-emerald-600/75 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500/85"
                    >
                      Done
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openMatchRoomDialog("savePage")}
                        className="rounded-lg border border-emerald-500/45 bg-emerald-600/75 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500/85"
                      >
                        Save this page
                      </button>
                      <button
                        type="button"
                        onClick={finishSymbolMatchMulti}
                        className="rounded-lg border border-indigo-500/45 bg-indigo-950/50 px-2.5 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-950/65"
                      >
                        Finish matching
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={exitSymbolMatch}
                    className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15"
                  >
                    Cancel match
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div
                ref={blueprintViewportRef}
                tabIndex={0}
                className={[
                  "min-h-0 min-w-0 flex-1 overflow-auto bg-[#050d18] p-4 outline-none ring-offset-0 focus-visible:ring-2 focus-visible:ring-sky-500/50 lg:p-6",
                  symbolCaptureState?.phase === "select"
                    ? legendCaptureBusy
                      ? "cursor-wait"
                      : "cursor-crosshair"
                    : "",
                  symbolCaptureState
                    ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-[#050d18]"
                    : "",
                ].join(" ")}
                onWheel={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    zoomTouchedByUserRef.current = true;
                    const factor = e.deltaY > 0 ? 0.94 : 1.06;
                    setZoom((z) =>
                      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor)),
                    );
                  }
                }}
                onKeyDown={(e) => {
                  const el = blueprintViewportRef.current;
                  if (!el || e.target !== el) return;
                  const step = 56;
                  if (e.key === "ArrowLeft") {
                    el.scrollLeft -= step;
                    e.preventDefault();
                  } else if (e.key === "ArrowRight") {
                    el.scrollLeft += step;
                    e.preventDefault();
                  } else if (e.key === "ArrowUp") {
                    el.scrollTop -= step;
                    e.preventDefault();
                  } else if (e.key === "ArrowDown") {
                    el.scrollTop += step;
                    e.preventDefault();
                  }
                }}
                onPointerDown={(e) => {
                  if (!e.altKey || e.button !== 0) return;
                  const el = blueprintViewportRef.current;
                  if (!el) return;
                  e.preventDefault();
                  panPointerRef.current = {
                    pointerId: e.pointerId,
                    startX: e.clientX,
                    startY: e.clientY,
                    scrollLeft: el.scrollLeft,
                    scrollTop: el.scrollTop,
                  };
                  el.setPointerCapture(e.pointerId);
                  el.style.cursor = "grabbing";
                }}
                onPointerMove={(e) => {
                  const p = panPointerRef.current;
                  if (!p || p.pointerId !== e.pointerId) return;
                  const el = blueprintViewportRef.current;
                  if (!el) return;
                  el.scrollLeft = p.scrollLeft - (e.clientX - p.startX);
                  el.scrollTop = p.scrollTop - (e.clientY - p.startY);
                }}
                onPointerUp={(e) => {
                  const el = blueprintViewportRef.current;
                  if (panPointerRef.current?.pointerId === e.pointerId) {
                    panPointerRef.current = null;
                    if (el) el.style.cursor = "";
                  }
                }}
                onPointerCancel={(e) => {
                  const el = blueprintViewportRef.current;
                  if (panPointerRef.current?.pointerId === e.pointerId) {
                    panPointerRef.current = null;
                    if (el) el.style.cursor = "";
                  }
                }}
                title="Focus here and use arrow keys to pan. Alt+drag to pan. Ctrl+wheel to zoom."
              >
                <div className="flex min-h-full min-w-0 justify-center">
                  <div className="relative inline-block max-w-full">
                    {currentPdfAndPage ? (
                      <MainPageCanvas
                        ref={mainPdfCanvasRef}
                        pdfDoc={currentPdfAndPage.doc}
                        pageNumber={currentPdfAndPage.localPage}
                        zoom={zoom}
                      />
                    ) : null}
                    {symbolCaptureState?.phase === "select" &&
                    symbolCaptureState.mode === "rectangle" ? (
                      <div
                        className="pointer-events-none absolute inset-0 z-[15] rounded-lg bg-sky-500/[0.12] ring-1 ring-inset ring-sky-400/20"
                        aria-hidden
                      />
                    ) : null}
                    {symbolCaptureState?.phase === "select" &&
                    symbolCaptureState.mode === "rectangle" ? (
                      <div
                        className="absolute inset-0 z-[40] touch-none rounded-lg"
                        onPointerDown={onCapturePointerDown}
                        onPointerMove={onCapturePointerMove}
                        onPointerUp={onCapturePointerUp}
                        onPointerCancel={onCapturePointerUp}
                        role="presentation"
                      >
                        {symbolCaptureState.rectNorm ? (
                          <div
                            className="pointer-events-none absolute border-2 border-dashed border-sky-400 bg-sky-400/15"
                            style={{
                              left: `${symbolCaptureState.rectNorm.nx * 100}%`,
                              top: `${symbolCaptureState.rectNorm.ny * 100}%`,
                              width: `${symbolCaptureState.rectNorm.nw * 100}%`,
                              height: `${symbolCaptureState.rectNorm.nh * 100}%`,
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {symbolCaptureState?.phase === "select" &&
                    symbolCaptureState.mode === "legend_click" ? (
                      <>
                        <div
                          className="pointer-events-none absolute inset-0 z-[15] rounded-lg bg-cyan-500/[0.08] ring-1 ring-inset ring-cyan-400/25"
                          aria-hidden
                        />
                        <div
                          className={[
                            "absolute inset-0 z-[40] touch-none rounded-lg",
                            legendCaptureBusy ? "cursor-wait" : "cursor-crosshair",
                          ].join(" ")}
                          onMouseMove={onLegendCaptureMove}
                          onMouseLeave={onLegendCaptureLeave}
                          onClick={onLegendCaptureClick}
                          role="presentation"
                        >
                          {symbolCaptureState.pointerNorm ? (
                            <div
                              className="pointer-events-none absolute rounded-full border-2 border-cyan-300 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                              style={{
                                width: LEGEND_CURSOR_RING_PX,
                                height: LEGEND_CURSOR_RING_PX,
                                left: `${symbolCaptureState.pointerNorm.nx * 100}%`,
                                top: `${symbolCaptureState.pointerNorm.ny * 100}%`,
                                transform: "translate(-50%, -50%)",
                              }}
                              aria-hidden
                            />
                          ) : null}
                        </div>
                      </>
                    ) : null}
                    {symbolMatchState ? (
                      <>
                        {symbolMatchState.dots.map((d) => (
                          <div
                            key={d.id}
                            className="absolute z-[35]"
                            style={{
                              left: `${d.nx * 100}%`,
                              top: `${d.ny * 100}%`,
                              transform: `translate(-50%, -50%) scale(${manualDotVisualScale})`,
                            }}
                            aria-hidden
                          >
                            <span className="pointer-events-none flex h-5 w-5 items-center justify-center rounded-full border-2 border-sky-200 bg-sky-600 text-[9px] font-black tabular-nums text-white shadow-lg">
                              {d.n}
                            </span>
                          </div>
                        ))}
                        <div
                          className="absolute inset-0 z-[30] cursor-crosshair rounded-lg"
                          onClick={onSymbolMatchLayerClick}
                          role="presentation"
                        />
                      </>
                    ) : null}
                    {manualMode && !symbolCaptureState && !symbolMatchState ? (
                      <>
                        {manualDots.map((d) => {
                          const row = analysisItems.find(
                            (i) => i.id === d.itemId,
                          );
                          const hueIdx = roomHueIndexForManualDots(
                            d.countingRoomId ?? "UNASSIGNED",
                            pageRoomsForManual,
                          );
                          const ap = row
                            ? getManualDotAppearance(row, hueIdx)
                            : {
                                skipDot: false,
                                fill: "#94a3b8",
                                stroke: "#e2e8f0",
                                glyph: "?",
                                variant: "ring" as const,
                              };
                          return (
                            <div
                              key={d.id}
                              className="absolute z-[25]"
                              style={{
                                left: `${d.nx * 100}%`,
                                top: `${d.ny * 100}%`,
                                transform: `translate(-50%, -50%) scale(${manualDotVisualScale})`,
                              }}
                              aria-hidden
                            >
                              <ManualCountDotVisual
                                appearance={ap}
                                sequence={d.sequence}
                              />
                            </div>
                          );
                        })}
                        <div
                          className="absolute inset-0 z-[20] cursor-crosshair rounded-lg"
                          onClick={onManualLayerClick}
                          role="presentation"
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <div
                className={[
                  "relative flex min-h-0 min-w-0 flex-1 flex-col border-t border-white/10",
                  "lg:relative lg:border-l lg:border-t-0",
                  "max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:z-[45]",
                  "max-lg:rounded-t-2xl max-lg:border max-lg:border-white/12 max-lg:bg-[#0a1628]",
                  "max-lg:shadow-[0_-12px_40px_rgba(0,0,0,0.5)]",
                  "transition-all duration-300 ease-in-out",
                  mobileResultsOpen
                    ? "max-lg:max-h-[min(85vh,560px)]"
                    : "max-lg:max-h-[3.25rem]",
                  resultsCollapsedDesktop
                    ? "lg:w-10 lg:min-w-10 lg:max-w-10 lg:overflow-hidden"
                    : "",
                ].join(" ")}
                style={
                  viewerDesktopLayout && !resultsCollapsedDesktop
                    ? { width: resultsWidthPx, flexShrink: 0 }
                    : undefined
                }
              >
                {!resultsCollapsedDesktop ? (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize results panel"
                    className="absolute left-0 top-0 z-10 hidden h-full w-2 cursor-col-resize hover:bg-white/15 active:bg-white/25 lg:block"
                    onMouseDown={onResultsResizePointerDown}
                  />
                ) : null}
                {!resultsCollapsedDesktop ? (
                  <div className="hidden shrink-0 items-center border-b border-white/10 px-2 py-2 lg:flex">
                    <button
                      type="button"
                      title="Collapse results"
                      aria-label="Collapse results"
                      onClick={() => setResultsCollapsedDesktop(true)}
                      className="rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10"
                    >
                      ▶
                    </button>
                  </div>
                ) : (
                  <div className="hidden shrink-0 items-center justify-center border-b border-white/10 py-2 lg:flex">
                    <button
                      type="button"
                      title="Expand results"
                      aria-label="Expand results"
                      onClick={() => setResultsCollapsedDesktop(false)}
                      className="rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10"
                    >
                      ◀
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="flex w-full shrink-0 items-center justify-center border-b border-white/10 py-2.5 text-sm font-semibold text-[#E8C84A] hover:bg-white/5 lg:hidden"
                  onClick={() => setMobileResultsOpen((o) => !o)}
                >
                  {mobileResultsOpen
                    ? "▼ Hide results"
                    : "▲ Results & analysis"}
                </button>
                <div
                  className={[
                    !mobileResultsOpen
                      ? "flex min-h-0 flex-1 flex-col overflow-hidden max-lg:hidden"
                      : "flex min-h-0 flex-1 flex-col overflow-hidden",
                    resultsCollapsedDesktop ? "lg:hidden" : "",
                  ].join(" ")}
                >
                {targetResult ? (
                  <div className="max-h-[38vh] shrink-0 overflow-y-auto border-b border-fuchsia-500/35 bg-fuchsia-950/25 px-3 py-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-200/90">
                          Target scan results
                        </p>
                        <p className="text-sm font-medium text-white">
                          {targetResult.query}
                        </p>
                        <p className="text-xs text-white/55">
                          {targetResult.items.length} item line(s),{" "}
                          {targetResult.rooms.length} room(s) — does not change
                          main analysis
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTargetResult(null)}
                        className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15"
                      >
                        Dismiss
                      </button>
                    </div>
                    <ul className="space-y-2 text-xs text-white/85">
                      {targetResult.items.map((i) => (
                        <li
                          key={i.id}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5"
                        >
                          <span className="font-medium text-white">
                            {i.description}
                          </span>
                          <span className="text-white/55">
                            {" "}
                            × {i.quantity} {i.unit} · {i.category} · conf{" "}
                            {Number(i.confidence).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {targetResult.rooms.length > 0 ? (
                      <p className="mt-2 text-xs font-semibold text-white/70">
                        Rooms
                      </p>
                    ) : null}
                    <ul className="mt-1 space-y-1 text-xs text-white/75">
                      {targetResult.rooms.map((r) => (
                        <li key={r.id}>{r.room_name}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-hidden">
                  <AnalysisResultsPanel
                    items={analysisItems}
                    rooms={detectedRooms}
                    currentPage={currentPage}
                    manualMode={manualMode}
                    manualCounts={manualCounts}
                    selectedManualItemId={selectedManualItemId}
                    onSelectManualItem={setSelectedManualItemId}
                    onManualCountDelta={manualCountDelta}
                    onResetManualItemToAi={resetManualItemToAi}
                    onPatchItems={(updates) =>
                      setAnalysisItems((prev) => mergeById(prev, updates))
                    }
                    onPatchRooms={(updates) =>
                      setDetectedRooms((prev) => {
                        const m = new Map(updates.map((u) => [u.id, u]));
                        return prev.map((r) => m.get(r.id) ?? r);
                      })
                    }
                    roomAssignmentView={roomAssignmentView}
                    onRoomAssignmentViewChange={setRoomAssignmentView}
                    pageAnalysisWarning={
                      pageAnalysisWarnings[currentPage] ?? null
                    }
                    onRetryAnalysisPage={() =>
                      void analyzePageNumber(currentPage)
                    }
                    analyzeBusy={analyzeBusy}
                    onExportRoom={(room) => {
                      setTakeoffExportRoom(room);
                      setTakeoffExportOpen(true);
                    }}
                    projectId={projectId}
                    projectLabel={
                      project.project_name?.trim() ||
                      project.file_name ||
                      "Project"
                    }
                    onOpenTakeoffExport={() => {
                      setTakeoffExportRoom(null);
                      setTakeoffExportOpen(true);
                    }}
                    onExportAllTakeoffPdf={exportAllTakeoffPdf}
                    onExportAllTakeoffCsv={exportAllTakeoffCsv}
                    onRequestItemVerify={onRequestItemVerify}
                  />
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!pdfLoading && !pdfError && pdfDocs && pdfDocs.length > 0 && numPages > 0 ? (
        <div
          className="pointer-events-none fixed right-3 z-[46] flex flex-col gap-2 lg:hidden"
          style={{
            bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            onClick={() => analyzeThisPage()}
            disabled={analyzeBusy || legendBusy || symbolToolboxBusy}
            className="pointer-events-auto rounded-full border-2 border-sky-400/60 bg-sky-600/90 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-45"
          >
            Analyze
          </button>
          <button
            type="button"
            onClick={() => {
              setTakeoffExportRoom(null);
              setTakeoffExportOpen(true);
            }}
            disabled={
              analyzeBusy ||
              legendBusy ||
              symbolToolboxBusy ||
              analysisItems.length === 0
            }
            className="pointer-events-auto rounded-full border-2 border-emerald-400/60 bg-emerald-800/95 px-4 py-3 text-sm font-bold text-emerald-50 shadow-lg disabled:opacity-45"
          >
            Export
          </button>
        </div>
      ) : null}

      {recallPickerOpen ? (
        <div
          className="fixed inset-0 z-[212] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !recallPickerLoading)
              setRecallPickerOpen(false);
          }}
        >
          <div
            className="flex max-h-[min(90vh,32rem)] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-[#0a1628] shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recall-scan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-white/10 px-5 py-4">
              <h2
                id="recall-scan-title"
                className="text-lg font-semibold text-white"
              >
                Recall past scan
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Sessions group saves made within a few minutes (e.g. one batch
                run). Thumbnails show ✅ items, ⚠️ empty page, ○ not in session.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {recallPickerLoading && recallPickerSessions.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-white/60">
                  Loading saved scans…
                </p>
              ) : null}
              {recallPickerError ? (
                <p className="px-2 py-2 text-sm text-red-200">
                  {recallPickerError}
                </p>
              ) : null}
              {!recallPickerLoading &&
              !recallPickerError &&
              recallPickerSessions.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-white/55">
                  No saved scans yet. Run analysis to create history.
                </p>
              ) : null}
              <ul className="space-y-2">
                {recallPickerSessions.map((s) => {
                  const isActive = activeRecallSession?.id === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={recallPickerLoading}
                        onClick={() => applyRecallSession(s)}
                        className={[
                          "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                          isActive
                            ? "border-amber-400/60 bg-amber-950/35"
                            : "border-white/12 bg-white/[0.04] hover:border-amber-500/35 hover:bg-white/[0.07]",
                        ].join(" ")}
                      >
                        <p className="text-sm font-semibold text-white">
                          {s.label}
                          {isActive ? (
                            <span className="ml-2 text-[11px] font-normal text-amber-200/90">
                              (current)
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-white/60">
                          {formatRecallSessionDate(s.scanDate)}
                        </p>
                        <p className="mt-1 text-[11px] text-white/55">
                          Pages scanned: {s.pageCount} · Total items (lines):{" "}
                          {s.totalItemLines} · Mode: {s.scanMode ?? "—"}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="shrink-0 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setRecallPickerOpen(false)}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pageSummaryExportOpen ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pageSummaryExportBusy)
              setPageSummaryExportOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0a1628] p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="page-summary-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="page-summary-export-title"
              className="text-base font-semibold text-white"
            >
              Export page summary
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-white/65">
              One row per page with status, counts, last scan, and mode. PDF
              includes thumbnails.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={
                  pageSummaryExportBusy || !pdfDocs?.length || numPages < 1
                }
                onClick={() => void runPageSummaryPdfExport()}
                className="rounded-lg border border-sky-500/45 bg-sky-950/40 px-3 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-950/55 disabled:opacity-45"
              >
                {pageSummaryExportBusy ? "Preparing PDF…" : "Download PDF"}
              </button>
              <button
                type="button"
                disabled={pageSummaryExportData.rows.length === 0}
                onClick={() => runPageSummaryCsvExport()}
                className="rounded-lg border border-emerald-500/45 bg-emerald-950/40 px-3 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-950/55 disabled:opacity-45"
              >
                Download CSV
              </button>
              <button
                type="button"
                disabled={pageSummaryExportBusy}
                onClick={() => setPageSummaryExportOpen(false)}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {project ? (
        <TakeoffExportDialog
          open={takeoffExportOpen}
          onClose={() => {
            setTakeoffExportOpen(false);
            setTakeoffExportRoom(null);
          }}
          projectName={
            project.project_name?.trim() || project.file_name || "Project"
          }
          totalPagesScanned={numPages}
          sheets={sheets}
          docNumPages={
            pdfDocs?.map((d) => d.numPages) ??
            sheets.map((s) => Math.max(1, s.page_count ?? 1))
          }
          items={analysisItems}
          rooms={detectedRooms}
          manualCounts={manualCounts}
          manualMode={manualMode}
          filterRoom={takeoffExportRoom ?? undefined}
          title={
            takeoffExportRoom
              ? `Export Takeoff — ${takeoffExportRoom.room_name}`
              : "Export Takeoff Report"
          }
        />
      ) : null}

      {resetDialog ? (
        <div
          className="fixed inset-0 z-[225] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetSaving) setResetDialog(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-analysis-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="reset-analysis-title"
              className="text-lg font-semibold text-white"
            >
              Reset Analysis for Page {currentPage}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              Would you like to save the current results before resetting?
            </p>
            <p className="mt-2 text-sm text-white/65">
              Current scan has {resetDialog.itemCount} item line(s) and{" "}
              {resetDialog.roomCount} room(s) detected.
            </p>
            <label className="mt-4 block text-xs font-medium text-white/70">
              Scan name
              <input
                type="text"
                value={resetScanName}
                onChange={(e) => setResetScanName(e.target.value)}
                disabled={resetSaving}
                className="mt-1 w-full rounded-lg border border-white/20 bg-[#071422] px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={resetSaving}
                onClick={() => setResetDialog(null)}
                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetSaving}
                onClick={() => void resetWithoutSaving()}
                className="rounded-lg border border-amber-500/45 bg-amber-950/40 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/55 disabled:opacity-50"
              >
                Reset Without Saving
              </button>
              <button
                type="button"
                disabled={resetSaving}
                onClick={() => void saveScanAndReset()}
                className="rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {resetSaving ? "Working…" : "Save and Reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {targetDialogOpen ? (
        <div
          className="fixed inset-0 z-[225] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !targetLoading)
              setTargetDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="target-scan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="target-scan-title"
              className="text-lg font-semibold text-white"
            >
              Target Scan — Search for Specific Items
            </h2>
            <p className="mt-2 text-sm text-white/65">
              What would you like to look for?
            </p>
            <input
              type="text"
              value={targetQuery}
              onChange={(e) => setTargetQuery(e.target.value)}
              disabled={targetLoading}
              placeholder="e.g. GFCI receptacles, smoke detectors, EV charger…"
              className="mt-3 w-full rounded-lg border border-fuchsia-500/35 bg-[#071422] px-3 py-2.5 text-sm text-white placeholder:text-white/35"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runTargetScan();
              }}
            />
            <p className="mt-2 text-xs text-white/45">
              Examples: GFCI receptacles only · All smoke detectors · Panel
              schedule · EV charger circuits · All lighting fixtures
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={targetLoading}
                onClick={() => setTargetDialogOpen(false)}
                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={targetLoading}
                onClick={() => void runTargetScan()}
                className="rounded-lg border border-fuchsia-500/50 bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-50"
              >
                {targetLoading ? "Running…" : "Run Target Scan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ScanHistoryPanel
        open={scanHistoryOpen}
        onClose={() => setScanHistoryOpen(false)}
        projectId={projectId}
        projectName={name}
        reloadToken={scanReloadToken}
        onViewScan={applyViewScan}
      />

      <ProjectRoomScanDialog
        open={roomScanOpen}
        onClose={() => setRoomScanOpen(false)}
        data={roomScanData}
        scanPage={roomScanDialogPage}
        projectId={projectId}
        projectLabel={name}
        autosaveEnabled={roomScanAutosave}
        onScansUpdated={() => void reloadRoomScanHistory()}
        historyScans={roomScanHistory}
        selectedHistoryId={selectedRoomScanId}
        onSelectHistoryScan={(id) => {
          handleSelectHistoryScan(id);
        }}
        savedAtLabel={roomScanSavedAtLabel}
      />

      {symbolMatchState ? (
        <div className="fixed bottom-6 right-6 z-[180] max-w-[240px] rounded-xl border border-sky-500/40 bg-[#071422]/95 p-3 shadow-2xl backdrop-blur-md">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
            Match assist
          </p>
          {matchRefB64 ? (
            <div className="rounded-lg border border-white/15 bg-white p-1">
              <img
                src={`data:image/png;base64,${matchRefB64}`}
                alt=""
                className="mx-auto max-h-20 w-full object-contain"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/35 bg-[#0a1628] p-2.5">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                By description
              </p>
              <p className="mt-1.5 text-center text-[12px] font-medium leading-snug text-white">
                {symbolMatchState.symbolDescription}
              </p>
              <p className="mt-2 text-center text-[10px] leading-snug text-amber-100/85">
                No reference image — you will count by description name only.
              </p>
              <button
                type="button"
                onClick={leaveMatchToCaptureReference}
                className="mt-2 w-full rounded-md border border-sky-500/40 bg-sky-950/50 py-1.5 text-center text-[10px] font-semibold text-sky-200 hover:bg-sky-950/70"
              >
                Capture reference first for visual assist
              </button>
            </div>
          )}
          <p className="pointer-events-none mt-2 text-[11px] font-medium text-sky-100/95">
            Zoom in to{" "}
            {symbolMatchZoomPercent(symbolMatchState.category)}% for best
            accuracy
          </p>
          <p className="pointer-events-none mt-1 text-[11px] leading-snug text-white/70">
            {symbolMatchTip(symbolMatchState.category)}
          </p>
        </div>
      ) : null}

      {matchRoomDialog ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingSymbolMatch)
              setMatchRoomDialog(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-room-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2
              id="match-room-title"
              className="text-lg font-semibold text-white"
            >
              Room assignment
            </h2>
            <p className="mt-2 text-sm text-white/65">
              {matchRoomDialog.dots.length} mark
              {matchRoomDialog.dots.length === 1 ? "" : "s"} on page{" "}
              {currentPage}. How should these be recorded?
            </p>
            <div className="mt-4 space-y-3 text-sm text-white/85">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="matchRoomMode"
                  checked={matchRoomMode === "single"}
                  onChange={() => setMatchRoomMode("single")}
                  className="h-4 w-4"
                />
                Single room (all marks)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="matchRoomMode"
                  checked={matchRoomMode === "spread"}
                  onChange={() => setMatchRoomMode("spread")}
                  className="h-4 w-4"
                />
                Spread across multiple rooms (per mark)
              </label>
            </div>
            {matchRoomMode === "single" ? (
              <label className="mt-4 block text-xs font-medium text-white/70">
                Room
                <select
                  value={matchSingleRoom}
                  onChange={(e) => setMatchSingleRoom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/20 bg-[#071422] px-2 py-2 text-sm text-white"
                >
                  <option value="UNASSIGNED">Not specified</option>
                  {legendRoomNameOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                {matchRoomDialog.dots.map((d, i) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 text-xs text-white/80"
                  >
                    <span className="w-8 tabular-nums text-white/55">
                      #{d.n}
                    </span>
                    <select
                      value={matchSpreadRooms[i] ?? "UNASSIGNED"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMatchSpreadRooms((prev) => {
                          const next = [...prev];
                          next[i] = v;
                          return next;
                        });
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-white/20 bg-[#071422] px-2 py-1.5 text-sm text-white"
                    >
                      <option value="UNASSIGNED">Not specified</option>
                      {legendRoomNameOptions.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={savingSymbolMatch}
                onClick={() => setMatchRoomDialog(null)}
                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSymbolMatch}
                onClick={() => void submitMatchRoomDialog()}
                className="rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {savingSymbolMatch ? "Saving…" : "Save counts"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SymbolLegendPanel
        open={legendPanelOpen}
        onClose={() => setLegendPanelOpen(false)}
        projectId={projectId}
        symbols={projectSymbols}
        onSymbolUpdated={onProjectSymbolUpdated}
        onSymbolsRefresh={setProjectSymbols}
        onStartCapture={startSymbolCapture}
        onStartCaptureFromLegend={startSymbolCaptureFromLegend}
        onStartMatch={startSymbolMatch}
        legendRescanBusy={legendManualRescanBusy}
        onLegendRescan={runLegendRescan}
      />

      <LinkToJobDialog
        open={jobLinkOpen}
        onOpenChange={setJobLinkOpen}
        attachmentType="blueprint_project"
        attachmentId={projectId}
        attachmentLabel={name}
      />
    </div>
  );
}
