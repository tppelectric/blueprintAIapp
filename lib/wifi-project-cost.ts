import type { WifiAnalyzerResults } from "@/lib/wifi-analyzer-engine";

export type LaborCostLine = {
  id: string;
  /** Table label including hours/drops context */
  taskLabel: string;
  hours: number;
  rate: number;
  lineTotal: number;
};

export type CostMaterialRow = {
  key: string;
  item: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
};

export type ProjectCostSummary = {
  laborLines: LaborCostLine[];
  laborSubtotal: number;
  totalLaborHours: number;
  materialSubtotalMid: number;
  materialRows: CostMaterialRow[];
  /** Grand total range (material MSRP variance + labor at user rate). */
  totalLow: number;
  totalHigh: number;
};

function bomLine(results: WifiAnalyzerResults, id: string) {
  return (results.hardwareBomLines ?? []).find((x) => x.id === id);
}

/**
 * Rows for cost card / PDF / CSV: Item | Qty | Unit | Unit cost | Total
 */
export function buildCostCardMaterialRows(
  results: WifiAnalyzerResults,
): CostMaterialRow[] {
  const mesh = bomLine(results, "mesh-note");
  const rows: CostMaterialRow[] = [];

  const inL = bomLine(results, "indoor-ap");
  const outL = bomLine(results, "outdoor-ap");
  if (inL || outL) {
    const qty = (inL?.quantity ?? 0) + (outL?.quantity ?? 0);
    const total = (inL?.lineTotal ?? 0) + (outL?.lineTotal ?? 0);
    const parts: string[] = [];
    if (inL) parts.push(inL.description);
    if (outL) parts.push(outL.description);
    rows.push({
      key: "aps",
      item: `Wireless APs — ${parts.join(" · ")}`,
      qty,
      unit: "EA",
      unitCost: qty > 0 ? Math.round((total / qty) * 100) / 100 : 0,
      total,
    });
  }

  const sw = bomLine(results, "poe-switch");
  const oc = bomLine(results, "omada-controller");
  if (mesh) {
    rows.push({
      key: "switch",
      item: "PoE switch — Not required (mesh system)",
      qty: 0,
      unit: "EA",
      unitCost: 0,
      total: 0,
    });
    rows.push({
      key: "gateway",
      item: "Network gateway — Included in mesh router",
      qty: 0,
      unit: "EA",
      unitCost: 0,
      total: 0,
    });
  } else {
    const swTot = (sw?.lineTotal ?? 0) + (oc?.lineTotal ?? 0);
    const swDesc = [sw?.description, oc?.description].filter(Boolean).join(" · ") || "—";
    rows.push({
      key: "switch",
      item: `PoE switch — ${swDesc}`,
      qty: sw || oc ? 1 : 0,
      unit: "EA",
      unitCost: sw || oc ? swTot : 0,
      total: swTot,
    });
    const gw = bomLine(results, "gateway");
    rows.push({
      key: "gateway",
      item: gw
        ? `Network gateway — ${gw.description}`
        : "Network gateway — (see plan notes / existing firewall)",
      qty: gw ? gw.quantity : 0,
      unit: "EA",
      unitCost: gw?.unitPrice ?? 0,
      total: gw?.lineTotal ?? 0,
    });
  }

  const cat6 = bomLine(results, "cat6");
  if (cat6) {
    rows.push({
      key: "cat6",
      item: "CAT6 cable",
      qty: cat6.quantity,
      unit: "LF",
      unitCost: cat6.unitPrice,
      total: cat6.lineTotal,
    });
  }
  const lv = bomLine(results, "lv-bracket");
  if (lv) {
    rows.push({
      key: "lv-bracket",
      item: "Low voltage brackets",
      qty: lv.quantity,
      unit: "EA",
      unitCost: lv.unitPrice,
      total: lv.lineTotal,
    });
  }
  const ks = bomLine(results, "keystone");
  if (ks) {
    rows.push({
      key: "keystone",
      item: "RJ45 keystone jacks",
      qty: ks.quantity,
      unit: "EA",
      unitCost: ks.unitPrice,
      total: ks.lineTotal,
    });
  }
  const patch = bomLine(results, "patch");
  if (patch) {
    rows.push({
      key: "patch",
      item: "Patch cables",
      qty: patch.quantity,
      unit: "EA",
      unitCost: patch.unitPrice,
      total: patch.lineTotal,
    });
  }

  return rows;
}

/**
 * Labor dollars at a single hourly rate; materials use mid subtotal with ±15% / +20% for range.
 */
export function buildProjectCostSummary(
  results: WifiAnalyzerResults,
  laborRatePerHour: number,
): ProjectCostSummary {
  const lh = results.laborHours;
  const drops = results.cat6Drops;
  const keys = [
    "cableRoughInHours",
    "apMountTerminateHours",
    "switchGatewaySetupHours",
    "networkConfigHours",
    "testingWalkthroughHours",
  ] as const;

  const taskLabels: Record<(typeof keys)[number], string> = {
    cableRoughInHours: `Cable rough-in (${drops} drops)`,
    apMountTerminateHours: "AP mounting",
    switchGatewaySetupHours: "Switch / gateway setup",
    networkConfigHours: "Network configuration",
    testingWalkthroughHours: "Testing & walkthrough",
  };

  const rate = Math.max(0, laborRatePerHour);
  const laborLines: LaborCostLine[] = keys.map((k) => {
    const hours = lh[k];
    const lineTotal = Math.round(hours * rate * 100) / 100;
    return {
      id: k,
      taskLabel: taskLabels[k],
      hours,
      rate,
      lineTotal,
    };
  });

  const laborSubtotal =
    Math.round(laborLines.reduce((s, L) => s + L.lineTotal, 0) * 100) / 100;

  const matMid = results.materialSubtotalMid ?? 0;
  const matLow = matMid * 0.85;
  const matHigh = matMid * 1.2;

  const materialRows = buildCostCardMaterialRows(results);

  return {
    laborLines,
    laborSubtotal,
    totalLaborHours: lh.totalLaborHours,
    materialSubtotalMid: matMid,
    materialRows,
    totalLow: Math.round(matLow + laborSubtotal),
    totalHigh: Math.round(matHigh + laborSubtotal),
  };
}

export function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Unit costs (e.g. $0.25/LF) and line totals with cents when needed. */
export function formatMoneyCell(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded.toLocaleString()}`;
  return `$${rounded.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
