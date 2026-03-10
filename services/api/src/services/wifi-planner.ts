export type WallDensity = "low" | "medium" | "high";
export type WallType = "drywall" | "plaster" | "concrete_block" | "brick" | "metal_stud";
export type InsulationType = "none" | "fiberglass" | "mineral_wool" | "spray_foam" | "foil_faced";
export type StructuralMetal = "none" | "light" | "moderate" | "heavy";
export type WifiVendorProfile = "ubiquiti" | "generic";

export type WifiPlannerInput = {
  squareFeet: number;
  floors: number;
  wallDensity: WallDensity;
  wallType: WallType;
  insulationType: InsulationType;
  structuralMetal: StructuralMetal;
  vendorProfile: WifiVendorProfile;
  highDensityRooms: number;
  includeOutdoorCoverage: boolean;
  throughputTargetMbps: number;
  concurrentUsers: number;
  avgDeviceMbps: number;
  poeHeadroomPercent: number;
};

export type WifiPlannerResult = {
  recommendedAccessPoints: number;
  coverageDrivenAps: number;
  capacityDrivenAps: number;
  suggestedController: "cloud_managed" | "managed_controller";
  recommendedSwitchPorts: number;
  estimatedCat6Feet: number;
  estimatedLaborHours: number;
  rackCount: number;
  targetChannelWidthMHz: 20 | 40;
  suggested5ghzChannels: number[];
  estimatedPoeWatts: number;
  recommendedGear: Array<{
    vendor: "Ubiquiti" | "Generic";
    category: "access_point" | "switch" | "gateway_controller";
    model: string;
    quantity: number;
    notes: string;
  }>;
  billOfMaterials: Array<{
    category: string;
    item: string;
    quantity: number;
    unit: string;
    estimatedUnitCostUsd: number;
    estimatedExtendedCostUsd: number;
  }>;
  placementZones: string[];
  assumptions: string[];
  notes: string[];
};

const COVERAGE_BASE_AREA_PER_AP_SQFT = 1400;
const WALL_ATTENUATION_FACTOR: Record<WallDensity, number> = {
  low: 1.08,
  medium: 0.82,
  high: 0.62
};
const WALL_TYPE_FACTOR: Record<WallType, number> = {
  drywall: 1,
  plaster: 0.92,
  concrete_block: 0.76,
  brick: 0.8,
  metal_stud: 0.87
};
const INSULATION_FACTOR: Record<InsulationType, number> = {
  none: 1,
  fiberglass: 0.96,
  mineral_wool: 0.94,
  spray_foam: 0.9,
  foil_faced: 0.84
};
const STRUCTURAL_METAL_FACTOR: Record<StructuralMetal, number> = {
  none: 1,
  light: 0.9,
  moderate: 0.8,
  heavy: 0.68
};
const PRACTICAL_AP_CAPACITY_MBPS = 350;
const AP_POE_WATTS = 18;
const SUGGESTED_5GHZ_CHANNELS = [36, 40, 44, 48, 149, 153, 157, 161];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function chooseUbiquitiApModel(input: WifiPlannerInput, recommendedAps: number): string {
  if (input.throughputTargetMbps >= 1000 || input.concurrentUsers >= 90 || input.highDensityRooms >= 4) {
    return "UniFi U7 Pro";
  }
  if (recommendedAps >= 10 || input.concurrentUsers >= 60) {
    return "UniFi U6 Enterprise";
  }
  return "UniFi U6 Pro";
}

function chooseUbiquitiSwitchModel(ports: number): string {
  if (ports > 36) {
    return "UniFi USW Pro Max 48 PoE";
  }
  if (ports > 20) {
    return "UniFi USW Pro Max 24 PoE";
  }
  return "UniFi USW Pro Max 16 PoE";
}

function buildWifiBom(params: {
  vendorProfile: WifiVendorProfile;
  recommendedAps: number;
  recommendedSwitchPorts: number;
  estimatedCat6Feet: number;
  includeOutdoorCoverage: boolean;
  rackCount: number;
  apModel: string;
  switchModel: string;
  controllerModel: string;
}): WifiPlannerResult["billOfMaterials"] {
  const cableBoxes = Math.max(1, Math.ceil(params.estimatedCat6Feet / 1000));
  const patchPanelCount = Math.max(1, Math.ceil(params.recommendedSwitchPorts / 24));
  const keystoneCount = Math.max(1, params.recommendedAps + Math.ceil(params.recommendedSwitchPorts * 0.25));
  const patchCordCount = params.recommendedAps + Math.max(2, Math.ceil(params.recommendedSwitchPorts * 0.2));
  const wallPlateCount = params.recommendedAps;

  const lines: WifiPlannerResult["billOfMaterials"] = [
    {
      category: "Access Point",
      item: params.apModel,
      quantity: params.recommendedAps,
      unit: "ea",
      estimatedUnitCostUsd: params.vendorProfile === "ubiquiti" ? 189 : 220,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Switching",
      item: params.switchModel,
      quantity: params.rackCount,
      unit: "ea",
      estimatedUnitCostUsd: params.vendorProfile === "ubiquiti" ? 799 : 950,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Gateway/Controller",
      item: params.controllerModel,
      quantity: 1,
      unit: "ea",
      estimatedUnitCostUsd: params.vendorProfile === "ubiquiti" ? 599 : 750,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Structured Cabling",
      item: "Cat6 Cable (1000 ft box)",
      quantity: cableBoxes,
      unit: "box",
      estimatedUnitCostUsd: 165,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Structured Cabling",
      item: "24-port Patch Panel",
      quantity: patchPanelCount,
      unit: "ea",
      estimatedUnitCostUsd: 95,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Structured Cabling",
      item: "Cat6 Keystone Jack",
      quantity: keystoneCount,
      unit: "ea",
      estimatedUnitCostUsd: 4.2,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Structured Cabling",
      item: "Patch Cords",
      quantity: patchCordCount,
      unit: "ea",
      estimatedUnitCostUsd: 6.5,
      estimatedExtendedCostUsd: 0
    },
    {
      category: "Faceplates",
      item: "Single Gang Data Plate",
      quantity: wallPlateCount,
      unit: "ea",
      estimatedUnitCostUsd: 1.75,
      estimatedExtendedCostUsd: 0
    }
  ];

  if (params.includeOutdoorCoverage) {
    lines.push({
      category: "Access Point",
      item: params.vendorProfile === "ubiquiti" ? "UniFi U6 Mesh (Outdoor)" : "Outdoor WiFi AP",
      quantity: 1,
      unit: "ea",
      estimatedUnitCostUsd: params.vendorProfile === "ubiquiti" ? 179 : 220,
      estimatedExtendedCostUsd: 0
    });
  }

  return lines.map((item) => ({
    ...item,
    estimatedExtendedCostUsd: round2(item.quantity * item.estimatedUnitCostUsd)
  }));
}

export function buildWifiPlan(input: WifiPlannerInput): WifiPlannerResult {
  const totalServiceAreaSqFt = input.squareFeet * input.floors;
  const environmentalAttenuationFactor =
    WALL_ATTENUATION_FACTOR[input.wallDensity] *
    WALL_TYPE_FACTOR[input.wallType] *
    INSULATION_FACTOR[input.insulationType] *
    STRUCTURAL_METAL_FACTOR[input.structuralMetal];
  const effectiveAreaPerAp = Math.max(
    325,
    Math.round(COVERAGE_BASE_AREA_PER_AP_SQFT * environmentalAttenuationFactor)
  );

  const baseCoverageAps = Math.ceil(totalServiceAreaSqFt / effectiveAreaPerAp);
  const outdoorCoverageAps = input.includeOutdoorCoverage ? 1 : 0;
  const coverageDrivenAps = Math.max(1, baseCoverageAps + outdoorCoverageAps);

  const utilizationFactor = 1.2;
  const demandMbps = Math.max(
    input.throughputTargetMbps,
    Math.ceil(input.concurrentUsers * input.avgDeviceMbps * utilizationFactor)
  );
  const baseCapacityAps = Math.ceil(demandMbps / PRACTICAL_AP_CAPACITY_MBPS);
  const highDensityRoomAps = Math.ceil(input.highDensityRooms / 2);
  const capacityDrivenAps = Math.max(1, baseCapacityAps + highDensityRoomAps);

  const recommendedAccessPoints = Math.max(coverageDrivenAps, capacityDrivenAps);
  const targetChannelWidthMHz: 20 | 40 = recommendedAccessPoints > 8 ? 20 : 40;
  const recommendedSwitchPorts = Math.max(8, Math.ceil(recommendedAccessPoints * 1.3 + 2));

  const verticalAllowanceFeet = input.floors > 1 ? (input.floors - 1) * 15 : 0;
  const avgRunFeetPerAp = 95 + verticalAllowanceFeet;
  const estimatedCat6Feet =
    Math.ceil(recommendedAccessPoints * avgRunFeetPerAp) + input.highDensityRooms * 25 + (input.includeOutdoorCoverage ? 80 : 0);

  const rackCount = recommendedAccessPoints > 16 || recommendedSwitchPorts > 40 ? 2 : 1;
  const estimatedLaborHours = Number((recommendedAccessPoints * 2.1 + input.floors * 2.2 + input.highDensityRooms * 0.4).toFixed(1));
  const estimatedPoeWatts = Math.ceil(recommendedAccessPoints * AP_POE_WATTS * (1 + input.poeHeadroomPercent / 100));
  const ubiquitiApModel = chooseUbiquitiApModel(input, recommendedAccessPoints);
  const ubiquitiSwitchModel = chooseUbiquitiSwitchModel(recommendedSwitchPorts);
  const ubiquitiControllerModel =
    recommendedAccessPoints > 18 || rackCount > 1 ? "UniFi Cloud Gateway Enterprise" : "UniFi Cloud Gateway Max";
  const recommendedGear =
    input.vendorProfile === "ubiquiti"
      ? [
          {
            vendor: "Ubiquiti" as const,
            category: "access_point" as const,
            model: ubiquitiApModel,
            quantity: recommendedAccessPoints,
            notes: "Primary indoor AP recommendation based on coverage and user density."
          },
          {
            vendor: "Ubiquiti" as const,
            category: "switch" as const,
            model: ubiquitiSwitchModel,
            quantity: rackCount,
            notes: "PoE switch sized for AP count plus growth."
          },
          {
            vendor: "Ubiquiti" as const,
            category: "gateway_controller" as const,
            model: ubiquitiControllerModel,
            quantity: 1,
            notes: "Controller/gateway for centralized management and monitoring."
          }
        ]
      : [
          {
            vendor: "Generic" as const,
            category: "access_point" as const,
            model: "Enterprise WiFi 6/7 AP",
            quantity: recommendedAccessPoints,
            notes: "Select AP SKU with equivalent throughput and PoE profile."
          },
          {
            vendor: "Generic" as const,
            category: "switch" as const,
            model: "Managed PoE+ Access Switch",
            quantity: rackCount,
            notes: "Size ports and PoE budget to AP count plus reserve."
          },
          {
            vendor: "Generic" as const,
            category: "gateway_controller" as const,
            model: "Managed Gateway + Controller",
            quantity: 1,
            notes: "Use centralized management for AP and RF policy control."
          }
        ];
  const billOfMaterials = buildWifiBom({
    vendorProfile: input.vendorProfile,
    recommendedAps: recommendedAccessPoints,
    recommendedSwitchPorts,
    estimatedCat6Feet,
    includeOutdoorCoverage: input.includeOutdoorCoverage,
    rackCount,
    apModel: input.vendorProfile === "ubiquiti" ? ubiquitiApModel : "Enterprise WiFi 6/7 AP",
    switchModel: input.vendorProfile === "ubiquiti" ? ubiquitiSwitchModel : "Managed PoE+ Access Switch",
    controllerModel: input.vendorProfile === "ubiquiti" ? ubiquitiControllerModel : "Managed Gateway + Controller"
  });

  const assumptions = [
    `Coverage baseline uses ~${COVERAGE_BASE_AREA_PER_AP_SQFT} sq ft/AP before wall attenuation.`,
    `Environmental attenuation applied for wall type (${input.wallType}), insulation (${input.insulationType}), and structural metal (${input.structuralMetal}).`,
    `Capacity baseline uses ~${PRACTICAL_AP_CAPACITY_MBPS} Mbps practical throughput per AP.`,
    "Sizing targets -67 dBm design intent for primary coverage areas.",
    "AP count uses the greater of coverage-driven and capacity-driven requirements."
  ];

  const notes = [
    "Use predictive planning for early budgeting, then validate with an on-site RF survey.",
    "Finalize channel/power settings during commissioning to reduce co-channel interference.",
    "Review cable path lengths and switch PoE budget against actual rack/IDF locations."
  ];

  return {
    recommendedAccessPoints,
    coverageDrivenAps,
    capacityDrivenAps,
    suggestedController: recommendedAccessPoints > 12 ? "managed_controller" : "cloud_managed",
    recommendedSwitchPorts,
    estimatedCat6Feet,
    estimatedLaborHours,
    rackCount,
    targetChannelWidthMHz,
    suggested5ghzChannels: SUGGESTED_5GHZ_CHANNELS.slice(0, Math.max(2, Math.min(8, recommendedAccessPoints))),
    estimatedPoeWatts,
    recommendedGear,
    billOfMaterials,
    placementZones: [
      "Center of major occupancy zones",
      "Hallway/circulation spine per floor",
      "Dedicated APs for high-density rooms",
      ...(input.includeOutdoorCoverage ? ["Weather-rated AP for exterior coverage"] : [])
    ],
    assumptions,
    notes
  };
}
