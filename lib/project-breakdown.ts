import { defaultEquipOptionId } from "@/lib/pb-equipment-options";
import type { AvResults } from "@/lib/av-analyzer-engine";
import type { ShResults } from "@/lib/smarthome-analyzer-engine";
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

/** AV Analyzer — materials dropdown presets */
export const AV_MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "sp5", label: `In-ceiling speaker 5.25"`, unit: "EA", defaultUnitCost: 120 },
  { id: "sp6", label: `In-ceiling speaker 6.5"`, unit: "EA", defaultUnitCost: 220 },
  { id: "sp8", label: `In-ceiling speaker 8"`, unit: "EA", defaultUnitCost: 380 },
  { id: "out-pair", label: "Outdoor speaker pair", unit: "EA", defaultUnitCost: 450 },
  { id: "sw16", label: "Speaker wire 16/2 CL2", unit: "LF", defaultUnitCost: 0.35 },
  { id: "sw14", label: "Speaker wire 14/2 CL2", unit: "LF", defaultUnitCost: 0.45 },
  { id: "sw12", label: "Speaker wire 12/2 CL2", unit: "LF", defaultUnitCost: 0.65 },
  { id: "hdmi21", label: "HDMI 2.1 cable", unit: "LF", defaultUnitCost: 1.4 },
  { id: "cat6", label: "Cat6 cable", unit: "LF", defaultUnitCost: 0.28 },
  { id: "hdbt", label: "HDBaseT extender kit", unit: "EA", defaultUnitCost: 420 },
  { id: "lvb", label: "Low voltage bracket", unit: "EA", defaultUnitCost: 5 },
  { id: "vol", label: "Speaker volume control", unit: "EA", defaultUnitCost: 85 },
  { id: "avr", label: "AV receiver", unit: "EA", defaultUnitCost: 899 },
  { id: "sonosamp", label: "Sonos Amp", unit: "EA", defaultUnitCost: 699 },
  { id: "mza", label: "Multi-zone amplifier", unit: "EA", defaultUnitCost: 2499 },
  { id: "custom", label: "Custom item", unit: "EA", defaultUnitCost: 0 },
];

export const AV_LABOR_PRESETS: LaborPreset[] = [
  { id: "sp-rough", label: "Speaker rough-in (per location)", defaultHours: 1.5 },
  { id: "sp-trim", label: "Speaker trim and aim (each)", defaultHours: 0.5 },
  { id: "disp-mount", label: "Display mounting", defaultHours: 2 },
  { id: "proj", label: "Projector installation", defaultHours: 4 },
  { id: "screen", label: "Screen installation", defaultHours: 2 },
  { id: "rack", label: "Equipment rack build", defaultHours: 6 },
  { id: "amp-zone", label: "Amplifier wiring (per zone)", defaultHours: 1 },
  {
    id: "prog",
    label: "System programming (base + per zone in notes)",
    defaultHours: 2,
  },
  { id: "cable-rough", label: "Cable rough-in (per run)", defaultHours: 1 },
  { id: "test", label: "Testing and demo", defaultHours: 2 },
  { id: "custom", label: "Custom task", defaultHours: 1 },
];

export const SMARTHOME_MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "ra3-dim", label: "Lutron RadioRA3 dimmer", unit: "EA", defaultUnitCost: 185 },
  { id: "ra3-sw", label: "Lutron RadioRA3 switch", unit: "EA", defaultUnitCost: 165 },
  { id: "caseta-dim", label: "Lutron Caseta dimmer", unit: "EA", defaultUnitCost: 65 },
  { id: "hw-dim", label: "Lutron HomeWorks dimmer", unit: "EA", defaultUnitCost: 450 },
  { id: "shade", label: "Motorized shade (per shade)", unit: "EA", defaultUnitCost: 1200 },
  { id: "tstat", label: "Smart thermostat", unit: "EA", defaultUnitCost: 280 },
  { id: "cam-in", label: "IP camera indoor", unit: "EA", defaultUnitCost: 220 },
  { id: "cam-out", label: "IP camera outdoor PTZ", unit: "EA", defaultUnitCost: 850 },
  { id: "lock", label: "Smart door lock", unit: "EA", defaultUnitCost: 320 },
  { id: "mot", label: "Motion sensor", unit: "EA", defaultUnitCost: 85 },
  { id: "dw", label: "Door/window sensor", unit: "EA", defaultUnitCost: 45 },
  { id: "ea1", label: "Control4 EA-1 controller", unit: "EA", defaultUnitCost: 650 },
  { id: "ea3", label: "Control4 EA-3 controller", unit: "EA", defaultUnitCost: 1200 },
  { id: "ca10", label: "Control4 CA-10 controller", unit: "EA", defaultUnitCost: 4500 },
  { id: "c4-ts", label: "Control4 touchscreen", unit: "EA", defaultUnitCost: 950 },
  { id: "josh-mic", label: "Josh.ai microphone", unit: "EA", defaultUnitCost: 599 },
  { id: "sw8", label: "Network switch 8-port PoE", unit: "EA", defaultUnitCost: 320 },
  { id: "sw16", label: "Network switch 16-port PoE", unit: "EA", defaultUnitCost: 520 },
  { id: "custom", label: "Custom item", unit: "EA", defaultUnitCost: 0 },
];

export const SMARTHOME_LABOR_PRESETS: LaborPreset[] = [
  { id: "kp-rough", label: "Keypad/dimmer rough-in (each)", defaultHours: 0.5 },
  { id: "kp-trim", label: "Keypad/dimmer trim-out (each)", defaultHours: 0.25 },
  { id: "cam", label: "Camera installation (each)", defaultHours: 1.5 },
  { id: "ctrl", label: "Controller installation", defaultHours: 2 },
  { id: "shade", label: "Shade installation (each)", defaultHours: 1.5 },
  { id: "c4prog", label: "Control4 programming (typical range)", defaultHours: 16 },
  { id: "lut-prog", label: "Lutron programming", defaultHours: 4 },
  { id: "hk", label: "HomeKit setup", defaultHours: 2 },
  { id: "josh", label: "Josh.ai setup", defaultHours: 6 },
  { id: "net", label: "Network configuration", defaultHours: 2 },
  { id: "walk", label: "Testing and walkthrough", defaultHours: 2 },
  { id: "custom", label: "Custom task", defaultHours: 1 },
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

export function seedProjectBreakdownFromAv(r: AvResults): ProjectBreakdownState {
  const base = defaultProjectBreakdownState();
  const materials: PBMaterialLine[] = [];
  const addM = (
    description: string,
    qty: number,
    unit: string,
    unitCost: number,
  ) => {
    if (qty <= 0) return;
    materials.push({
      id: newPbId(),
      description,
      qty,
      unit,
      unitCost,
      markupPct: null,
      bomSlot: null,
      equipOptionId: null,
    });
  };

  const m = r.materials;
  addM(`5.25" in-ceiling speaker`, m.speakers525, "EA", 120);
  addM(`6.5" in-ceiling speaker`, m.speakers65, "EA", 220);
  addM(`8" in-ceiling speaker`, m.speakers8, "EA", 380);
  addM("Outdoor speaker pair", m.outdoorPairs, "EA", 450);
  addM("Speaker wire 16/2 CL2", m.speakerWire16Lf, "LF", 0.35);
  addM("Speaker wire 14/2 CL2", m.speakerWire14Lf, "LF", 0.45);
  addM("Speaker wire 12/2 CL2", m.speakerWire12Lf, "LF", 0.65);
  addM("HDMI 2.1 cable", m.hdmiLf, "LF", 1.4);
  addM("Cat6 cable", m.cat6Lf, "LF", 0.28);
  addM("HDBaseT extender kit", m.hdbasetKits, "EA", 420);
  addM("Low voltage bracket", m.lvBrackets, "EA", 5);
  addM("Speaker volume control", m.volumeControls, "EA", 85);
  addM("AV receiver", m.avReceivers, "EA", 899);
  addM("Sonos Amp", m.sonosAmps, "EA", 699);
  addM("Multi-zone amplifier", m.multiZoneAmps, "EA", 2499);
  for (const d of m.displays) {
    addM(`Display ~${d.inches}"`, d.qty, "EA", d.inches >= 85 ? 2200 : 1200);
  }
  addM("Projector (allowance)", m.projectorQty, "EA", 3500);

  const labor: PBLaborLine[] = [];
  const addL = (task: string, hours: number) => {
    if (hours <= 0) return;
    labor.push({
      id: newPbId(),
      task,
      hours,
      techs: null,
      ratePerHour: null,
    });
  };
  if (r.totalSpeakers > 0) {
    addL("Speaker rough-in (per location)", 1.5 * r.totalSpeakers);
    addL("Speaker trim and aim (each)", 0.5 * r.totalSpeakers);
  }
  if (r.totalDisplays > 0) {
    addL("Display mounting", 2 * r.totalDisplays);
  }
  if (m.projectorQty > 0) {
    addL("Projector installation", 4 * m.projectorQty);
    addL("Screen installation", 2 * m.projectorQty);
  }
  addL("Equipment rack build", 6);
  addL("Amplifier wiring (per zone)", 1 * r.ampZones);
  addL("System programming (base + zones)", 2 + 0.5 * r.ampZones);
  addL(
    "Cable rough-in (per run)",
    r.roomRows.filter((x) => x.speakerQty > 0).length * 2,
  );
  addL("Testing and demo", 2);

  return { ...base, materials, labor };
}

export function seedProjectBreakdownFromSmartHome(
  r: ShResults,
): ProjectBreakdownState {
  const base = defaultProjectBreakdownState();
  const s = r.summary;
  const materials: PBMaterialLine[] = [];
  const addM = (
    description: string,
    qty: number,
    unit: string,
    unitCost: number,
  ) => {
    if (qty <= 0) return;
    materials.push({
      id: newPbId(),
      description,
      qty,
      unit,
      unitCost,
      markupPct: null,
      bomSlot: null,
      equipOptionId: null,
    });
  };

  addM("Lutron RadioRA3 dimmer (allowance)", s.lightingPoints, "EA", 185);
  addM("Motorized shade (allowance)", s.shades, "EA", 1200);
  addM("Smart thermostat", s.thermostats, "EA", 280);
  addM("IP camera (blended allowance)", s.cameras, "EA", 400);
  addM("Smart door lock", s.locks, "EA", 320);
  addM("Security sensor (blended)", s.securitySensors, "EA", 65);
  addM("Control4 touchscreen / keypad", s.keypads, "EA", 950);
  addM(
    `Network switch (~${r.network.recommendedSwitchPorts} ports PoE)`,
    1,
    "EA",
    520,
  );

  const labor: PBLaborLine[] = [];
  const addL = (task: string, hours: number) => {
    if (hours <= 0) return;
    labor.push({
      id: newPbId(),
      task,
      hours,
      techs: null,
      ratePerHour: null,
    });
  };

  addL("Keypad/dimmer rough-in (each)", 0.5 * s.lightingPoints);
  addL("Keypad/dimmer trim-out (each)", 0.25 * s.lightingPoints);
  addL("Camera installation (each)", 1.5 * s.cameras);
  addL("Controller installation", 2);
  addL("Shade installation (each)", 1.5 * s.shades);
  addL("Control4 / platform programming", r.controller.programmingHours);
  addL("Network configuration", 2);
  addL("Testing and walkthrough", 2);

  return { ...base, materials, labor };
}
