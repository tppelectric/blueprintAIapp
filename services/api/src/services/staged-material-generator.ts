import type { TallyItem } from "../repositories/tally-repository.js";

export type MaterialStageItem = {
  name: string;
  quantity: string | number;
  unit_cost: number;
  labor_cost: number;
  installed_cost: number;
};

export type StageGenerationInput = {
  tallyList: TallyItem[];
  conduitLengthsFeet: number;
  wireLengthsFeet: number;
  panelCounts: number;
};

function countFor(tallyList: TallyItem[], deviceName: string): number {
  return tallyList.find((item) => item.device === deviceName)?.quantity ?? 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function withCosts(name: string, quantity: string | number, unitCost: number, laborCost: number): MaterialStageItem {
  return {
    name,
    quantity,
    unit_cost: round2(unitCost),
    labor_cost: round2(laborCost),
    installed_cost: round2(unitCost + laborCost)
  };
}

export function generateStagedMaterialLists(input: StageGenerationInput): {
  rough_materials: MaterialStageItem[];
  trim_materials: MaterialStageItem[];
  totals: {
    rough_material_cost: number;
    trim_material_cost: number;
    total_material_cost: number;
    total_labor_cost: number;
    total_installed_cost: number;
  };
} {
  const receptacles = countFor(input.tallyList, "Duplex Receptacle") + countFor(input.tallyList, "GFCI Receptacle");
  const switches =
    countFor(input.tallyList, "Switch") +
    countFor(input.tallyList, "3-way Switch") +
    countFor(input.tallyList, "4-way Switch");
  const fixtures = countFor(input.tallyList, "Lighting Fixture");
  const panels = Math.max(0, input.panelCounts);
  const wireFt = Math.max(0, input.wireLengthsFeet);
  const conduitFt = Math.max(0, input.conduitLengthsFeet);

  const junctionBoxes = Math.max(0, Math.ceil((receptacles + switches + fixtures) * 0.7));
  const fittingCount = Math.max(0, Math.ceil(conduitFt / 10));

  const rough_materials: MaterialStageItem[] = [
    withCosts("12/2 MC cable", `${wireFt} ft`, wireFt * 1.58, wireFt * 0.42),
    withCosts("EMT conduit", `${conduitFt} ft`, conduitFt * 1.12, conduitFt * 0.54),
    withCosts("4 inch square boxes", junctionBoxes, junctionBoxes * 3.25, junctionBoxes * 4.9),
    withCosts("Ground wire", `${Math.ceil(wireFt * 0.35)} ft`, wireFt * 0.2, wireFt * 0.08),
    withCosts("Panel enclosures", panels, panels * 280, panels * 145),
    withCosts("Conduit fittings", fittingCount, fittingCount * 1.15, fittingCount * 0.62)
  ];

  const trim_materials: MaterialStageItem[] = [
    withCosts("Switches", switches, switches * 6.2, switches * 7.8),
    withCosts("Receptacles", receptacles, receptacles * 4.7, receptacles * 5.9),
    withCosts("Wall plates", switches + receptacles, (switches + receptacles) * 0.85, (switches + receptacles) * 0.95),
    withCosts("Lighting fixtures", fixtures, fixtures * 112, fixtures * 65),
    withCosts("Sensors", Math.ceil(fixtures * 0.12), Math.ceil(fixtures * 0.12) * 34, Math.ceil(fixtures * 0.12) * 19),
    withCosts("Control devices", switches, switches * 17.5, switches * 9.7)
  ];

  const all = [...rough_materials, ...trim_materials];
  const totalMaterialCost = round2(all.reduce((sum, item) => sum + item.unit_cost, 0));
  const totalLaborCost = round2(all.reduce((sum, item) => sum + item.labor_cost, 0));
  const totalInstalledCost = round2(all.reduce((sum, item) => sum + item.installed_cost, 0));
  const roughMaterialCost = round2(rough_materials.reduce((sum, item) => sum + item.unit_cost, 0));
  const trimMaterialCost = round2(trim_materials.reduce((sum, item) => sum + item.unit_cost, 0));

  return {
    rough_materials,
    trim_materials,
    totals: {
      rough_material_cost: roughMaterialCost,
      trim_material_cost: trimMaterialCost,
      total_material_cost: totalMaterialCost,
      total_labor_cost: totalLaborCost,
      total_installed_cost: totalInstalledCost
    }
  };
}

