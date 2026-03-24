/**
 * NEC-oriented motor / HVAC / transformer calculators — rule-based only.
 */

import type { AwgKey } from "@/lib/electrical-reference-engine";
import { computeVoltageDrop, nextBreakerUp } from "@/lib/electrical-reference-engine";

function minAwgKeyForAmp(amps: number): AwgKey {
  const a = Math.ceil(amps);
  const rows: [number, AwgKey][] = [
    [15, "14"],
    [20, "12"],
    [30, "10"],
    [40, "8"],
    [55, "6"],
    [70, "4"],
    [85, "3"],
    [95, "2"],
    [110, "1"],
    [125, "1/0"],
    [145, "2/0"],
    [165, "3/0"],
    [195, "4/0"],
    [215, "250"],
    [255, "300"],
  ];
  for (const [maxA, key] of rows) {
    if (a <= maxA) return key;
  }
  return "500";
}

/** NEC 430.248 single-phase FLA (user table). Keys: hp string -> {115,208,230} */
export const FLA_1PH: Record<string, { v115: number; v208: number; v230: number }> = {
  "1/6": { v115: 4.4, v208: 2.4, v230: 2.2 },
  "1/4": { v115: 5.8, v208: 3.2, v230: 2.9 },
  "1/3": { v115: 7.2, v208: 4.0, v230: 3.6 },
  "1/2": { v115: 9.8, v208: 5.4, v230: 4.9 },
  "3/4": { v115: 13.8, v208: 7.6, v230: 6.9 },
  "1": { v115: 16.0, v208: 8.8, v230: 8.0 },
  "1.5": { v115: 20.0, v208: 11.0, v230: 10.0 },
  "2": { v115: 24.0, v208: 13.2, v230: 12.0 },
  "3": { v115: 34.0, v208: 18.7, v230: 17.0 },
  "5": { v115: 56.0, v208: 30.8, v230: 28.0 },
  "7.5": { v115: 80.0, v208: 44.0, v230: 40.0 },
  "10": { v115: 100, v208: 55.0, v230: 50.0 },
};

/** NEC 430.250 three-phase */
export const FLA_3PH: Record<
  string,
  { v208: number; v230: number; v460: number; v575: number }
> = {
  "1/2": { v208: 2.5, v230: 2.2, v460: 1.1, v575: 0.9 },
  "3/4": { v208: 3.5, v230: 3.2, v460: 1.6, v575: 1.3 },
  "1": { v208: 4.6, v230: 4.2, v460: 2.1, v575: 1.7 },
  "1.5": { v208: 6.6, v230: 6.0, v460: 3.0, v575: 2.4 },
  "2": { v208: 7.5, v230: 6.8, v460: 3.4, v575: 2.7 },
  "3": { v208: 10.6, v230: 9.6, v460: 4.8, v575: 3.9 },
  "5": { v208: 16.7, v230: 15.2, v460: 7.6, v575: 6.1 },
  "7.5": { v208: 24.2, v230: 22.0, v460: 11.0, v575: 9.0 },
  "10": { v208: 30.8, v230: 28.0, v460: 14.0, v575: 11.0 },
  "15": { v208: 46.2, v230: 42.0, v460: 21.0, v575: 17.0 },
  "20": { v208: 59.4, v230: 54.0, v460: 27.0, v575: 22.0 },
  "25": { v208: 74.8, v230: 68.0, v460: 34.0, v575: 27.0 },
  "30": { v208: 88.0, v230: 80.0, v460: 40.0, v575: 32.0 },
  "40": { v208: 114, v230: 104, v460: 52.0, v575: 41.0 },
  "50": { v208: 143, v230: 130, v460: 65.0, v575: 52.0 },
  "60": { v208: 169, v230: 154, v460: 77.0, v575: 62.0 },
  "75": { v208: 211, v230: 192, v460: 96.0, v575: 77.0 },
  "100": { v208: 273, v230: 248, v460: 124, v575: 99.0 },
  "125": { v208: 343, v230: 312, v460: 156, v575: 125 },
  "150": { v208: 396, v230: 360, v460: 180, v575: 144 },
  "200": { v208: 528, v230: 480, v460: 240, v575: 192 },
};

/** Simplified conductor from ampacity (copper THHN illustrative). */
export function minCuAwgForAmp(amps: number): string {
  const a = Math.ceil(amps);
  const match: [number, string][] = [
    [15, "14"],
    [20, "12"],
    [30, "10"],
    [40, "8"],
    [55, "6"],
    [70, "4"],
    [85, "3"],
    [95, "2"],
    [110, "1"],
    [125, "1/0"],
    [145, "2/0"],
    [165, "3/0"],
    [195, "4/0"],
  ];
  for (const [amp, awg] of match) {
    if (a <= amp) return `${awg} AWG Cu`;
  }
  if (a <= 215) return "250 kcmil Cu";
  if (a <= 255) return "300 kcmil Cu";
  return "Engineering / parallel";
}

export function computeMotorCircuit(input: {
  hpKey: string;
  voltage: 115 | 120 | 208 | 230 | 240 | 460 | 480 | 575;
  phase: "single" | "three";
  serviceFactor: 1 | 1.15 | 1.25;
  /** When motor is not covered by 430.248/250, use nameplate FLA. */
  overrideFla?: number | null;
  /** DC / wound rotor — use only nameplate FLA, not ampacity tables. */
  nameplateFlaOnly?: boolean;
}): {
  fla: number;
  minConductorA: number;
  minAwg: string;
  maxBreaker: number;
  maxDualFuse: number;
  overloadA: number;
  disconnectHp: string;
  starterNema: string;
  conduitTrade: string;
  necRefs: string[];
} {
  const necRefs = ["NEC 430.6", "430.22", "430.32", "430.52", "430.110"];
  let fla = 0;
  if (input.nameplateFlaOnly) {
    fla =
      input.overrideFla != null && input.overrideFla > 0 ? input.overrideFla : 0;
    if (fla > 0) necRefs.push("Nameplate FLA (430.6)");
  } else if (input.overrideFla != null && input.overrideFla > 0) {
    fla = input.overrideFla;
    necRefs.push("Nameplate FLA (430.6)");
  } else if (input.phase === "single") {
    const row = FLA_1PH[input.hpKey];
    if (!row) fla = 0;
    else if (input.voltage <= 120) fla = row.v115;
    else if (input.voltage === 208) fla = row.v208;
    else fla = row.v230;
  } else {
    const row = FLA_3PH[input.hpKey];
    if (!row) fla = 0;
    else if (input.voltage <= 208) fla = row.v208;
    else if (input.voltage <= 240) fla = row.v230;
    else if (input.voltage <= 480) fla = row.v460;
    else fla = row.v575;
  }

  const condMin = fla * 1.25;
  const maxBr = Math.ceil(fla * 2.5);
  const maxDual = Math.ceil(fla * 1.75);
  const overload =
    input.serviceFactor >= 1.15 ? fla * 1.25 : fla * 1.15;

  const minAwg = minCuAwgForAmp(condMin);
  const brStd = nextBreakerUp(maxBr);

  let nema = "1";
  if (fla > 100) nema = "4";
  else if (fla > 50) nema = "3";
  else if (fla > 27) nema = "2";
  else if (fla > 18) nema = "1";

  return {
    fla: Math.round(fla * 100) / 100,
    minConductorA: Math.round(condMin * 100) / 100,
    minAwg,
    maxBreaker: brStd,
    maxDualFuse: maxDual,
    overloadA: Math.round(overload * 100) / 100,
    disconnectHp: `${input.hpKey} HP minimum`,
    starterNema: nema,
    conduitTrade: condMin <= 30 ? '3/4"' : '1"',
    necRefs,
  };
}

export function computeHvacCircuit(input: {
  compressorRla: number;
  fanFla: number;
  fanCount: 1 | 2;
  distanceFt: number;
  voltage: number;
  phase: "single" | "three";
}): {
  mca: number;
  mocp: number;
  breaker: number;
  minWire: string;
  conduit: string;
  disconnect: number;
  vdPctApprox: number;
} {
  const fanTot = input.fanFla * input.fanCount;
  const mca = input.compressorRla * 1.25 + fanTot;
  const mocp = input.compressorRla * 2.25 + fanTot;
  const br = nextBreakerUp(mocp);
  const minWire = minCuAwgForAmp(mca);
  const awg = minAwgKeyForAmp(mca);
  const vdRes = computeVoltageDrop({
    voltage: Math.max(1, input.voltage),
    phase: input.phase,
    material: "copper",
    awg,
    distanceFt: input.distanceFt,
    amps: mca,
  });
  return {
    mca: Math.round(mca * 100) / 100,
    mocp: Math.round(mocp * 100) / 100,
    breaker: br,
    minWire: `${minWire} THHN Cu`,
    conduit: mca <= 40 ? '3/4" EMT' : '1" EMT',
    disconnect: br,
    vdPctApprox: vdRes.vdPct,
  };
}

const KVA_SIZES = [
  0.05, 0.1, 0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 25, 37.5, 50,
  75, 100,
];

export function computeTransformer(input: {
  primaryV: number;
  secondaryV: number;
  phase: "single" | "three";
  loadAmps: number | null;
  loadWatts: number | null;
  loadKva: number | null;
}): {
  kva: number;
  kvaRated: number;
  primaryA: number;
  secondaryA: number;
  priWire: string;
  secWire: string;
  necRefs: string[];
} {
  const necRefs = ["NEC 450.3", "450.9"];
  let kva = 0;
  if (input.loadKva != null && input.loadKva > 0) kva = input.loadKva;
  else if (input.loadWatts != null && input.loadWatts > 0 && input.secondaryV > 0) {
    kva = input.loadWatts / 1000;
  } else if (input.loadAmps != null && input.secondaryV > 0) {
    const mult = input.phase === "three" ? 1.732 : 1;
    kva = (input.secondaryV * input.loadAmps * mult) / 1000;
  }

  const rated =
    KVA_SIZES.find((s) => s >= kva * 1.0) ?? Math.ceil(kva);
  const priA =
    input.primaryV > 0
      ? (rated * 1000) / (input.phase === "three" ? 1.732 : 1) / input.primaryV
      : 0;
  const secA =
    input.secondaryV > 0
      ? (rated * 1000) / (input.phase === "three" ? 1.732 : 1) / input.secondaryV
      : 0;

  return {
    kva: Math.round(kva * 1000) / 1000,
    kvaRated: rated,
    primaryA: Math.round(priA * 100) / 100,
    secondaryA: Math.round(secA * 100) / 100,
    priWire: minCuAwgForAmp(priA),
    secWire: minCuAwgForAmp(secA),
    necRefs,
  };
}

export function computeGeneratorSize(input: {
  runningWatts: number;
  motorStartFactor: number;
}): {
  runningKw: number;
  startingKw: number;
  recommendedKw: number;
  standardKw: number;
} {
  const run = input.runningWatts / 1000;
  const start = (input.runningWatts * input.motorStartFactor) / 1000;
  const rec = Math.max(run, start);
  const sizes = [
    7.5, 10, 12, 15, 17, 20, 22, 25, 30, 35, 40, 45, 50, 60, 75, 100, 125, 150,
    175, 200, 250, 300,
  ];
  const std = sizes.find((s) => s >= rec) ?? 300;
  return {
    runningKw: Math.round(run * 100) / 100,
    startingKw: Math.round(start * 100) / 100,
    recommendedKw: Math.round(rec * 100) / 100,
    standardKw: std,
  };
}
