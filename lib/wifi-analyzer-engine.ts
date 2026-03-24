/** Rule-based Wi‑Fi AP planning — whole-home layout with room-by-room inputs. */

import {
  buildHardwareBomLines,
  planVendorMaterialStack,
  sumBomMaterialSubtotal,
  type HardwareBomLine,
} from "@/lib/wifi-vendor-hardware";

export type { HardwareBomLine };

export type RoomWallMaterial =
  | "drywall"
  | "plaster"
  | "brick"
  | "concrete_block"
  | "mixed";

export type RoomTypeOption =
  | "living_room"
  | "bedroom"
  | "office"
  | "kitchen"
  | "bathroom"
  | "hallway"
  | "garage"
  | "basement"
  | "patio"
  | "outdoor"
  | "other";

export type CeilingHeight = "8" | "9" | "10" | "12" | "higher";

export type PlanningPriority =
  | "best_value"
  | "best_performance"
  | "future_proof"
  | "lowest_cost";

export type CoverageGoal =
  | "basic"
  | "streaming"
  | "high_density_iot"
  | "smart_home"
  | "commercial";

export type PoeChoice = "yes" | "no" | "recommend";

export type VendorChoice =
  | "ubiquiti"
  | "ruckus"
  | "cisco_meraki"
  | "tp_link"
  | "access_networks"
  | "eero"
  | "google_nest"
  | "netgear_orbi"
  | "luxul"
  | "araknis"
  | "none";

export function isMeshVendor(v: VendorChoice): boolean {
  return v === "eero" || v === "google_nest" || v === "netgear_orbi";
}

/** Vendors shown in the comparison table (includes “no preference”). */
export const WIFI_VENDOR_COMPARE_ORDER: VendorChoice[] = [
  "ubiquiti",
  "eero",
  "google_nest",
  "netgear_orbi",
  "tp_link",
  "ruckus",
  "cisco_meraki",
  "access_networks",
  "araknis",
  "luxul",
  "none",
];

export type BudgetTier =
  | "under500"
  | "500_1500"
  | "1500_5000"
  | "5000_plus"
  | "unlimited";

export type BuildingType =
  | "residential"
  | "commercial"
  | "office"
  | "warehouse";

export type ConstructionType =
  | "new_construction"
  | "renovation"
  | "addition"
  | "commercial_ti"
  | "other";

export type BuildingAge =
  | "pre_1980"
  | "1980_2000"
  | "2000_2015"
  | "2015_plus";

export type StoriesCount = 1 | 2 | 3 | 4;

export type YesNoChoice = "yes" | "no";

export type BuildingShape =
  | "simple_rectangle"
  | "l_shaped"
  | "complex"
  | "multiple_buildings";

export type WifiRoomInput = {
  id: string;
  name: string;
  floor: 1 | 2 | 3 | 4;
  lengthFt: number;
  widthFt: number;
  roomType: RoomTypeOption;
  wallMaterial: RoomWallMaterial;
  outdoor: boolean;
  ceilingHeight: CeilingHeight;
  expectedDevices: number;
};

export type WifiAnalyzerInputs = {
  projectName: string;
  /** Client / homeowner name for proposals and records. */
  clientName: string;
  buildingType: BuildingType;
  /** If undefined/empty, engine uses sum of complete room areas. */
  totalBuildingSqFt: number | undefined;
  constructionType: ConstructionType;
  buildingAge: BuildingAge;
  stories: StoriesCount;
  basement: YesNoChoice;
  atticAccess: YesNoChoice;
  buildingShape: BuildingShape;
  rooms: WifiRoomInput[];
  planningPriority: PlanningPriority;
  internetSpeedMbps: number;
  coverageGoal: CoverageGoal;
  poe: PoeChoice;
  vendor: VendorChoice;
  budget: BudgetTier;
};

export type RoomPlanRow = {
  id: string;
  name: string;
  floor: number;
  areaSqFt: number;
  complete: boolean;
  incompleteReason?: string;
  score: number;
  zoneType: string;
  outdoor: boolean;
  /** Whole-home plan: notional AP assignment for scope documents. */
  servedByAp: string;
};

/** Labor hours for installation planning (rule-based). */
export type LaborHoursBreakdown = {
  cableRoughInHours: number;
  apMountTerminateHours: number;
  switchGatewaySetupHours: number;
  networkConfigHours: number;
  testingWalkthroughHours: number;
  totalLaborHours: number;
};

export function computeLaborHours(
  cat6Drops: number,
  totalAps: number,
): LaborHoursBreakdown {
  const cableRoughInHours = Math.max(0, cat6Drops) * 1.5;
  const apMountTerminateHours = Math.max(0, totalAps) * 0.5;
  const switchGatewaySetupHours = 2;
  const networkConfigHours = Math.max(1, Math.ceil(Math.max(0, totalAps) / 10));
  const testingWalkthroughHours = 1;
  const totalLaborHours =
    cableRoughInHours +
    apMountTerminateHours +
    switchGatewaySetupHours +
    networkConfigHours +
    testingWalkthroughHours;
  return {
    cableRoughInHours,
    apMountTerminateHours,
    switchGatewaySetupHours,
    networkConfigHours,
    testingWalkthroughHours,
    totalLaborHours: Math.round(totalLaborHours * 10) / 10,
  };
}

function assignServedByAp(
  rows: Omit<RoomPlanRow, "servedByAp">[],
  indoorAps: number,
  outdoorAps: number,
): RoomPlanRow[] {
  const indoorOrder = rows
    .filter((r) => r.complete && !r.outdoor)
    .sort((a, b) => a.floor - b.floor || b.areaSqFt - a.areaSqFt);
  const outdoorOrder = rows
    .filter((r) => r.complete && r.outdoor)
    .sort((a, b) => a.floor - b.floor || b.areaSqFt - a.areaSqFt);

  const indoorMap = new Map<string, string>();
  indoorOrder.forEach((row, idx) => {
    if (indoorAps <= 0) {
      indoorMap.set(row.id, "No indoor APs in this plan");
      return;
    }
    const n = (idx % indoorAps) + 1;
    indoorMap.set(
      row.id,
      `Indoor AP ${n} of ${indoorAps} (whole-home layout; final placement on site)`,
    );
  });

  const outdoorMap = new Map<string, string>();
  outdoorOrder.forEach((row, idx) => {
    if (outdoorAps <= 0) {
      outdoorMap.set(row.id, "No dedicated outdoor AP in plan");
      return;
    }
    const n = (idx % outdoorAps) + 1;
    outdoorMap.set(
      row.id,
      `Outdoor AP ${n} of ${outdoorAps} (placement on site)`,
    );
  });

  return rows.map((row) => ({
    ...row,
    servedByAp: !row.complete
      ? "—"
      : row.outdoor
        ? outdoorMap.get(row.id) ?? "—"
        : indoorMap.get(row.id) ?? "—",
  }));
}

export type EquipmentRec = {
  apModel: string;
  outdoorApModel: string | null;
  switchNote: string;
  switchPorts: number;
  costRangeLabel: string;
  /** e.g. "3× UniFi U6 Pro ($179 ea.)" */
  wholeHomeApPlan: string;
};

function ceilingNum(h: CeilingHeight): number {
  switch (h) {
    case "8":
      return 8;
    case "9":
      return 9;
    case "10":
      return 10;
    case "12":
      return 12;
    case "higher":
      return 13;
    default:
      return 9;
  }
}

/** Exact scoring system from spec. */
export function scoreRoom(
  room: WifiRoomInput,
  priority: PlanningPriority,
): number {
  let score = 0;
  const area = Math.max(0, room.lengthFt) * Math.max(0, room.widthFt);
  const ch = ceilingNum(room.ceilingHeight);
  const devices = Math.max(0, room.expectedDevices);

  if (room.outdoor) score += 5;
  if (area >= 350) score += 4;
  else if (area >= 180) score += 2;
  else if (area > 0) score += 1;
  if (ch >= 10) score += 2;
  else if (ch >= 9) score += 1;
  if (devices >= 15) score += 3;
  else if (devices >= 8) score += 2;
  else if (devices >= 3) score += 1;

  if (
    room.wallMaterial === "brick" ||
    room.wallMaterial === "concrete_block"
  ) {
    score += 2;
  } else if (
    room.wallMaterial === "plaster" ||
    room.wallMaterial === "mixed"
  ) {
    score += 1;
  }

  if (room.roomType === "office") score += 2;
  if (room.roomType === "living_room" || room.roomType === "kitchen")
    score += 1;

  if (priority === "best_performance") score += 2;
  if (priority === "future_proof") score += 3;
  if (priority === "lowest_cost") score -= 2;

  return score;
}

function zoneTypeForRoom(room: WifiRoomInput, score: number): string {
  if (room.outdoor) return "Outdoor coverage zone";
  if (room.roomType === "office" && room.expectedDevices >= 8) {
    return "High-demand office";
  }
  if (score >= 12) return "Primary coverage zone";
  if (score >= 8) return "Shared coverage zone";
  if (score >= 5) return "Transition zone";
  return "Likely shared coverage";
}

function isRoomComplete(r: WifiRoomInput): boolean {
  if (!r.name.trim()) return false;
  if (r.lengthFt <= 0 || r.widthFt <= 0) return false;
  if (![1, 2, 3, 4].includes(r.floor)) return false;
  if (r.expectedDevices < 0 || !Number.isFinite(r.expectedDevices)) {
    return false;
  }
  return true;
}

function incompleteReason(r: WifiRoomInput): string {
  if (!r.name.trim()) return "Room name required";
  if (r.lengthFt <= 0 || r.widthFt <= 0) return "Length and width required";
  if (![1, 2, 3, 4].includes(r.floor)) return "Floor 1–4 required";
  if (r.expectedDevices < 0 || !Number.isFinite(r.expectedDevices)) {
    return "Expected devices must be ≥ 0";
  }
  return "Incomplete";
}

/** Sum of complete room footprints (indoor + outdoor). */
export function sumCompleteRoomsTotalSqFt(rooms: WifiRoomInput[]): number {
  return rooms
    .filter(isRoomComplete)
    .reduce((s, r) => s + r.lengthFt * r.widthFt, 0);
}

/** Whole-home AP count (not one AP per room). */
export function planAPs(
  rooms: WifiRoomInput[],
  priority: PlanningPriority,
  options?: { indoorAreaScale?: number },
): { indoorAps: number; outdoorAps: number; planNotes: string[] } {
  const complete = rooms.filter(isRoomComplete);
  const indoorRooms = complete.filter((r) => !r.outdoor);
  const outdoorRooms = complete.filter((r) => r.outdoor);

  const scale = options?.indoorAreaScale ?? 1;
  const indoorArea =
    indoorRooms.reduce((s, r) => s + r.lengthFt * r.widthFt, 0) * scale;
  const totalDevices = complete.reduce(
    (s, r) => s + Math.max(0, r.expectedDevices),
    0,
  );
  const floorSet = new Set(indoorRooms.map((r) => r.floor));
  const floorCount = floorSet.size;

  const planNotes: string[] = [
    "AP count is for a whole-home layout, not one access point per room.",
  ];

  let indoorAps = 0;
  if (indoorRooms.length > 0) indoorAps = 1;
  if (indoorArea > 1400) indoorAps += 1;
  if (indoorArea > 2600) indoorAps += 1;
  if (indoorArea > 3800) indoorAps += 1;
  if (floorCount >= 2 && indoorArea > 1800) {
    indoorAps += 1;
    planNotes.push("Added AP for multi-floor coverage (2+ floors, >1,800 sq ft indoor).");
  }
  if (totalDevices > 35) {
    indoorAps += 1;
    planNotes.push("Added AP for high device count (>35).");
  }

  const hardWallRooms = indoorRooms.filter((r) =>
    ["brick", "concrete_block", "mixed"].includes(r.wallMaterial),
  ).length;
  if (hardWallRooms >= 3) {
    indoorAps += 1;
    planNotes.push("Added AP for 3+ hard-wall (brick / block / mixed) rooms.");
  }

  const primaryCount = indoorRooms.filter((r) => {
    const sc = scoreRoom(r, priority);
    return zoneTypeForRoom(r, sc) === "Primary coverage zone";
  }).length;
  if (primaryCount >= 4) {
    indoorAps += 1;
    planNotes.push("Added AP for 4+ primary coverage zones.");
  }

  if (priority === "best_performance" || priority === "future_proof") {
    indoorAps += 1;
    planNotes.push(`Extra AP for ${priority.replace(/_/g, " ")} priority.`);
  }

  let outdoorAps = 0;
  for (const r of outdoorRooms) {
    const a = r.lengthFt * r.widthFt;
    if (a >= 80) outdoorAps += 1;
  }

  if (indoorRooms.length > 0) indoorAps = Math.max(1, indoorAps);

  return { indoorAps, outdoorAps, planNotes };
}

function applyCoverageGoalToIndoor(
  indoorAps: number,
  goal: CoverageGoal,
): number {
  if (indoorAps <= 0) return 0;
  let n = indoorAps;
  if (goal === "smart_home") n = Math.max(1, Math.ceil(n * 1.2));
  if (goal === "commercial") n = Math.max(1, Math.ceil(n * 1.25));
  if (goal === "high_density_iot") n += 1;
  if (goal === "streaming") n += 1;
  return Math.max(1, n);
}

export function gatewayRecommendation(
  vendor: VendorChoice,
  indoorSqFt: number,
  totalDevices: number,
  priority: PlanningPriority,
): string {
  return planVendorMaterialStack(
    vendor,
    1,
    0,
    Math.max(1, indoorSqFt),
    totalDevices,
    priority,
  ).gatewayRecommendation;
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
  /** Building total sq ft used in assumptions (manual or summed from rooms). */
  buildingUsedSqFt: number;
  totalCoverageSqFt: number;
  effectiveSqFtPerAp: number;
  totalIndoorSqFt: number;
  totalDevices: number;
  totalRooms: number;
  completeRooms: number;
  incompleteRooms: number;
  roomRows: RoomPlanRow[];
  gatewayRecommendation: string;
  planNotes: string[];
  incompleteWarnings: string[];
  laborHours: LaborHoursBreakdown;
  cat6Drops: number;
  cat6FootageLf: number;
  lvBrackets: number;
  rj45Jacks: number;
  patchCables: number;
  poeSwitchPorts: number;
  switchLocationNote: string;
  equipment: EquipmentRec;
  estimatedHardwareCostRange: string;
  hardwareCostEstimateLabel: string;
  /** Itemized materials for BOM / cost card (MSRP-style). */
  hardwareBomLines: HardwareBomLine[];
  /** Sum of hardwareBomLines line totals (mid estimate). */
  materialSubtotalMid: number;
  assumptionsLine: string;
  summaryText: string;
};

function buildSummaryText(
  inputs: WifiAnalyzerInputs,
  r: WifiAnalyzerResults,
): string {
  const lines: string[] = [
    "TPP Electrical Contractors Inc. — Wi-Fi plan summary",
    `Project: ${inputs.projectName}`,
    ...(inputs.clientName?.trim()
      ? [`Client: ${inputs.clientName.trim()}`]
      : []),
    `Building: ${inputs.buildingType}`,
    `Internet: ${inputs.internetSpeedMbps} Mbps`,
    `Planning priority: ${inputs.planningPriority.replace(/_/g, " ")}`,
    `Coverage goal: ${inputs.coverageGoal.replace(/_/g, " ")}`,
    `Vendor: ${inputs.vendor}`,
    `Budget tier: ${r.estimatedHardwareCostRange}`,
    "",
    "ROOMS",
    ...r.roomRows.map((row) =>
      row.complete
        ? `- ${row.name} (fl ${row.floor}) · ${row.areaSqFt} sq ft · ${row.zoneType} · score ${row.score}`
        : `- ${row.name || "(unnamed)"} · INCOMPLETE: ${row.incompleteReason ?? "fix inputs"}`,
    ),
    "",
    "COVERAGE",
    `Building total (used): ${r.buildingUsedSqFt} sq ft · Indoor sq ft: ${r.totalIndoorSqFt} · Devices (summed): ${r.totalDevices}`,
    `APs: ${r.indoorAps} indoor + ${r.outdoorAps} outdoor (${r.recommendedAps} total)`,
    `Avg indoor sq ft / indoor AP: ~${r.coveragePerApSqFt}` +
      (inputs.buildingAge === "pre_1980"
        ? ` · Age-adjusted effective ~${r.effectiveSqFtPerAp} sq ft / AP`
        : ""),
    "",
    "GATEWAY",
    r.gatewayRecommendation,
    "",
    "WHOLE-HOME AP PLAN",
    r.equipment.wholeHomeApPlan,
    "",
    "MATERIALS (low voltage)",
    `CAT6: ${r.cat6FootageLf} LF · Drops: ${r.cat6Drops} · Brackets: ${r.lvBrackets} · Jacks: ${r.rj45Jacks} · Patch: ${r.patchCables} · PoE ports (target): ${r.poeSwitchPorts}`,
    "",
    "ESTIMATED HARDWARE",
    r.hardwareCostEstimateLabel,
    "",
    "LABOR (planning est.)",
    `Cable rough-in: ${r.laborHours.cableRoughInHours} h · AP mount/term: ${r.laborHours.apMountTerminateHours} h · Switch/gateway: ${r.laborHours.switchGatewaySetupHours} h · Config: ${r.laborHours.networkConfigHours} h · Test/walkthrough: ${r.laborHours.testingWalkthroughHours} h · Total: ${r.laborHours.totalLaborHours} h`,
    "",
    "NOTES",
    ...r.planNotes.map((n) => `• ${n}`),
    ...(r.incompleteWarnings.length
      ? ["", "WARNINGS", ...r.incompleteWarnings.map((w) => `• ${w}`)]
      : []),
    "",
    r.assumptionsLine,
  ];
  return lines.join("\n");
}

export function computeWifiPlan(inputs: WifiAnalyzerInputs): WifiAnalyzerResults {
  const rooms = inputs.rooms ?? [];
  const totalRooms = rooms.length;
  const completeRooms = rooms.filter(isRoomComplete).length;
  const incompleteRooms = totalRooms - completeRooms;

  const roomRowsBase = rooms.map((r) => {
    const areaSqFt = Math.round(
      Math.max(0, r.lengthFt) * Math.max(0, r.widthFt),
    );
    const complete = isRoomComplete(r);
    const score = complete ? scoreRoom(r, inputs.planningPriority) : 0;
    const zoneType = complete
      ? zoneTypeForRoom(r, score)
      : "—";
    return {
      id: r.id,
      name: r.name.trim() || "(unnamed)",
      floor: r.floor,
      areaSqFt,
      complete,
      incompleteReason: complete ? undefined : incompleteReason(r),
      score,
      zoneType,
      outdoor: r.outdoor,
    };
  });

  const completeList = rooms.filter(isRoomComplete);
  const indoorRooms = completeList.filter((r) => !r.outdoor);
  const totalIndoorSqFt = indoorRooms.reduce(
    (s, r) => s + r.lengthFt * r.widthFt,
    0,
  );
  const summedBuildingSqFt = sumCompleteRoomsTotalSqFt(rooms);
  const buildingUsedSqFt =
    inputs.totalBuildingSqFt !== undefined &&
    inputs.totalBuildingSqFt > 0 &&
    Number.isFinite(inputs.totalBuildingSqFt)
      ? Math.round(inputs.totalBuildingSqFt)
      : summedBuildingSqFt;
  const totalDevices = completeList.reduce(
    (s, r) => s + Math.max(0, r.expectedDevices),
    0,
  );

  const pre1980 = inputs.buildingAge === "pre_1980";
  const indoorAreaScale = pre1980 ? 1.15 : 1;

  const { indoorAps: baseIndoor, outdoorAps: baseOutdoor, planNotes: baseNotes } =
    planAPs(rooms, inputs.planningPriority, { indoorAreaScale });
  const planNotes = [...baseNotes];
  if (pre1980) {
    planNotes.push(
      "Pre-1980 building: planning assumes heavier wall attenuation (plaster-era typical); AP count biased upward (~15% effective area).",
    );
  }

  let indoorAps = applyCoverageGoalToIndoor(baseIndoor, inputs.coverageGoal);
  let outdoorAps = baseOutdoor;
  if (indoorRooms.length === 0) indoorAps = 0;

  if (
    (inputs.buildingShape === "complex" ||
      inputs.buildingShape === "multiple_buildings") &&
    indoorRooms.length > 0
  ) {
    indoorAps += 1;
    planNotes.push(
      "Complex layout may require additional AP after site survey.",
    );
  }

  const roomRows = assignServedByAp(roomRowsBase, indoorAps, outdoorAps);

  const recommendedAps = indoorAps + outdoorAps;

  const stack = planVendorMaterialStack(
    inputs.vendor,
    indoorAps,
    outdoorAps,
    Math.max(1, totalIndoorSqFt),
    totalDevices,
    inputs.planningPriority,
  );
  const equipment: EquipmentRec = { ...stack.equipment };
  const wholePlanLine = stack.line;

  const poeSwitchPorts = Math.min(48, recommendedAps + 4);
  equipment.switchPorts = poeSwitchPorts;

  const patchCableCount = Math.min(24, recommendedAps + 2);

  const floorCount = new Set(indoorRooms.map((r) => r.floor)).size;
  const perFloorAvg =
    floorCount > 0 ? totalIndoorSqFt / floorCount : totalIndoorSqFt;
  const avgRunFt = Math.min(
    180,
    Math.max(35, Math.round(Math.sqrt(Math.max(1, perFloorAvg)) * 1.15 + 20)),
  );
  let cat6Drops = indoorAps + (outdoorAps > 0 ? outdoorAps : 0);
  let cat6FootageLf = Math.round(indoorAps * avgRunFt + outdoorAps * 55);

  if (inputs.basement === "yes") {
    planNotes.push("Consider AP in basement for coverage.");
    cat6Drops += 1;
    cat6FootageLf += Math.round(Math.min(120, avgRunFt * 0.85 + 25));
  }

  if (inputs.atticAccess === "yes") {
    planNotes.push("Use attic for cable routing where possible.");
    cat6FootageLf = Math.round(cat6FootageLf * 0.85);
  }

  const lvBrackets = indoorAps;
  const rj45Jacks = cat6Drops;

  let switchLocationNote =
    "Place PoE switch central to AP cluster — MDF for commercial, closet or rack for residential.";
  if (inputs.buildingType === "warehouse") {
    switchLocationNote =
      "Warehouse: mount switch in protected IDF; homerun to MDF.";
  }
  if (stack.mesh) {
    switchLocationNote =
      "Mesh: place primary/router node at modem location; add satellites per coverage plan (Ethernet backhaul optional).";
  }

  const hardwareBomLines = buildHardwareBomLines(
    inputs.vendor,
    stack,
    indoorAps,
    outdoorAps,
    cat6FootageLf,
    lvBrackets,
    rj45Jacks,
    patchCableCount,
  );
  const materialSubtotalMid = sumBomMaterialSubtotal(hardwareBomLines);
  const hwLow = Math.max(0, Math.round(materialSubtotalMid * 0.85));
  const hwHigh = Math.round(materialSubtotalMid * 1.2);
  const hardwareCostEstimateLabel = `$${hwLow.toLocaleString()} – $${hwHigh.toLocaleString()} (est., MSRP-style)`;

  const gatewayRec = stack.gatewayRecommendation;

  const incompleteWarnings = roomRows
    .filter((row) => !row.complete)
    .map((row) => `${row.name}: ${row.incompleteReason ?? "Incomplete"}`);

  const coveragePerApSqFt =
    indoorAps > 0 ? Math.round(totalIndoorSqFt / indoorAps) : 0;
  const effectiveSqFtPerAp =
    indoorAps > 0
      ? Math.round((totalIndoorSqFt / indoorAps) * (pre1980 ? 0.85 : 1))
      : 0;
  const totalCoverageSqFt = completeList.reduce(
    (s, r) => s + r.lengthFt * r.widthFt,
    0,
  );

  const clientBit = inputs.clientName?.trim()
    ? `Client ${inputs.clientName.trim()} · `
    : "";
  const assumptionsLine = `${clientBit}Building total (used): ${buildingUsedSqFt} sq ft · Rooms: ${completeRooms}/${totalRooms} complete · Indoor ${totalIndoorSqFt} sq ft · Devices ${totalDevices} · Age ${inputs.buildingAge.replace(/_/g, " ")} · Stories ${inputs.stories}${inputs.stories === 4 ? "+" : ""} · Priority ${inputs.planningPriority.replace(/_/g, " ")} · Coverage goal ${inputs.coverageGoal.replace(/_/g, " ")} · Internet ${inputs.internetSpeedMbps} Mbps`;

  const laborHours = computeLaborHours(cat6Drops, recommendedAps);

  const base: WifiAnalyzerResults = {
    recommendedAps,
    indoorAps,
    outdoorAps,
    coveragePerApSqFt,
    buildingUsedSqFt,
    totalCoverageSqFt,
    effectiveSqFtPerAp,
    totalIndoorSqFt,
    totalDevices,
    totalRooms,
    completeRooms,
    incompleteRooms,
    roomRows,
    gatewayRecommendation: gatewayRec,
    planNotes,
    incompleteWarnings,
    laborHours,
    cat6Drops,
    cat6FootageLf,
    lvBrackets,
    rj45Jacks,
    patchCables: patchCableCount,
    poeSwitchPorts,
    switchLocationNote,
    equipment: { ...equipment, wholeHomeApPlan: wholePlanLine },
    estimatedHardwareCostRange: budgetCostRange(inputs.budget),
    hardwareCostEstimateLabel,
    hardwareBomLines,
    materialSubtotalMid,
    assumptionsLine,
    summaryText: "",
  };
  base.summaryText = buildSummaryText(inputs, base);
  return base;
}
