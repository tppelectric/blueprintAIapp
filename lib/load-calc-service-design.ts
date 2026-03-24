/**
 * Service entrance / equipment recommendations from load calc results (rule-based, NEC refs).
 */

import type { ResidentialInputs } from "@/lib/load-calc-engine";

export type ServiceDesignInput = {
  recommendedAmps: 100 | 150 | 200 | 400;
  tab: "residential" | "commercial";
  totalVa: number;
  requiredAmps: number;
  appliances?: ResidentialInputs["appliances"];
  futureGrowthSolar?: boolean;
  garageLoads?: boolean;
};

export type ServiceEntranceRow = {
  phaseConductors: string;
  neutralConductor: string;
  gec: string;
  gecNec: string;
  conduit: string;
  necRefs: string[];
};

const ENTRANCE_BY_AMPS: Record<
  100 | 150 | 200 | 400,
  ServiceEntranceRow
> = {
  100: {
    phaseConductors: "4 AWG copper (NEC Table 310.12 ref.)",
    neutralConductor: "4 AWG copper (same as phase, typical dwelling)",
    gec: "8 AWG copper",
    gecNec: "NEC Table 250.66",
    conduit: '1-1/4" RMC or PVC Sch 40 minimum (Ch. 9 — verify fill)',
    necRefs: ["NEC Table 310.12", "250.66", "Chapter 9"],
  },
  150: {
    phaseConductors: "1 AWG copper",
    neutralConductor: "1 AWG copper (typical; neutral sizing per load)",
    gec: "6 AWG copper",
    gecNec: "NEC Table 250.66",
    conduit: '1-1/2" RMC or PVC Sch 40 minimum',
    necRefs: ["NEC Table 310.12", "250.66", "Chapter 9"],
  },
  200: {
    phaseConductors: "3/0 AWG copper",
    neutralConductor: "3/0 AWG copper (typical)",
    gec: "4 AWG copper",
    gecNec: "NEC Table 250.66",
    conduit: '2" RMC or PVC Sch 40 minimum',
    necRefs: ["NEC Table 310.12", "250.66", "Chapter 9"],
  },
  400: {
    phaseConductors: "600 kcmil copper (parallel per engineering)",
    neutralConductor: "Sized per calculated neutral load",
    gec: "1/0 AWG copper",
    gecNec: "NEC Table 250.66",
    conduit: '3" RMC or PVC Sch 40 minimum',
    necRefs: ["NEC Table 310.12", "250.66", "Chapter 9"],
  },
};

function estimatedCircuits(va: number): number {
  const base = Math.ceil(va / 1800);
  return Math.min(60, Math.max(12, base + 8));
}

function panelSpaces(circuits: number): number {
  if (circuits <= 20) return 24;
  if (circuits <= 30) return 30;
  if (circuits <= 40) return 40;
  return 42;
}

export function buildServiceDesign(input: ServiceDesignInput) {
  const se = ENTRANCE_BY_AMPS[input.recommendedAmps];
  const circuits = estimatedCircuits(input.totalVa);
  const spaces = panelSpaces(circuits);
  const apps = input.appliances;

  const evL1 =
    apps?.evL1?.enabled === true
      ? {
          nec: "NEC 210.8, 406",
          lines: [
            "Level 1 (120 V / 20 A): 12 AWG THHN Cu",
            "Breaker: 20 A",
            'Conduit: 1/2" EMT',
          ],
        }
      : null;

  const evL2 =
    apps?.evL2?.enabled === true
      ? {
          nec: "NEC 625",
          lines:
            (apps.evL2.watts ?? 7200) >= 10000
              ? [
                  "Level 2 (240 V / 50 A class): 6 AWG THHN Cu",
                  "Breaker: 60 A",
                  'Conduit: 3/4" EMT',
                ]
              : [
                  "Level 2 (240 V / 40 A class): 8 AWG THHN Cu",
                  "Breaker: 50 A",
                  'Conduit: 3/4" EMT',
                  "Outlet: NEMA 14-50 (where applicable)",
                ],
        }
      : null;

  const subpanel =
    input.garageLoads === true
      ? {
          nec: "NEC 225",
          recommended: "60 A or 100 A subpanel (field verify loads)",
          feederWire: "6 AWG Cu (60 A) or 3 AWG Cu (100 A) THHN — verify length/VD",
          feederConduit: '1" EMT (100 A) or 3/4" EMT (60 A)',
          feederBreaker: "60 A or 100 A as selected",
        }
      : null;

  const gen =
    apps?.generator?.enabled === true
      ? {
          nec: "NEC 702",
          minKw: Math.max(7.5, Number(apps.generator.kw) || 12),
          recommendedKw:
            Math.ceil((Math.max(7.5, Number(apps.generator.kw) || 12) * 1.25) * 4) /
            4,
          transferSwitchAmps: input.recommendedAmps,
        }
      : null;

  const solar =
    input.futureGrowthSolar === true
      ? [
          "Consider 200 A minimum service for PV backfeed headroom (NEC 705).",
          "Install conduit sleeve from roof to panel (AHJ / plan spec).",
          "Reserve 2 breaker spaces for utility-required solar OCPD.",
        ]
      : null;

  return {
    serviceEntrance: se,
    meterSocket: {
      minimumRating: `${input.recommendedAmps} A`,
      recommended: `${input.recommendedAmps} A jaw rating — match utility spec`,
      nec: "NEC 230; utility requirements",
    },
    mainDisconnect: {
      minimumBreaker: `${input.recommendedAmps} A`,
      recommendedPanel: `${input.recommendedAmps} A main breaker panel`,
      nec: "NEC 230.79",
    },
    panel: {
      estimatedCircuits: circuits,
      recommendedSpaces: spaces,
      suggestion: `${input.recommendedAmps} A, ${spaces}-space panel (minimum)`,
      nec: "NEC 408",
    },
    evL1,
    evL2,
    subpanel,
    generator: gen,
    solarReady: solar,
    disclaimer:
      "Illustrative schedule only. Verify conductor ampacity, voltage drop, grounding, and utility requirements with NEC and AHJ.",
  };
}
