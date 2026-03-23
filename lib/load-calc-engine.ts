/**
 * Rule-based residential load calculator (NEC Article 220 Part II — illustrative).
 * Not a substitute for professional engineering; for estimation and education only.
 */

export type ResidentialBuildingType =
  | "single_family"
  | "multi_family"
  | "condo";

export type ResidentialApplianceKey =
  | "range"
  | "dryer"
  | "waterHeater"
  | "dishwasher"
  | "refrigerator"
  | "microwave"
  | "ac"
  | "electricHeat"
  | "evL1"
  | "evL2"
  | "hotTub"
  | "poolPump"
  | "generator";

export type ResidentialInputs = {
  projectName: string;
  squareFootage: number;
  buildingType: ResidentialBuildingType;
  bedrooms: number;
  bathrooms: number;
  appliances: Record<
    ResidentialApplianceKey,
    { enabled: boolean; watts?: number; tons?: number; kw?: number }
  >;
};

export type ResidentialResults = {
  generalLightingVa: number;
  smallApplianceVa: number;
  laundryVa: number;
  subtotalBeforeDemand: number;
  afterDemandVa: number;
  fixedAppliancesVa: number;
  coolingVa: number;
  heatingVa: number;
  hvacVa: number;
  totalVa: number;
  requiredAmps: number;
  recommendedServiceAmps: 100 | 150 | 200 | 400;
  breakdown: { label: string; va: number }[];
};

/** NEC Table 220.42 demand factors for dwelling unit general loads. */
export function nec220_42Demand(combinedVa: number): number {
  if (combinedVa <= 0) return 0;
  const c1 = Math.min(combinedVa, 3000);
  let rem = combinedVa - c1;
  let out = c1;
  const c2cap = 120_000 - 3000;
  const c2 = Math.min(rem, c2cap);
  out += c2 * 0.35;
  rem -= c2;
  if (rem > 0) out += rem * 0.25;
  return out;
}

const STANDARD_SIZES = [100, 150, 200, 400] as const;

export function roundUpServiceAmps(amps: number): 100 | 150 | 200 | 400 {
  for (const s of STANDARD_SIZES) {
    if (amps <= s) return s;
  }
  return 400;
}

function acVaFromTons(tons: number): number {
  if (!Number.isFinite(tons) || tons <= 0) return 0;
  // Illustrative: ~1,200 VA per ton nameplate equivalent (tool default; verify equipment).
  return Math.round(tons * 1200);
}

export function computeResidentialLoad(
  input: ResidentialInputs,
): ResidentialResults {
  const sq = Math.max(0, input.squareFootage);
  const generalLightingVa = sq * 3;
  const smallApplianceVa = 3000;
  const laundryVa = 1500;
  const subtotalBeforeDemand =
    generalLightingVa + smallApplianceVa + laundryVa;
  const afterDemandVa = nec220_42Demand(subtotalBeforeDemand);

  const a = input.appliances;
  let fixedAppliancesVa = 0;

  const add = (key: ResidentialApplianceKey, defaultW: number) => {
    const row = a[key];
    if (!row?.enabled) return;
    const w =
      key === "ac"
        ? acVaFromTons(row.tons ?? 0)
        : key === "electricHeat" || key === "generator"
          ? Math.max(0, (row.kw ?? 0) * 1000)
          : Math.max(0, row.watts ?? defaultW);
    fixedAppliancesVa += w;
  };

  add("range", 8000);
  add("dryer", 5000);
  add("waterHeater", 4500);
  add("dishwasher", 1200);
  add("refrigerator", 150);
  add("microwave", 1500);
  add("ac", 0);
  add("electricHeat", 0);
  add("evL1", 1440);
  add("evL2", 7200);
  add("hotTub", 5000);
  add("poolPump", 2000);
  add("generator", 0);

  const coolingVa =
    a.ac?.enabled ? acVaFromTons(a.ac.tons ?? 0) : 0;
  const heatingVa =
    a.electricHeat?.enabled
      ? Math.max(0, (a.electricHeat.kw ?? 0) * 1000)
      : 0;
  const hvacVa = Math.max(coolingVa, heatingVa);

  const totalVa =
    afterDemandVa + fixedAppliancesVa + hvacVa;
  const requiredAmps = totalVa / 240;
  const recommendedServiceAmps = roundUpServiceAmps(
    Math.ceil(requiredAmps * 100) / 100,
  );

  const breakdown: { label: string; va: number }[] = [
    { label: "General lighting (3 VA/sq ft)", va: generalLightingVa },
    { label: "Small appliance circuits (2 × 1,500 VA)", va: smallApplianceVa },
    { label: "Laundry circuit", va: laundryVa },
    { label: "Subtotal before demand", va: subtotalBeforeDemand },
    { label: "After NEC Table 220.42 demand", va: Math.round(afterDemandVa) },
    { label: "Fixed appliances (100%)", va: Math.round(fixedAppliancesVa) },
    { label: "HVAC (larger of heat / cool)", va: Math.round(hvacVa) },
    { label: "Total calculated load", va: Math.round(totalVa) },
  ];

  return {
    generalLightingVa,
    smallApplianceVa,
    laundryVa,
    subtotalBeforeDemand,
    afterDemandVa: Math.round(afterDemandVa),
    fixedAppliancesVa: Math.round(fixedAppliancesVa),
    coolingVa: Math.round(coolingVa),
    heatingVa: Math.round(heatingVa),
    hvacVa: Math.round(hvacVa),
    totalVa: Math.round(totalVa),
    requiredAmps: Math.round(requiredAmps * 100) / 100,
    recommendedServiceAmps,
    breakdown,
  };
}

export type CommercialOccupancy = "office" | "retail" | "restaurant" | "warehouse";

export type CommercialInputs = {
  projectName: string;
  occupancy: CommercialOccupancy;
  squareFootage: number;
  /** VA by category — user-entered connected load */
  lightingVa: number;
  receptacleVa: number;
  equipmentVa: number;
  hvacVa: number;
  otherVa: number;
};

export type CommercialResults = {
  generalVaPerSq: number;
  baseVa: number;
  afterDemandVa: number;
  totalVa: number;
  requiredAmps: number;
  recommendedServiceAmps: 100 | 150 | 200 | 400;
  demandNote: string;
  breakdown: { label: string; va: number }[];
};

/** Simplified Part III–style demand by occupancy (illustrative). */
function commercialDemandFactor(
  occupancy: CommercialOccupancy,
  subtotal: number,
): { va: number; note: string } {
  if (subtotal <= 0) return { va: 0, note: "No connected load." };
  switch (occupancy) {
    case "office": {
      const first = Math.min(subtotal, 10_000) * 1.0;
      const rest = Math.max(0, subtotal - 10_000) * 0.5;
      return {
        va: Math.round(first + rest),
        note: "Office: first 10,000 VA at 100%, remainder at 50% (simplified).",
      };
    }
    case "retail": {
      return {
        va: Math.round(subtotal * 0.9),
        note: "Retail: illustrative 90% demand on combined load.",
      };
    }
    case "restaurant": {
      const first = Math.min(subtotal, 20_000) * 0.8;
      const rest = Math.max(0, subtotal - 20_000) * 0.65;
      return {
        va: Math.round(first + rest),
        note: "Restaurant: simplified tiered demand (verify NEC Table 220.56 / AHJ).",
      };
    }
    case "warehouse": {
      return {
        va: Math.round(subtotal * 1.0),
        note: "Warehouse: 100% of calculated load (simplified storage occupancy).",
      };
    }
  }
}

const OCC_VA_PER_SQ: Record<CommercialOccupancy, number> = {
  office: 3.7,
  retail: 3,
  restaurant: 8,
  warehouse: 0.5,
};

export function computeCommercialLoad(input: CommercialInputs): CommercialResults {
  const sq = Math.max(0, input.squareFootage);
  const generalVaPerSq = OCC_VA_PER_SQ[input.occupancy];
  const generalVa = sq * generalVaPerSq;
  const connected =
    generalVa +
    Math.max(0, input.lightingVa) +
    Math.max(0, input.receptacleVa) +
    Math.max(0, input.equipmentVa) +
    Math.max(0, input.hvacVa) +
    Math.max(0, input.otherVa);

  const { va: afterDemandVa, note: demandNote } = commercialDemandFactor(
    input.occupancy,
    connected,
  );
  const totalVa = afterDemandVa;
  const requiredAmps = totalVa / 240;
  const recommendedServiceAmps = roundUpServiceAmps(
    Math.ceil(requiredAmps * 100) / 100,
  );

  const breakdown: { label: string; va: number }[] = [
    {
      label: `General (VA/sq ft × ${sq.toLocaleString()} sq ft @ ${generalVaPerSq} VA/sf)`,
      va: Math.round(generalVa),
    },
    { label: "Additional lighting (connected)", va: Math.round(input.lightingVa) },
    { label: "Receptacle load", va: Math.round(input.receptacleVa) },
    { label: "Fixed equipment", va: Math.round(input.equipmentVa) },
    { label: "HVAC", va: Math.round(input.hvacVa) },
    { label: "Other", va: Math.round(input.otherVa) },
    { label: "Subtotal (before demand)", va: Math.round(connected) },
    { label: "After occupancy demand factors", va: afterDemandVa },
    { label: "Total calculated load", va: totalVa },
  ];

  return {
    generalVaPerSq,
    baseVa: Math.round(generalVa),
    afterDemandVa: totalVa,
    totalVa,
    requiredAmps: Math.round(requiredAmps * 100) / 100,
    recommendedServiceAmps,
    demandNote,
    breakdown,
  };
}
