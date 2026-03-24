import { defaultEquipOptionId } from "@/lib/pb-equipment-options";
import type { PBEquipSlot, ProjectCostSummary } from "@/lib/wifi-project-cost";
import type { VendorChoice } from "@/lib/wifi-analyzer-engine";

export function newPbId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `pb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type MaterialPreset = {
  id: string;
  label: string;
  unit: string;
  defaultUnitCost: number;
};

export type LaborPreset = {
  id: string;
  label: string;
  defaultHours: number;
};

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "cat6", label: "CAT6 Cable", unit: "LF", defaultUnitCost: 0.25 },
  { id: "cat6a", label: "CAT6A Cable", unit: "LF", defaultUnitCost: 0.35 },
  { id: "lv-bracket", label: "Low Voltage Bracket", unit: "EA", defaultUnitCost: 5 },
  { id: "keystone", label: "RJ45 Keystone Jack", unit: "EA", defaultUnitCost: 4 },
  { id: "rj45-conn", label: "RJ45 Connector", unit: "EA", defaultUnitCost: 0.75 },
  { id: "patch1", label: "Patch Cable 1ft", unit: "EA", defaultUnitCost: 3 },
  { id: "patch3", label: "Patch Cable 3ft", unit: "EA", defaultUnitCost: 5 },
  { id: "patch6", label: "Patch Cable 6ft", unit: "EA", defaultUnitCost: 8 },
  { id: "coax", label: "Coax Cable RG6", unit: "LF", defaultUnitCost: 0.4 },
  { id: "hdmi", label: "HDMI Cable", unit: "LF", defaultUnitCost: 1.2 },
  { id: "sp16", label: "Speaker Wire 16/2", unit: "LF", defaultUnitCost: 0.35 },
  { id: "sp14", label: "Speaker Wire 14/2", unit: "LF", defaultUnitCost: 0.45 },
  { id: "emt12", label: `Conduit 1/2" EMT`, unit: "LF", defaultUnitCost: 1.5 },
  { id: "emt34", label: `Conduit 3/4" EMT`, unit: "LF", defaultUnitCost: 2 },
  { id: "wiremold", label: "Wire Mold", unit: "LF", defaultUnitCost: 2.5 },
  { id: "smb", label: "Surface Mount Box", unit: "EA", defaultUnitCost: 8 },
  { id: "wall-plate", label: "Keystone Wall Plate", unit: "EA", defaultUnitCost: 3 },
  { id: "custom", label: "Custom Item", unit: "EA", defaultUnitCost: 0 },
];

export const LABOR_PRESETS: LaborPreset[] = [
  { id: "roughin", label: "Cable Rough-In (per drop)", defaultHours: 0.5 },
  { id: "term", label: "Cable Termination (per drop)", defaultHours: 0.25 },
  { id: "ap", label: "AP Mounting and Setup", defaultHours: 0.75 },
  { id: "switch", label: "Switch Installation", defaultHours: 1.5 },
  { id: "gw", label: "Gateway/Router Setup", defaultHours: 1 },
  { id: "netcfg", label: "Network Configuration", defaultHours: 1.5 },
  { id: "survey", label: "Site Survey", defaultHours: 2 },
  { id: "prog", label: "Programming and Setup", defaultHours: 1 },
  { id: "smarthome", label: "Smart Home Device Install", defaultHours: 1 },
  { id: "panel", label: "Panel Schedule Update", defaultHours: 0.75 },
  { id: "trouble-h", label: "Troubleshooting (per hour)", defaultHours: 1 },
  { id: "travel-h", label: "Travel Time (per hour)", defaultHours: 1 },
  { id: "pm-h", label: "Project Management (per hour)", defaultHours: 1 },
  { id: "app-h", label: "Apprentice Labor (per hour)", defaultHours: 1 },
  { id: "lead-h", label: "Lead Technician (per hour)", defaultHours: 1 },
  { id: "custom", label: "Custom Task", defaultHours: 1 },
];

export type PBMaterialLine = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  /** Percent; null = use overall material markup */
  markupPct: number | null;
  /** When set, equipment dropdown applies (Wi‑Fi BOM lines). */
  bomSlot?: PBEquipSlot | null;
  equipOptionId?: string | null;
};

export type PBLaborLine = {
  id: string;
  task: string;
  hours: number;
  techs: number | null;
  ratePerHour: number | null;
};

export type ProjectBreakdownState = {
  materialMarkupPct: number;
  technicianCount: number;
  laborRatePerHour: number;
  laborMarkupPct: number;
  salesTaxPct: number;
  wifiVendor: VendorChoice | null;
  materials: PBMaterialLine[];
  labor: PBLaborLine[];
};

export const defaultProjectBreakdownState = (): ProjectBreakdownState => ({
  materialMarkupPct: 20,
  technicianCount: 1,
  laborRatePerHour: 85,
  laborMarkupPct: 0,
  salesTaxPct: 8.125,
  wifiVendor: null,
  materials: [],
  labor: [],
});

export function materialLineCost(m: PBMaterialLine): number {
  return Math.round(m.qty * m.unitCost * 100) / 100;
}

export function materialLineMarkupPct(
  m: PBMaterialLine,
  overall: number,
): number {
  return m.markupPct ?? overall;
}

export function materialLineCustomerPrice(
  m: PBMaterialLine,
  overallMarkup: number,
): number {
  const base = materialLineCost(m);
  const pct = materialLineMarkupPct(m, overallMarkup);
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}

export function materialLineProfit(
  m: PBMaterialLine,
  overallMarkup: number,
): number {
  const base = materialLineCost(m);
  const price = materialLineCustomerPrice(m, overallMarkup);
  return Math.round((price - base) * 100) / 100;
}

export function laborLineCost(
  L: PBLaborLine,
  defaultTechs: number,
  defaultRate: number,
): number {
  const techs = L.techs ?? defaultTechs;
  const rate = L.ratePerHour ?? defaultRate;
  return Math.round(L.hours * techs * rate * 100) / 100;
}

export function laborLineCustomerPrice(
  L: PBLaborLine,
  state: ProjectBreakdownState,
): number {
  const cost = laborLineCost(
    L,
    state.technicianCount,
    state.laborRatePerHour,
  );
  return (
    Math.round(cost * (1 + state.laborMarkupPct / 100) * 100) / 100
  );
}

export function laborLineProfit(L: PBLaborLine, state: ProjectBreakdownState): number {
  const cost = laborLineCost(
    L,
    state.technicianCount,
    state.laborRatePerHour,
  );
  const price = laborLineCustomerPrice(L, state);
  return Math.round((price - cost) * 100) / 100;
}

export type PBCategoryTotals = {
  cost: number;
  markupDollars: number;
  customerPrice: number;
  profit: number;
};

export function sumMaterialTotals(state: ProjectBreakdownState): PBCategoryTotals {
  let cost = 0;
  let customer = 0;
  for (const m of state.materials) {
    cost += materialLineCost(m);
    customer += materialLineCustomerPrice(m, state.materialMarkupPct);
  }
  cost = Math.round(cost * 100) / 100;
  customer = Math.round(customer * 100) / 100;
  const markupDollars = Math.round((customer - cost) * 100) / 100;
  return {
    cost,
    markupDollars,
    customerPrice: customer,
    profit: markupDollars,
  };
}

export function sumLaborTotals(state: ProjectBreakdownState): PBCategoryTotals {
  let cost = 0;
  let customer = 0;
  for (const L of state.labor) {
    cost += laborLineCost(
      L,
      state.technicianCount,
      state.laborRatePerHour,
    );
    customer += laborLineCustomerPrice(L, state);
  }
  cost = Math.round(cost * 100) / 100;
  customer = Math.round(customer * 100) / 100;
  const markupDollars = Math.round((customer - cost) * 100) / 100;
  return {
    cost,
    markupDollars,
    customerPrice: customer,
    profit: markupDollars,
  };
}

export function grandTotals(state: ProjectBreakdownState): {
  materials: PBCategoryTotals;
  labor: PBCategoryTotals;
  /** Materials customer price after markup (sales tax base). */
  materialsCustomerAfterMarkup: number;
  materialsTaxAmount: number;
  materialsWithTaxCustomer: number;
  laborCustomerPrice: number;
  /** Materials + labor customer prices before sales tax on materials. */
  subtotalCustomer: number;
  /** Same as materialsTaxAmount (tax on materials sell only). */
  taxAmount: number;
  grandCustomer: number;
  totalProfit: number;
  overallMarginPct: number;
  /** Your hard cost (materials + labor), excludes sales tax. */
  totalCostBasis: number;
  totalCustomerPrice: number;
  totalLow: number;
  totalHigh: number;
} {
  const materials = sumMaterialTotals(state);
  const labor = sumLaborTotals(state);

  const materialsCustomerAfterMarkup = materials.customerPrice;
  const materialsTaxAmount =
    Math.round(
      materialsCustomerAfterMarkup * (state.salesTaxPct / 100) * 100,
    ) / 100;
  const materialsWithTaxCustomer =
    Math.round((materialsCustomerAfterMarkup + materialsTaxAmount) * 100) / 100;

  const laborCustomerPrice = labor.customerPrice;
  const subtotalCustomer =
    Math.round(
      (materialsCustomerAfterMarkup + laborCustomerPrice) * 100,
    ) / 100;

  const grandCustomer =
    Math.round((materialsWithTaxCustomer + laborCustomerPrice) * 100) / 100;

  const totalProfit =
    Math.round((materials.profit + labor.profit) * 100) / 100;
  const overallMarginPct =
    grandCustomer > 0
      ? Math.round((totalProfit / grandCustomer) * 1000) / 10
      : 0;

  const totalCostBasis =
    Math.round((materials.cost + labor.cost) * 100) / 100;
  const totalCustomerPrice = grandCustomer;
  const totalLow = totalCostBasis;
  const totalHigh = grandCustomer;

  return {
    materials,
    labor,
    materialsCustomerAfterMarkup,
    materialsTaxAmount,
    materialsWithTaxCustomer,
    laborCustomerPrice,
    subtotalCustomer,
    taxAmount: materialsTaxAmount,
    grandCustomer,
    totalProfit,
    overallMarginPct,
    totalCostBasis,
    totalCustomerPrice,
    totalLow,
    totalHigh,
  };
}

export function seedProjectBreakdownFromWifi(
  summary: ProjectCostSummary,
  overrides?: Partial<
    Pick<
      ProjectBreakdownState,
      | "materialMarkupPct"
      | "technicianCount"
      | "laborRatePerHour"
      | "laborMarkupPct"
      | "salesTaxPct"
      | "wifiVendor"
    >
  >,
): ProjectBreakdownState {
  const base = defaultProjectBreakdownState();
  const materialMarkupPct =
    overrides?.materialMarkupPct ?? base.materialMarkupPct;
  const technicianCount = overrides?.technicianCount ?? base.technicianCount;
  const laborRatePerHour = overrides?.laborRatePerHour ?? base.laborRatePerHour;
  const laborMarkupPct = overrides?.laborMarkupPct ?? base.laborMarkupPct;
  const salesTaxPct = overrides?.salesTaxPct ?? base.salesTaxPct;
  const wifiVendor = overrides?.wifiVendor ?? null;

  const materials: PBMaterialLine[] = summary.materialRows.map((row) => ({
    id: newPbId(),
    description: row.item,
    qty: row.qty,
    unit: row.unit,
    unitCost: row.unitCost,
    markupPct: null,
    bomSlot: row.bomSlot ?? null,
    equipOptionId: row.bomSlot
      ? defaultEquipOptionId(row.bomSlot, wifiVendor, row.unitCost)
      : null,
  }));

  const labor: PBLaborLine[] = summary.laborLines.map((L) => ({
    id: newPbId(),
    task: L.taskLabel,
    hours: L.hours,
    techs: null,
    ratePerHour: null,
  }));

  return {
    materialMarkupPct,
    technicianCount,
    laborRatePerHour,
    laborMarkupPct,
    salesTaxPct,
    wifiVendor,
    materials,
    labor,
  };
}
