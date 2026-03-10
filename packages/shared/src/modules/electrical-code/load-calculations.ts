import type { LoadCalculatorInput, LoadCalculatorResult } from "@package/types";
import { LOAD_ASSUMPTIONS, SYSTEM_INFO, applyGeneralDemandFactor } from "./nec-2023-rules.js";
import { recommendServiceSize } from "./service-sizing.js";

export function calculateLoad(input: LoadCalculatorInput): LoadCalculatorResult {
  const laundryCircuits = input.laundryCircuits ?? 0;
  const rangeVa = input.rangeVa ?? 0;
  const waterHeaterVa = input.waterHeaterVa ?? 0;
  const dishwasherVa = input.dishwasherVa ?? 0;
  const disposalVa = input.disposalVa ?? 0;
  const microwaveVa = input.microwaveVa ?? 0;
  const hvacCoolingVa = input.hvacCoolingVa ?? 0;
  const hvacHeatingVa = input.hvacHeatingVa ?? 0;
  const poolPumpVa = input.poolPumpVa ?? 0;
  const poolHeaterVa = input.poolHeaterVa ?? 0;
  const evChargers = input.evChargers ?? 0;
  const evChargerVa = input.evChargerVa ?? 0;
  const otherContinuousLoadsVa = input.otherContinuousLoadsVa ?? 0;
  const otherNonContinuousLoadsVa = input.otherNonContinuousLoadsVa ?? 0;

  const lightingLoadVa = input.squareFeet * 3;
  const smallApplianceLoadVa = input.smallApplianceCircuits * 1500;
  const laundryLoadVa = laundryCircuits * 1500;
  const dryerLoadVa = input.dryers * 5000;
  const adjustedDryerLoadVa = dryerLoadVa;
  const rangeLoadVa = rangeVa;
  const waterHeaterLoadVa = waterHeaterVa;
  const dishwasherLoadVa = dishwasherVa;
  const disposalLoadVa = disposalVa;
  const microwaveLoadVa = microwaveVa;
  const hvacNonCoincidentLoadVa = Math.max(hvacCoolingVa, hvacHeatingVa);
  const poolPumpLoadVa = poolPumpVa;
  const poolHeaterLoadVa = poolHeaterVa;
  const evLoadVa = evChargers * evChargerVa;
  const adjustedEvLoadVa = Math.round(evLoadVa * 1.25);
  const adjustedOtherContinuousLoadsVa = Math.round(otherContinuousLoadsVa * 1.25);
  const largestMotorAdderVa = Math.round(input.largestMotorVa * 0.25);

  const generalLoadVa = lightingLoadVa + smallApplianceLoadVa + laundryLoadVa;
  const demandAdjustedGeneralLoadVa = Math.round(applyGeneralDemandFactor(input.projectClass, generalLoadVa));

  const totalVa =
    demandAdjustedGeneralLoadVa +
    adjustedDryerLoadVa +
    rangeLoadVa +
    waterHeaterLoadVa +
    dishwasherLoadVa +
    disposalLoadVa +
    microwaveLoadVa +
    hvacNonCoincidentLoadVa +
    poolPumpLoadVa +
    poolHeaterLoadVa +
    adjustedEvLoadVa +
    adjustedOtherContinuousLoadsVa +
    otherNonContinuousLoadsVa +
    largestMotorAdderVa +
    input.additionalLoadsVa;
  const system = SYSTEM_INFO[input.electricalSystem];
  const calculatedAmps =
    system.phaseType === "single_phase"
      ? Number((totalVa / system.voltageLL).toFixed(2))
      : Number((totalVa / (1.732 * system.voltageLL)).toFixed(2));

  return {
    lightingLoadVa,
    generalLoadVa,
    demandAdjustedGeneralLoadVa,
    smallApplianceLoadVa,
    laundryLoadVa,
    dryerLoadVa,
    adjustedDryerLoadVa,
    rangeLoadVa,
    waterHeaterLoadVa,
    dishwasherLoadVa,
    disposalLoadVa,
    microwaveLoadVa,
    hvacNonCoincidentLoadVa,
    poolPumpLoadVa,
    poolHeaterLoadVa,
    evLoadVa,
    adjustedEvLoadVa,
    otherContinuousLoadsVa,
    adjustedOtherContinuousLoadsVa,
    otherNonContinuousLoadsVa,
    largestMotorAdderVa,
    totalVa,
    serviceVoltage: system.voltageLL,
    phaseType: system.phaseType,
    currentFormula:
      system.phaseType === "single_phase"
        ? "I = VA / V(line-line)"
        : "I = VA / (sqrt(3) * V(line-line))",
    calculatedAmps,
    recommendedServiceSize: recommendServiceSize(calculatedAmps),
    assumptions: [...LOAD_ASSUMPTIONS]
  };
}
