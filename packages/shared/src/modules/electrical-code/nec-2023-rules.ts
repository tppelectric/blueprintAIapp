import type { ElectricalSystem, LoadCalculatorInput } from "@package/types";

export const NEC_2023_ARTICLES = ["210", "215", "220", "230", "240", "250", "310", "408"] as const;

export const SYSTEM_INFO: Record<ElectricalSystem, { voltageLL: number; phaseType: "single_phase" | "three_phase" }> = {
  single_120_240: { voltageLL: 240, phaseType: "single_phase" },
  single_120_208: { voltageLL: 208, phaseType: "single_phase" },
  three_120_208: { voltageLL: 208, phaseType: "three_phase" },
  three_277_480: { voltageLL: 480, phaseType: "three_phase" }
};

export const LOAD_ASSUMPTIONS = [
  "NEC 220.12 style lighting load baseline: 3 VA per sq ft",
  "Small appliance circuits at 1500 VA each",
  "Laundry circuits at 1500 VA each",
  "Dryer minimum 5000 VA each",
  "Cooling and heating are treated as noncoincident loads (larger load is used)",
  "EV charger input is treated as continuous load at 125%",
  "Other user-entered continuous loads are adjusted to 125%",
  "Largest motor adder at 25%",
  "Dwelling and multifamily general load demand factor applied after first 3000 VA"
] as const;

export function applyGeneralDemandFactor(projectClass: LoadCalculatorInput["projectClass"], generalLoadVa: number): number {
  if (projectClass === "single_dwelling" || projectClass === "multifamily") {
    if (generalLoadVa <= 3000) {
      return generalLoadVa;
    }
    return 3000 + (generalLoadVa - 3000) * 0.35;
  }

  return generalLoadVa;
}
