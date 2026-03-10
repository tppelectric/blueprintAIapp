import type {
  ComplianceReport,
  EstimateInput,
  EstimateResult,
  FinishLevel,
  MaterialListItem,
  MaterialPricePoint,
  PlatformDashboard
} from "@package/types";
import {
  calculateLoad,
  designGroundingSystem,
  estimateDedicatedCircuits,
  generatePanelSchedule,
  recommendServiceSize
} from "./modules/electrical-code/index.js";
import { NEC_2023_ARTICLES } from "./modules/electrical-code/nec-2023-rules.js";
import { designUtilityService } from "./modules/utility-rules/index.js";

const FINISH_MULTIPLIER: Record<FinishLevel, number> = {
  builder_grade: 1.0,
  mid_range_residential: 1.3,
  high_end_residential: 1.7
};

export function generateEstimate(input: EstimateInput): EstimateResult {
  const totalPoints =
    input.points.receptacles +
    input.points.switches +
    input.points.lights +
    input.points.dataPorts +
    input.points.lowVoltage;

  const finishMultiplier = FINISH_MULTIPLIER[input.finishLevel];
  const pricePerPoint = (input.laborCostPerPoint + input.materialCostPerPoint) * input.markupMultiplier * finishMultiplier;
  const laborHours = totalPoints * input.baseLaborHoursPerPoint * finishMultiplier;
  const laborCost = totalPoints * input.laborCostPerPoint * finishMultiplier;
  const materialCost = totalPoints * input.materialCostPerPoint * finishMultiplier;
  const totalProjectCost = Number((pricePerPoint * totalPoints).toFixed(2));
  const pricePerSqFt = input.squareFeet > 0 ? Number((totalProjectCost / input.squareFeet).toFixed(2)) : 0;

  return {
    totalPoints,
    pricePerPoint: Number(pricePerPoint.toFixed(2)),
    laborHours: Number(laborHours.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    materialCost: Number(materialCost.toFixed(2)),
    totalProjectCost,
    pricePerSqFt,
    finishLevelMultiplier: finishMultiplier
  };
}

export function monitorMaterialPrices(): MaterialPricePoint[] {
  const checkedAt = new Date().toISOString();
  const rows: Array<Omit<MaterialPricePoint, "changePercent" | "checkedAt">> = [
    { supplier: "Home Depot Pro", item: "THHN 12 AWG", brand: "Southwire", unit: "ft", previousPrice: 0.24, currentPrice: 0.27 },
    { supplier: "Copper Electric Supply", item: "NM-B 12/2", brand: "Cerro", unit: "ft", previousPrice: 0.66, currentPrice: 0.69 },
    { supplier: "HZ Electric Supply", item: "20A AFCI breaker", brand: "Square D", unit: "ea", previousPrice: 52, currentPrice: 55 },
    { supplier: "HZ Electric Supply", item: "Decora switch", brand: "Leviton Decora Edge", unit: "ea", previousPrice: 4.2, currentPrice: 4.1 },
    { supplier: "Home Depot Pro", item: "6in LED downlight", brand: "Halo", unit: "ea", previousPrice: 17.2, currentPrice: 16.8 }
  ];

  return rows.map((row) => ({
    ...row,
    changePercent: Number((((row.currentPrice - row.previousPrice) / row.previousPrice) * 100).toFixed(2)),
    checkedAt
  }));
}

export function generateMaterialList(): MaterialListItem[] {
  return [
    { item: "THHN 12 AWG", quantity: 2500, unit: "ft", brand: "Southwire" },
    { item: "NM-B 12/2", quantity: 3200, unit: "ft", brand: "Cerro" },
    { item: "EMT 1/2 in", quantity: 600, unit: "ft" },
    { item: "Single-pole breakers", quantity: 34, unit: "ea", brand: "Square D" },
    { item: "Panelboard 200A", quantity: 1, unit: "ea", brand: "Eaton" },
    { item: "Receptacles", quantity: 94, unit: "ea", brand: "Leviton" },
    { item: "Dimmers", quantity: 16, unit: "ea", brand: "Lutron" },
    { item: "Speakers", quantity: 8, unit: "ea" }
  ];
}

export function generateComplianceReport(): ComplianceReport {
  return {
    references: [
      "2023 National Electrical Code",
      "Central Hudson Blue Book 2026",
      "NYSEG service requirements"
    ],
    checks: [
      {
        rule: `NEC Articles ${NEC_2023_ARTICLES.join(", ")}`,
        status: "review",
        note: "Mapped workflow checks only. Clause-level validation must be confirmed against project-specific NEC interpretations."
      },
      {
        rule: "Central Hudson Blue Book 2026",
        status: "review",
        note: "Rule scaffold applied. Metering and conductor selections must be confirmed against current utility-approved tables."
      },
      {
        rule: "NYSEG utility requirements",
        status: "review",
        note: "NYSEG logic is included as utility-profile rules and should be validated per latest utility release."
      }
    ]
  };
}

export function getPlatformDashboard(): PlatformDashboard {
  const estimateInput: EstimateInput = {
    laborCostPerPoint: 65,
    materialCostPerPoint: 48,
    markupMultiplier: 1.22,
    points: {
      receptacles: 88,
      switches: 42,
      lights: 76,
      dataPorts: 24,
      lowVoltage: 18
    },
    baseLaborHoursPerPoint: 0.55,
    squareFeet: 6400,
    finishLevel: "mid_range_residential"
  };

  const estimates = generateEstimate(estimateInput);
  const loadCalculation = calculateLoad({
    projectClass: "multifamily",
    electricalSystem: "single_120_240",
    squareFeet: 6400,
    smallApplianceCircuits: 4,
    dryers: 2,
    largestMotorVa: 4200,
    additionalLoadsVa: 22000
  });

  const panelSchedulePreview = generatePanelSchedule(estimateDedicatedCircuits()).slice(0, 12);
  const materialPrices = monitorMaterialPrices();
  const serviceDesign = designUtilityService("central_hudson", loadCalculation.recommendedServiceSize, "underground");
  const complianceSummary = generateComplianceReport();

  return {
    projectName: "ElectricalEstimator AI - Hudson Valley Multifamily",
    projectType: "multifamily",
    estimates,
    loadCalculation,
    panelSchedulePreview,
    materialPrices,
    serviceDesign,
    complianceSummary
  };
}

export {
  calculateLoad,
  designGroundingSystem,
  designUtilityService,
  estimateDedicatedCircuits,
  generatePanelSchedule,
  recommendServiceSize
};
