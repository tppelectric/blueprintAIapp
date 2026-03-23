/** Scan modes for blueprint analysis (UI + api_usage.scan_type). */

export type ScanModeId = "quick" | "standard" | "deep" | "manual";

export type ScanModeMeta = {
  id: ScanModeId;
  label: string;
  subtitle: string;
  estSecondsPerPage: number;
  /** Estimated USD per page (display + api_usage). */
  claudeCostPerPage: number;
  openaiCostPerPage: number;
  recommended?: boolean;
};

export const SCAN_MODES: readonly ScanModeMeta[] = [
  {
    id: "quick",
    label: "Quick Scan",
    subtitle: "Claude only · ~30 sec/page",
    estSecondsPerPage: 30,
    claudeCostPerPage: 0.04,
    openaiCostPerPage: 0,
  },
  {
    id: "standard",
    label: "Standard Scan",
    subtitle: "Claude + GPT-4o · ~60 sec/page",
    estSecondsPerPage: 60,
    claudeCostPerPage: 0.04,
    openaiCostPerPage: 0.03,
    recommended: true,
  },
  {
    id: "deep",
    label: "Deep Scan",
    subtitle:
      "Claude + GPT-4o (extended) · audit prompt after batch completes",
    estSecondsPerPage: 75,
    claudeCostPerPage: 0.05,
    openaiCostPerPage: 0.05,
  },
  {
    id: "manual",
    label: "Manual Only",
    subtitle: "No AI · Click to count",
    estSecondsPerPage: 0,
    claudeCostPerPage: 0,
    openaiCostPerPage: 0,
  },
] as const;

export function scanModeById(id: ScanModeId): ScanModeMeta {
  const m = SCAN_MODES.find((x) => x.id === id);
  if (!m) return SCAN_MODES[1];
  return m;
}

export function totalCostPerPage(mode: ScanModeMeta): number {
  return mode.claudeCostPerPage + mode.openaiCostPerPage;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatDurationSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

/** DB value for api_usage.scan_type (manual included for completeness). */
export function scanTypeForDb(id: ScanModeId): string {
  return id;
}
