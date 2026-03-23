/** Rule-based Wi‑Fi AP planning for low-voltage takeoff estimates. */

export type WallMaterial =
  | "drywall"
  | "concrete"
  | "brick"
  | "metal_stud"
  | "wood";

export type CoverageGoal =
  | "basic"
  | "streaming"
  | "high_density_iot"
  | "smart_home"
  | "commercial";

export type DeviceBand = "1-10" | "11-25" | "26-50" | "50+";

export type CeilingHeight = "8" | "9" | "10" | "12" | "higher";

export type PoeChoice = "yes" | "no" | "recommend";

export type VendorChoice =
  | "ubiquiti"
  | "ruckus"
  | "cisco_meraki"
  | "tp_link"
  | "access_networks"
  | "none";

export type BudgetTier = "under500" | "500_1500" | "1500_5000" | "5000_plus" | "unlimited";

export type BuildingType =
  | "residential"
  | "commercial"
  | "office"
  | "warehouse";

export type WifiAnalyzerInputs = {
  projectName: string;
  buildingType: BuildingType;
  totalSqFt: number;
  floors: number;
  coverageGoal: CoverageGoal;
  wallMaterial: WallMaterial;
  ceilingHeight: CeilingHeight;
  deviceBand: DeviceBand;
  outdoorNeeded: boolean;
  poe: PoeChoice;
  vendor: VendorChoice;
  budget: BudgetTier;
};

const SQ_FT_PER_AP: Record<WallMaterial, number> = {
  drywall: 2500,
  wood: 2000,
  metal_stud: 1500,
  brick: 1200,
  concrete: 800,
};

/** 26+ devices: effective coverage per AP reduced by 30% (tighter cells). */
function highDeviceDensityFactor(band: DeviceBand): number {
  return band === "26-50" || band === "50+" ? 0.7 : 1;
}

function coverageGoalFactor(goal: CoverageGoal): number {
  switch (goal) {
    case "basic":
      return 1;
    case "streaming":
      return 1 / 0.92;
    case "high_density_iot":
      return 1 / 0.75;
    case "smart_home":
      return 1;
    case "commercial":
      return 1;
    default:
      return 1;
  }
}

function ceilingFactor(h: CeilingHeight): number {
  switch (h) {
    case "8":
      return 1;
    case "9":
      return 1 / 0.97;
    case "10":
      return 1 / 0.94;
    case "12":
      return 1 / 0.9;
    case "higher":
      return 1 / 0.85;
    default:
      return 1;
  }
}

export type EquipmentRec = {
  apModel: string;
  outdoorApModel: string | null;
  switchNote: string;
  switchPorts: number;
  costRangeLabel: string;
};

const U6_LITE = 99;
const U6_PRO = 179;
const U6_ENT = 299;
const U6_MESH = 179;
const USW_LITE_8 = 109;

function pickUbiquitiEquipment(
  totalSqFt: number,
  outdoor: boolean,
): EquipmentRec {
  let apModel: string;
  let apUnit: number;
  if (totalSqFt < 2000) {
    apModel = `UniFi U6 Lite ($${U6_LITE})`;
    apUnit = U6_LITE;
  } else if (totalSqFt < 5000) {
    apModel = `UniFi U6 Pro ($${U6_PRO})`;
    apUnit = U6_PRO;
  } else {
    apModel = `UniFi U6 Enterprise ($${U6_ENT})`;
    apUnit = U6_ENT;
  }
  const outdoorApModel = outdoor
    ? `UniFi U6 Mesh ($${U6_MESH})`
    : null;
  return {
    apModel,
    outdoorApModel,
    switchNote: `UniFi USW Lite 8 PoE ($${USW_LITE_8}) — scale up if more than 8 powered devices`,
    switchPorts: 0,
    costRangeLabel: `Ubiquiti (AP ~$${apUnit}${outdoor ? ` + outdoor $${U6_MESH}` : ""} + switch ~$${USW_LITE_8})`,
  };
}

/** Rough list-price units for cost math (not shown in EquipmentRec). */
function hardwareUnitEstimates(
  vendor: VendorChoice,
  totalSqFt: number,
  outdoor: boolean,
): { apUnit: number; outdoorUnit: number; switchUnit: number } {
  if (vendor === "ubiquiti" || vendor === "none") {
    let ap = U6_PRO;
    if (totalSqFt < 2000) ap = U6_LITE;
    else if (totalSqFt >= 5000) ap = U6_ENT;
    return {
      apUnit: ap,
      outdoorUnit: outdoor ? U6_MESH : 0,
      switchUnit: USW_LITE_8,
    };
  }
  if (vendor === "ruckus") {
    return {
      apUnit: totalSqFt < 3000 ? 350 : 550,
      outdoorUnit: outdoor ? 450 : 0,
      switchUnit: 400,
    };
  }
  if (vendor === "cisco_meraki") {
    return { apUnit: 450, outdoorUnit: outdoor ? 600 : 0, switchUnit: 800 };
  }
  if (vendor === "tp_link") {
    return { apUnit: 120, outdoorUnit: outdoor ? 90 : 0, switchUnit: 150 };
  }
  return { apUnit: 400, outdoorUnit: outdoor ? 500 : 0, switchUnit: 450 };
}

function equipmentForVendor(
  vendor: VendorChoice,
  totalSqFt: number,
  outdoor: boolean,
  budget: BudgetTier,
): EquipmentRec {
  const budgetHint =
    budget === "under500"
      ? " — favor value SKUs"
      : budget === "5000_plus" || budget === "unlimited"
        ? " — enterprise-grade options"
        : "";

  switch (vendor) {
    case "ubiquiti":
      return pickUbiquitiEquipment(totalSqFt, outdoor);
    case "ruckus":
      return {
        apModel: `Ruckus indoor AP (R350 / R550 class)${budgetHint}`,
        outdoorApModel: outdoor ? "Ruckus T350 outdoor" : null,
        switchNote: "Ruckus ICX or similar PoE+ switch sized to port count",
        switchPorts: 0,
        costRangeLabel: "Ruckus — request quote for AP + switch package",
      };
    case "cisco_meraki":
      return {
        apModel: `Meraki MR36 / MR46 class${budgetHint}`,
        outdoorApModel: outdoor ? "Meraki MR outdoor model" : null,
        switchNote: "Meraki MS PoE switch (license required)",
        switchPorts: 0,
        costRangeLabel: "Cisco Meraki — subscription + hardware",
      };
    case "tp_link":
      return {
        apModel: `Omada EAP650 / EAP670${budgetHint}`,
        outdoorApModel: outdoor ? "Omada EAP225-Outdoor" : null,
        switchNote: "Omada PoE+ switch",
        switchPorts: 0,
        costRangeLabel: "TP-Link Omada stack",
      };
    case "access_networks":
      return {
        apModel: `Access Networks line — size to floorplan${budgetHint}`,
        outdoorApModel: outdoor ? "Outdoor-rated partner AP" : null,
        switchNote: "Matched PoE switch from manufacturer line card",
        switchPorts: 0,
        costRangeLabel: "Access Networks — dealer pricing",
      };
    default:
      return pickUbiquitiEquipment(totalSqFt, outdoor);
  }
}

function budgetCostRange(b: BudgetTier): string {
  switch (b) {
    case "under500":
      return "Under $500";
    case "500_1500":
      return "$500 – $1,500";
    case "1500_5000":
      return "$1,500 – $5,000";
    case "5000_plus":
      return "$5,000+";
    case "unlimited":
      return "No constraint";
    default:
      return "—";
  }
}

export type WifiAnalyzerResults = {
  recommendedAps: number;
  indoorAps: number;
  outdoorAps: number;
  coveragePerApSqFt: number;
  totalCoverageSqFt: number;
  effectiveSqFtPerAp: number;
  cat6Drops: number;
  cat6FootageLf: number;
  lvBrackets: number;
  rj45Jacks: number;
  patchCables: number;
  poeSwitchPorts: number;
  switchLocationNote: string;
  equipment: EquipmentRec;
  estimatedHardwareCostRange: string;
  /** Dollar estimate from list prices × counts (rough). */
  hardwareCostEstimateLabel: string;
  assumptionsLine: string;
};

export function computeWifiPlan(inputs: WifiAnalyzerInputs): WifiAnalyzerResults {
  const floors = Math.max(1, Math.floor(inputs.floors) || 1);
  const totalSqFt = Math.max(1, inputs.totalSqFt);

  const base = SQ_FT_PER_AP[inputs.wallMaterial];
  let eff =
    (base * highDeviceDensityFactor(inputs.deviceBand)) /
    (coverageGoalFactor(inputs.coverageGoal) * ceilingFactor(inputs.ceilingHeight));

  const perFloorSq = totalSqFt / floors;
  const apsPerFloor = Math.max(1, Math.ceil(perFloorSq / eff));
  let indoorAps = apsPerFloor * floors;
  const outdoorAps = inputs.outdoorNeeded ? 1 : 0;

  if (inputs.coverageGoal === "smart_home") {
    indoorAps = Math.max(1, Math.ceil(indoorAps * 1.2));
  }
  if (inputs.coverageGoal === "commercial") {
    indoorAps = Math.max(1, Math.ceil(indoorAps * 1.25));
  }

  const totalAps = indoorAps + outdoorAps;

  const rawEq = equipmentForVendor(
    inputs.vendor,
    totalSqFt,
    inputs.outdoorNeeded,
    inputs.budget,
  );
  const poeSwitchPorts = Math.min(48, totalAps + 4);
  const equipment: EquipmentRec = {
    ...rawEq,
    switchPorts: poeSwitchPorts,
  };
  const units = hardwareUnitEstimates(
    inputs.vendor,
    totalSqFt,
    inputs.outdoorNeeded,
  );

  const avgRunFt = Math.min(
    180,
    Math.max(35, Math.round(Math.sqrt(perFloorSq) * 1.15 + 20)),
  );
  const cat6Drops = indoorAps + (outdoorAps > 0 ? 1 : 0);
  const cat6FootageLf = Math.round(indoorAps * avgRunFt + outdoorAps * 55);
  const lvBrackets = indoorAps;
  const rj45Jacks = cat6Drops;
  const patchCableCount = Math.min(24, totalAps + 2);

  let switchLocationNote =
    "Place PoE switch central to AP cluster — MDF for commercial, closet or rack for residential.";
  if (inputs.buildingType === "warehouse") {
    switchLocationNote =
      "Warehouse: mount switch in protected IDF near power; homerun to MDF.";
  }

  const apSpend = indoorAps * units.apUnit + outdoorAps * units.outdoorUnit;
  const switchSpend = Math.round(
    units.switchUnit * Math.min(2.2, 1 + totalAps / 16),
  );
  const patchSpend = patchCableCount * 8;
  const rawTotal = apSpend + switchSpend + patchSpend;
  const low = Math.max(0, Math.round(rawTotal * 0.85));
  const high = Math.round(rawTotal * 1.2);
  const hardwareCostEstimateLabel = `$${low.toLocaleString()} – $${high.toLocaleString()} (est., MSRP-style)`;

  const assumptionsLine = `Wall: ${inputs.wallMaterial.replace(/_/g, " ")} (${SQ_FT_PER_AP[inputs.wallMaterial]} sqft/AP baseline) · Ceiling: ${inputs.ceilingHeight} ft · Devices: ${inputs.deviceBand} · Goal: ${inputs.coverageGoal.replace(/_/g, " ")} · Floors: ${floors}`;

  return {
    recommendedAps: totalAps,
    indoorAps,
    outdoorAps,
    coveragePerApSqFt: Math.round(totalSqFt / Math.max(1, indoorAps)),
    totalCoverageSqFt: totalSqFt,
    effectiveSqFtPerAp: Math.round(eff),
    cat6Drops,
    cat6FootageLf,
    lvBrackets,
    rj45Jacks,
    patchCables: patchCableCount,
    poeSwitchPorts,
    switchLocationNote,
    equipment,
    estimatedHardwareCostRange: budgetCostRange(inputs.budget),
    hardwareCostEstimateLabel,
    assumptionsLine,
  };
}
