/**
 * Rule-based electrical reference calculators (NEC-oriented).
 * For field reference only — verify with NEC edition in force and AHJ.
 */

export type AwgKey =
  | "14"
  | "12"
  | "10"
  | "8"
  | "6"
  | "4"
  | "3"
  | "2"
  | "1"
  | "1/0"
  | "2/0"
  | "3/0"
  | "4/0"
  | "250"
  | "300"
  | "350"
  | "400"
  | "500";

export const AWG_ORDER: AwgKey[] = [
  "14",
  "12",
  "10",
  "8",
  "6",
  "4",
  "3",
  "2",
  "1",
  "1/0",
  "2/0",
  "3/0",
  "4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
];

/** NEC Table 310.12 style reference (user cheat sheet). */
export const AMPACITY_CHEAT: Record<
  AwgKey,
  { cu60: number; cu75: number; cu90: number; al75: number | null }
> = {
  "14": { cu60: 15, cu75: 20, cu90: 25, al75: null },
  "12": { cu60: 20, cu75: 25, cu90: 30, al75: 20 },
  "10": { cu60: 30, cu75: 35, cu90: 40, al75: 30 },
  "8": { cu60: 40, cu75: 50, cu90: 55, al75: 40 },
  "6": { cu60: 55, cu75: 65, cu90: 75, al75: 50 },
  "4": { cu60: 70, cu75: 85, cu90: 95, al75: 65 },
  "3": { cu60: 85, cu75: 100, cu90: 110, al75: 75 },
  "2": { cu60: 95, cu75: 115, cu90: 130, al75: 90 },
  "1": { cu60: 110, cu75: 130, cu90: 150, al75: 100 },
  "1/0": { cu60: 125, cu75: 150, cu90: 170, al75: 120 },
  "2/0": { cu60: 145, cu75: 175, cu90: 195, al75: 135 },
  "3/0": { cu60: 165, cu75: 200, cu90: 225, al75: 155 },
  "4/0": { cu60: 195, cu75: 230, cu90: 260, al75: 180 },
  "250": { cu60: 215, cu75: 255, cu90: 290, al75: 205 },
  "300": { cu60: 240, cu75: 285, cu90: 320, al75: 230 },
  "350": { cu60: 260, cu75: 310, cu90: 350, al75: 250 },
  "400": { cu60: 280, cu75: 335, cu90: 380, al75: 270 },
  "500": { cu60: 320, cu75: 380, cu90: 430, al75: 310 },
};

export type InsulationChoice =
  | "thhn90"
  | "thwn75"
  | "tw60"
  | "nmb60";

export type InstallChoice = "conduit" | "freeair" | "buried";

export type ConductorCountGroup = "1-3" | "4-6" | "7-9" | "10-20" | "21-30";

export type AmbientF = 86 | 95 | 104 | 113 | 122 | 131 | 140;

const TEMP_FACTOR: Record<AmbientF, number> = {
  86: 1.0,
  95: 0.94,
  104: 0.88,
  113: 0.82,
  122: 0.75,
  131: 0.67,
  140: 0.58,
};

const COUNT_FACTOR: Record<ConductorCountGroup, number> = {
  "1-3": 1.0,
  "4-6": 0.8,
  "7-9": 0.7,
  "10-20": 0.5,
  "21-30": 0.45,
};

export const STANDARD_BREAKERS = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200,
  225, 250, 300, 350, 400, 450, 500, 600, 800, 1000, 1200,
];

export function nextBreakerUp(amps: number): number {
  const a = Math.ceil(amps);
  for (const b of STANDARD_BREAKERS) {
    if (b >= a) return b;
  }
  return STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1]!;
}

function baseAmpacity(
  awg: AwgKey,
  material: "copper" | "aluminum",
  ins: InsulationChoice,
): number {
  const row = AMPACITY_CHEAT[awg];
  if (material === "aluminum") {
    if (row.al75 == null) return 0;
    if (ins === "thhn90") return row.al75;
    return row.al75;
  }
  switch (ins) {
    case "thhn90":
      return row.cu90;
    case "thwn75":
      return row.cu75;
    case "tw60":
    case "nmb60":
      return row.cu60;
    default:
      return row.cu75;
  }
}

export type WireAmpacityResult = {
  baseAmpacity: number;
  tempFactor: number;
  conduitDerateFactor: number;
  installFactor: number;
  finalAmpacity: number;
  minBreaker: number;
  necRef: string;
  notes: string[];
};

export function computeWireAmpacity(input: {
  awg: AwgKey;
  material: "copper" | "aluminum";
  insulation: InsulationChoice;
  installation: InstallChoice;
  conductorGroup: ConductorCountGroup;
  ambientF: AmbientF;
}): WireAmpacityResult {
  const notes: string[] = [];
  let base = baseAmpacity(input.awg, input.material, input.insulation);
  if (base <= 0) {
    return {
      baseAmpacity: 0,
      tempFactor: 1,
      conduitDerateFactor: 1,
      installFactor: 1,
      finalAmpacity: 0,
      minBreaker: 0,
      necRef: "NEC Table 310.12 (reference)",
      notes: ["Aluminum not listed for this size in cheat sheet."],
    };
  }

  const tf = TEMP_FACTOR[input.ambientF];
  const cf = COUNT_FACTOR[input.conductorGroup];
  let installF = 1;
  if (input.installation === "buried") {
    installF = 0.92;
    notes.push(
      "Direct buried: illustrative derate applied — verify NEC 310.15 and burial depth.",
    );
  }
  if (input.installation === "freeair") {
    notes.push(
      "Free air: base table assumes conduit/raceway conditions; see NEC 310.15(B)(17) for possible higher ampacities.",
    );
  }

  const combined = Math.floor(base * tf * cf * installF * 10) / 10;
  const finalA = Math.max(0, combined);
  const minBr = finalA > 0 ? nextBreakerUp(finalA) : 0;

  return {
    baseAmpacity: base,
    tempFactor: tf,
    conduitDerateFactor: cf,
    installFactor: installF,
    finalAmpacity: finalA,
    minBreaker: minBr,
    necRef: "NEC Table 310.12; 310.15(B)(1); Table 310.15(C)(1) (reference)",
    notes,
  };
}

/** Approximate THHN area in² (NEC Ch. 9 Table 5 style). */
export const WIRE_AREA_SQ_IN: Record<AwgKey, number> = {
  "14": 0.0133,
  "12": 0.0173,
  "10": 0.0211,
  "8": 0.0366,
  "6": 0.0591,
  "4": 0.0882,
  "3": 0.106,
  "2": 0.133,
  "1": 0.156,
  "1/0": 0.185,
  "2/0": 0.216,
  "3/0": 0.254,
  "4/0": 0.292,
  "250": 0.397,
  "300": 0.471,
  "350": 0.546,
  "400": 0.624,
  "500": 0.768,
};

const INS_AREA_FACTOR: Record<"thhn" | "thwn" | "xhhw", number> = {
  thhn: 1,
  thwn: 1.02,
  xhhw: 1.08,
};

export type ConduitTrade =
  | '1/2"'
  | '3/4"'
  | '1"'
  | '1-1/4"'
  | '1-1/2"'
  | '2"'
  | '2-1/2"'
  | '3"'
  | '3-1/2"'
  | '4"';

/** 40% fill usable area (in²) — EMT NEC Ch.9 approx. */
const EMT_AREA_40: Record<ConduitTrade, number> = {
  '1/2"': 0.122,
  '3/4"': 0.213,
  '1"': 0.346,
  '1-1/4"': 0.598,
  '1-1/2"': 0.829,
  '2"': 1.342,
  '2-1/2"': 2.343,
  '3"': 3.408,
  '3-1/2"': 4.538,
  '4"': 5.901,
};

const CONDUIT_TYPE_MULT: Record<string, number> = {
  EMT: 1,
  IMC: 0.98,
  RMC: 0.94,
  "PVC Sch 40": 1.05,
  "PVC Sch 80": 0.88,
  FMC: 0.96,
  LFMC: 0.96,
};

export type ConduitFillWire = { awg: AwgKey; qty: number; insulation: keyof typeof INS_AREA_FACTOR };

export function computeConduitFill(input: {
  conduitType: string;
  tradeSize: ConduitTrade;
  wires: ConduitFillWire[];
}): {
  totalWireSqIn: number;
  conduitInternalSqIn: number;
  fillPct: number;
  maxFillPct: number;
  pass: boolean;
  suggestTrade: ConduitTrade | null;
  necRef: string;
} {
  const mult = CONDUIT_TYPE_MULT[input.conduitType] ?? 1;
  const usable = EMT_AREA_40[input.tradeSize] * mult;
  let total = 0;
  for (const w of input.wires) {
    const a = WIRE_AREA_SQ_IN[w.awg] * INS_AREA_FACTOR[w.insulation] * w.qty;
    total += a;
  }
  const wireCount = input.wires.reduce((s, w) => s + w.qty, 0);
  const maxFill = wireCount > 2 ? 40 : wireCount === 2 ? 31 : 53;
  const fillPct = usable > 0 ? Math.round((total / usable) * 1000) / 10 : 0;
  const pass = fillPct <= maxFill + 0.01;

  const order = Object.keys(EMT_AREA_40) as ConduitTrade[];
  let suggest: ConduitTrade | null = null;
  if (!pass) {
    const idx = order.indexOf(input.tradeSize);
    for (let i = idx + 1; i < order.length; i++) {
      const u = EMT_AREA_40[order[i]!] * mult;
      const pct = (total / u) * 100;
      if (pct <= maxFill) {
        suggest = order[i]!;
        break;
      }
    }
  }

  return {
    totalWireSqIn: Math.round(total * 10000) / 10000,
    conduitInternalSqIn: Math.round(usable * 10000) / 10000,
    fillPct,
    maxFillPct: maxFill,
    pass,
    suggestTrade: suggest,
    necRef: "NEC Chapter 9, Tables 4 & 5 (reference)",
  };
}

/** Circular mils (approx). */
export const CMIL: Record<AwgKey, number> = {
  "14": 4110,
  "12": 6530,
  "10": 10380,
  "8": 16510,
  "6": 26240,
  "4": 41740,
  "3": 52620,
  "2": 66360,
  "1": 83690,
  "1/0": 105600,
  "2/0": 133100,
  "3/0": 167800,
  "4/0": 211600,
  "250": 250000,
  "300": 300000,
  "350": 350000,
  "400": 400000,
  "500": 500000,
};

const K_VALUE = { copper: 12.9, aluminum: 21.2 } as const;

export function computeVoltageDrop(input: {
  voltage: number;
  phase: "single" | "three";
  material: "copper" | "aluminum";
  awg: AwgKey;
  distanceFt: number;
  amps: number;
}): {
  vdVolts: number;
  vdPct: number;
  voltageAtLoad: number;
  status: "ok" | "warn" | "bad";
  statusLabel: string;
  formula: string;
  recommendedAwgFor3Pct: AwgKey | null;
} {
  const cm = CMIL[input.awg];
  const k = K_VALUE[input.material];
  const d = Math.max(0, input.distanceFt);
  const i = Math.max(0, input.amps);
  const mult = input.phase === "single" ? 2 : 1.732;
  const vd = cm > 0 ? (mult * k * i * d) / cm : 0;
  const v = Math.max(0.1, input.voltage);
  const pct = (vd / v) * 100;
  const atLoad = v - vd;
  let status: "ok" | "warn" | "bad" = "ok";
  let statusLabel = "Under 3% — acceptable (NEC 210.19(A) Info Note)";
  if (pct >= 5) {
    status = "bad";
    statusLabel = "Over 5% — exceeds common NEC guidance";
  } else if (pct >= 3) {
    status = "warn";
    statusLabel = "3–5% — exceeds 3% recommendation";
  }

  let rec: AwgKey | null = null;
  const order = AWG_ORDER;
  const idx = order.indexOf(input.awg);
  for (let j = idx; j < order.length; j++) {
    const c2 = CMIL[order[j]!];
    const vd2 = c2 > 0 ? (mult * k * i * d) / c2 : 0;
    const p2 = (vd2 / v) * 100;
    if (p2 < 3) {
      rec = order[j]!;
      break;
    }
  }

  return {
    vdVolts: Math.round(vd * 100) / 100,
    vdPct: Math.round(pct * 100) / 100,
    voltageAtLoad: Math.round(atLoad * 100) / 100,
    status,
    statusLabel,
    formula: "VD = (K × mult × I × D) / CMIL — mult=2 single-phase, √3 three-phase",
    recommendedAwgFor3Pct: rec,
  };
}

/** User cheat: max THHN conductors in EMT (reference only). */
export const CONDUIT_FILL_CHEAT_EMT: Record<string, Record<string, number>> = {
  '#14': { '1/2"': 9, '3/4"': 15, '1"': 25, '1-1/4"': 43, '1-1/2"': 58, '2"': 96 },
  '#12': { '1/2"': 7, '3/4"': 12, '1"': 19, '1-1/4"': 33, '1-1/2"': 45, '2"': 75 },
  '#10': { '1/2"': 5, '3/4"': 9, '1"': 15, '1-1/4"': 26, '1-1/2"': 35, '2"': 58 },
  '#8': { '1/2"': 2, '3/4"': 4, '1"': 7, '1-1/4"': 12, '1-1/2"': 17, '2"': 28 },
  '#6': { '1/2"': 1, '3/4"': 3, '1"': 5, '1-1/4"': 9, '1-1/2"': 12, '2"': 20 },
  '#4': { '1/2"': 1, '3/4"': 2, '1"': 4, '1-1/4"': 7, '1-1/2"': 9, '2"': 15 },
};
