/**
 * Per-project legend auto-scan preference (localStorage).
 * - skip: never auto-run legend detection for this project
 * - later: user dismissed the prompt; no auto-scan until they use "Scan legend"
 */
const KEY = (projectId: string) => `bp:legendPref:${projectId}`;

export type LegendPrefStored = "skip" | "later";

export function getLegendScanPref(projectId: string): LegendPrefStored | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY(projectId));
    if (v === "skip" || v === "later") return v;
    return null;
  } catch {
    return null;
  }
}

export function setLegendScanPref(
  projectId: string,
  pref: LegendPrefStored,
): void {
  try {
    localStorage.setItem(KEY(projectId), pref);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLegendScanPref(projectId: string): void {
  try {
    localStorage.removeItem(KEY(projectId));
  } catch {
    /* ignore */
  }
}
