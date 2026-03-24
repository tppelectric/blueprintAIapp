/**
 * Rule-based electrical planning estimates (NEC-oriented heuristics).
 * Not a substitute for professional engineering or AHJ requirements.
 */

import {
  computeResidentialLoad,
  roundUpServiceAmps,
  type ResidentialBuildingType,
  type ResidentialInputs,
} from "@/lib/load-calc-engine";

export type EleBuildingType =
  | "single_family"
  | "multi_family"
  | "commercial"
  | "industrial"
  | "retail"
  | "restaurant"
  | "office"
  | "warehouse"
  | "addition"
  | "renovation"
  | "other";

export type EleConstructionType =
  | "new_construction"
  | "renovation"
  | "addition"
  | "service_upgrade"
  | "tenant_improvement";

export type EleServiceVoltage =
  | "120_240_single"
  | "120_208_three"
  | "277_480_three";

export type EleExistingService =
  | "none_new"
  | "100"
  | "150"
  | "200"
  | "400";

export type EleTargetService =
  | "100"
  | "150"
  | "200"
  | "400"
  | "800"
  | "1200"
  | "as_calculated";

export type ElePermit = "yes" | "no" | "unknown";

export type EleRoomType =
  | "living_room"
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "dining_room"
  | "office"
  | "garage"
  | "basement"
  | "utility_room"
  | "laundry"
  | "hallway"
  | "mechanical"
  | "panel_room"
  | "outdoor"
  | "other";

export type EleCeiling = "8" | "9" | "10" | "12" | "14" | "higher";

export type EleAfciChoice = "yes" | "no" | "unknown";

export type EleDedicatedInput = {
  refrigerator: boolean;
  dishwasher: boolean;
  microwave: boolean;
  disposal: boolean;
  rangeOven: boolean;
  dryer: boolean;
  washer: boolean;
  acHeatPumpTons: number;
  evLevel1: boolean;
  evLevel2: boolean;
  hotTub: "none" | "50" | "60";
  poolPump: "none" | "20" | "30";
  generatorTransfer: boolean;
  customDedicatedCount: number;
};

export type EleLowVoltageInput = {
  coax: boolean;
  ethernetDrops: number;
  phone: boolean;
  doorbell: boolean;
  thermostatWire: boolean;
  speakerWire: boolean;
  securitySensor: boolean;
};

export type ElectricalRoomInput = {
  id: string;
  name: string;
  floor: number;
  lengthFt: number;
  widthFt: number;
  roomType: EleRoomType;
  ceiling: EleCeiling;
  rec15: number;
  rec20: number;
  recGfci: number;
  afciRequired: EleAfciChoice;
  recUsb: number;
  recFloor: number;
  recOutdoor: number;
  recessed: number;
  surfaceMount: number;
  underCabinet: boolean;
  dimmers: number;
  threeWay: number;
  occupancySensors: number;
  dedicated: EleDedicatedInput;
  lowVoltage: EleLowVoltageInput;
};

export type ElectricalProjectSetup = {
  projectName: string;
  clientName: string;
  projectAddress: string;
  buildingType: EleBuildingType;
  constructionType: EleConstructionType;
  totalSqFt: number;
  numFloors: number;
  numUnits: number;
  serviceVoltage: EleServiceVoltage;
  existingService: EleExistingService;
  targetService: EleTargetService;
  permitRequired: ElePermit;
  permitDate: string;
};

export type ElectricalAdditionalSystems = {
  smokeDetectors: boolean;
  smokeCount: number;
  smokeInterconnected: boolean;
  coDetectors: boolean;
  securitySystem: boolean;
  generator: boolean;
  genKw: number;
  genTransfer: "manual" | "auto";
  solarBatteryReady: boolean;
  evCharging: boolean;
  poolSpa: boolean;
  irrigation: boolean;
};

export type ElectricalInputs = {
  setup: ElectricalProjectSetup;
  rooms: ElectricalRoomInput[];
  additional: ElectricalAdditionalSystems;
};

export function defaultEleDedicated(): EleDedicatedInput {
  return {
    refrigerator: false,
    dishwasher: false,
    microwave: false,
    disposal: false,
    rangeOven: false,
    dryer: false,
    washer: false,
    acHeatPumpTons: 0,
    evLevel1: false,
    evLevel2: false,
    hotTub: "none",
    poolPump: "none",
    generatorTransfer: false,
    customDedicatedCount: 0,
  };
}

export function defaultEleLowVoltage(): EleLowVoltageInput {
  return {
    coax: false,
    ethernetDrops: 0,
    phone: false,
    doorbell: false,
    thermostatWire: false,
    speakerWire: false,
    securitySensor: false,
  };
}

/** Defaults for a new room row (analyzer UI and floor-plan import). */
export function createElectricalRoom(
  id: string,
  overrides: Partial<ElectricalRoomInput> & Pick<ElectricalRoomInput, "name">,
): ElectricalRoomInput {
  return {
    id,
    name: overrides.name,
    floor: overrides.floor ?? 1,
    lengthFt: overrides.lengthFt ?? 12,
    widthFt: overrides.widthFt ?? 12,
    roomType: overrides.roomType ?? "other",
    ceiling: overrides.ceiling ?? "9",
    rec15: overrides.rec15 ?? 4,
    rec20: overrides.rec20 ?? 0,
    recGfci: overrides.recGfci ?? 0,
    afciRequired: overrides.afciRequired ?? "unknown",
    recUsb: overrides.recUsb ?? 0,
    recFloor: overrides.recFloor ?? 0,
    recOutdoor: overrides.recOutdoor ?? 0,
    recessed: overrides.recessed ?? 0,
    surfaceMount: overrides.surfaceMount ?? 0,
    underCabinet: overrides.underCabinet ?? false,
    dimmers: overrides.dimmers ?? 0,
    threeWay: overrides.threeWay ?? 0,
    occupancySensors: overrides.occupancySensors ?? 0,
    dedicated: overrides.dedicated ?? defaultEleDedicated(),
    lowVoltage: overrides.lowVoltage ?? defaultEleLowVoltage(),
  };
}

export type CircuitCategory =
  | "lighting"
  | "receptacle"
  | "dedicated"
  | "hvac"
  | "spare";

export type CircuitScheduleRow = {
  circuit: number;
  description: string;
  room: string;
  amps: number;
  wire: string;
  gfci: boolean;
  afci: boolean;
  category: CircuitCategory;
};

export type ComplianceItemStatus = "pass" | "warn" | "fail" | "info";

export type ComplianceItem = {
  status: ComplianceItemStatus;
  text: string;
};

export type PanelSlotRow = {
  position: number;
  label: string;
  category: CircuitCategory;
};

export type ElectricalMaterialsRollup = {
  wire14_2NmLf: number;
  wire12_2NmLf: number;
  wire10_2NmLf: number;
  wire6_3NmLf: number;
  wire14_3NmLf: number;
  duplex15: number;
  duplex20: number;
  gfci: number;
  switchSp: number;
  switch3w: number;
  dimmer: number;
  recessed: number;
  surfaceFixtures: number;
  breaker15Sp: number;
  breaker20Sp: number;
  breaker30Dp: number;
  breaker50Dp: number;
  panelSpaces: number;
  panelAmps: number;
  estimatedWireFootage: number;
};

export type ElectricalResults = {
  necEditionLabel: string;
  summary: {
    totalRooms: number;
    totalCircuitsEstimated: number;
    circuitsWithGrowth: number;
    recommendedPanelSpaces: number;
    recommendedPanelAmps: number;
    /** Amps; may be 100–1200 depending on target service selection. */
    recommendedServiceAmps: number;
    estimatedWireFootageLf: number;
    loadCalcTotalVa: number;
    loadCalcRequiredAmps: number;
  };
  circuitSchedule: CircuitScheduleRow[];
  compliance: ComplianceItem[];
  panelSchedule: PanelSlotRow[];
  materials: ElectricalMaterialsRollup;
  laborHoursHint: {
    roughInPerCircuit: number;
    trimOutlets: number;
    trimSwitches: number;
    fixtures: number;
    panelInstall: number;
    serviceEntrance: number;
    inspectionPrep: number;
    walkthrough: number;
    totalEstimated: number;
  };
};

const PANEL_SPACE_OPTIONS = [12, 20, 24, 30, 40, 42] as const;

function nextPanelSpaces(n: number): number {
  for (const s of PANEL_SPACE_OPTIONS) {
    if (n <= s) return s;
  }
  return 42;
}

function wireForAmps(amps: number): string {
  if (amps <= 15) return "14 AWG THHN";
  if (amps <= 20) return "12 AWG THHN";
  if (amps <= 30) return "10 AWG THHN";
  if (amps <= 50) return "6 AWG THHN";
  if (amps <= 100) return "1 AWG THHN";
  return "3/0 AWG THHN";
}

function nmForBranch(amps: number, isThreeWayRun: boolean): {
  type: keyof Pick<
    ElectricalMaterialsRollup,
    | "wire14_2NmLf"
    | "wire12_2NmLf"
    | "wire10_2NmLf"
    | "wire6_3NmLf"
    | "wire14_3NmLf"
  >;
  lf: number;
} {
  const run = 85;
  if (isThreeWayRun) return { type: "wire14_3NmLf", lf: run * 1.2 };
  if (amps <= 15) return { type: "wire14_2NmLf", lf: run };
  if (amps <= 20) return { type: "wire12_2NmLf", lf: run };
  if (amps <= 30) return { type: "wire10_2NmLf", lf: run * 1.1 };
  return { type: "wire6_3NmLf", lf: run * 1.25 };
}

function addressLooksNy(addr: string): boolean {
  const u = addr.toUpperCase();
  return (
    /\bNY\b/.test(u) ||
    /,\s*NEW YORK\b/.test(u) ||
    /\bN\.Y\.\b/.test(u)
  );
}

function permitAfter2025Dec30(isoDate: string): boolean {
  if (!isoDate?.trim()) return false;
  const d = new Date(isoDate + "T12:00:00Z");
  const cutoff = new Date("2025-12-30T23:59:59.999Z");
  return d > cutoff;
}

export function resolveNecEditionLabel(
  projectAddress: string,
  permitDate: string,
): string {
  if (addressLooksNy(projectAddress) && permitAfter2025Dec30(permitDate)) {
    return "2023 NEC (NYS — permit after Dec 30, 2025)";
  }
  if (addressLooksNy(projectAddress)) {
    return "2017 or 2023 NEC — confirm edition with NYS / AHJ for permit date";
  }
  return "2023 NEC (verify local amendments)";
}

function mapBuildingToResidential(
  t: EleBuildingType,
): ResidentialBuildingType {
  if (t === "multi_family") return "multi_family";
  if (t === "office" || t === "commercial" || t === "retail")
    return "condo";
  return "single_family";
}

function aggregateDedicated(
  rooms: ElectricalRoomInput[],
): ResidentialInputs["appliances"] {
  const a = {
    range: { enabled: false, watts: 8000 },
    dryer: { enabled: false, watts: 5000 },
    waterHeater: { enabled: false, watts: 4500 },
    dishwasher: { enabled: false, watts: 1200 },
    refrigerator: { enabled: false, watts: 150 },
    microwave: { enabled: false, watts: 1500 },
    ac: { enabled: false, tons: 3 },
    electricHeat: { enabled: false, kw: 10 },
    evL1: { enabled: false, watts: 1440 },
    evL2: { enabled: false, watts: 7200 },
    hotTub: { enabled: false, watts: 5000 },
    poolPump: { enabled: false, watts: 2000 },
    generator: { enabled: false, kw: 12 },
  };

  let maxAc = 0;
  for (const r of rooms) {
    const d = r.dedicated;
    if (d.refrigerator) a.refrigerator.enabled = true;
    if (d.dishwasher) a.dishwasher.enabled = true;
    if (d.microwave) a.microwave.enabled = true;
    if (d.rangeOven) a.range.enabled = true;
    if (d.dryer) a.dryer.enabled = true;
    if (d.evLevel1) a.evL1.enabled = true;
    if (d.evLevel2) a.evL2.enabled = true;
    if (d.hotTub !== "none") a.hotTub.enabled = true;
    if (d.poolPump !== "none") a.poolPump.enabled = true;
    if (d.acHeatPumpTons > maxAc) maxAc = d.acHeatPumpTons;
    if (d.generatorTransfer) a.generator.enabled = true;
  }

  if (maxAc > 0) {
    a.ac.enabled = true;
    a.ac.tons = maxAc;
  }

  return a;
}

function countBedroomsBathrooms(rooms: ElectricalRoomInput[]): {
  bedrooms: number;
  bathrooms: number;
} {
  let bedrooms = 0;
  let bathrooms = 0;
  for (const r of rooms) {
    if (r.roomType === "bedroom") bedrooms++;
    if (r.roomType === "bathroom") bathrooms++;
  }
  return {
    bedrooms: Math.max(1, bedrooms || 1),
    bathrooms: Math.max(1, bathrooms || 1),
  };
}

function dedicatedCircuitCount(room: ElectricalRoomInput): number {
  const d = room.dedicated;
  let n = 0;
  if (d.refrigerator) n++;
  if (d.dishwasher) n++;
  if (d.microwave) n++;
  if (d.disposal) n++;
  if (d.rangeOven) n++;
  if (d.dryer) n++;
  if (d.washer) n++;
  if (d.acHeatPumpTons > 0) n++;
  if (d.evLevel1) n++;
  if (d.evLevel2) n++;
  if (d.hotTub !== "none") n++;
  if (d.poolPump !== "none") n++;
  if (d.generatorTransfer) n++;
  n += Math.max(0, Math.round(d.customDedicatedCount));
  return n;
}

export function computeElectricalPlan(input: ElectricalInputs): ElectricalResults {
  const { setup, rooms, additional } = input;
  const sq = Math.max(0, Math.round(setup.totalSqFt));

  const hasKitchen = rooms.some((r) => r.roomType === "kitchen");
  const hasDining = rooms.some((r) => r.roomType === "dining_room");
  const bathCount = rooms.filter((r) => r.roomType === "bathroom").length;

  const lightingCircuits = sq > 0 ? Math.ceil(sq / 500) : 0;
  let smallApplianceCircuits = 0;
  if (hasKitchen) smallApplianceCircuits += 2;
  if (hasDining) smallApplianceCircuits += 1;

  const bathroomCircuitsNec = bathCount > 0 ? bathCount : 0;

  let dedicatedTotal = 0;
  for (const r of rooms) dedicatedTotal += dedicatedCircuitCount(r);

  if (additional.evCharging && !rooms.some((x) => x.dedicated.evLevel2 || x.dedicated.evLevel1)) {
    dedicatedTotal += 1;
  }
  if (additional.poolSpa && !rooms.some((x) => x.dedicated.hotTub !== "none")) {
    dedicatedTotal += 1;
  }
  if (additional.generator && setup.targetService !== "100") {
    dedicatedTotal += 1;
  }

  const baseCircuits =
    lightingCircuits +
    smallApplianceCircuits +
    bathroomCircuitsNec +
    dedicatedTotal;

  const withGrowth = Math.ceil(baseCircuits * 1.25);
  const breakerSlotsNeeded = Math.ceil(withGrowth * 1.08);
  const recommendedPanelSpaces = nextPanelSpaces(breakerSlotsNeeded);

  const { bedrooms, bathrooms } = countBedroomsBathrooms(rooms);
  const appliances = aggregateDedicated(rooms);
  if (additional.evCharging) {
    if (!appliances.evL2.enabled && !appliances.evL1.enabled) {
      appliances.evL2.enabled = true;
    }
  }
  if (additional.generator) {
    appliances.generator.enabled = true;
    appliances.generator.kw = Math.max(6, additional.genKw || 12);
  }

  const resInput: ResidentialInputs = {
    projectName: setup.projectName.trim() || "Electrical plan",
    squareFootage: sq || 2000,
    buildingType: mapBuildingToResidential(setup.buildingType),
    bedrooms,
    bathrooms,
    futureGrowthSolar: additional.solarBatteryReady,
    garageLoads: rooms.some((r) => r.roomType === "garage"),
    appliances,
  };

  const load = computeResidentialLoad(resInput);
  let recommendedServiceAmps: number = load.recommendedServiceAmps;

  const target = setup.targetService;
  if (target === "100") recommendedServiceAmps = 100;
  else if (target === "150") recommendedServiceAmps = 150;
  else if (target === "200") recommendedServiceAmps = 200;
  else if (target === "400") recommendedServiceAmps = 400;
  else if (target === "800") recommendedServiceAmps = 800;
  else if (target === "1200") recommendedServiceAmps = 1200;
  else {
    recommendedServiceAmps = Math.max(
      recommendedServiceAmps,
      roundUpServiceAmps(load.requiredAmps),
    );
  }

  const panelAmps = recommendedServiceAmps;

  const necEditionLabel = resolveNecEditionLabel(
    setup.projectAddress,
    setup.permitDate,
  );

  const schedule: CircuitScheduleRow[] = [];
  let c = 0;
  const addRow = (row: Omit<CircuitScheduleRow, "circuit">) => {
    c++;
    schedule.push({ ...row, circuit: c });
  };

  for (let i = 0; i < lightingCircuits; i++) {
    addRow({
      description: `General lighting ${i + 1}`,
      room: "Dwelling",
      amps: 15,
      wire: wireForAmps(15),
      gfci: false,
      afci: true,
      category: "lighting",
    });
  }
  for (let i = 0; i < smallApplianceCircuits; i++) {
    addRow({
      description: `Small appliance ${i + 1}${hasKitchen ? " (kitchen)" : ""}`,
      room: hasKitchen ? "Kitchen" : "Dining / pantry",
      amps: 20,
      wire: wireForAmps(20),
      gfci: true,
      afci: true,
      category: "receptacle",
    });
  }
  for (let i = 0; i < bathroomCircuitsNec; i++) {
    const br = rooms.filter((r) => r.roomType === "bathroom")[i];
    addRow({
      description: "Bathroom receptacle / lighting",
      room: br?.name ?? `Bathroom ${i + 1}`,
      amps: 20,
      wire: wireForAmps(20),
      gfci: true,
      afci: false,
      category: "receptacle",
    });
  }

  const addDedicated = (
    label: string,
    roomName: string,
    amps: number,
    cat: CircuitCategory,
    gfci: boolean,
    afci: boolean,
  ) => {
    addRow({
      description: label,
      room: roomName,
      amps,
      wire: wireForAmps(amps),
      gfci,
      afci,
      category: cat,
    });
  };

  for (const r of rooms) {
    const d = r.dedicated;
    const rn = r.name || "Room";
    if (d.refrigerator) addDedicated("Refrigerator", rn, 20, "dedicated", false, false);
    if (d.dishwasher) addDedicated("Dishwasher", rn, 20, "dedicated", false, false);
    if (d.microwave) addDedicated("Microwave", rn, 20, "dedicated", false, false);
    if (d.disposal) addDedicated("Disposal", rn, 20, "dedicated", false, false);
    if (d.rangeOven) addDedicated("Range / oven", rn, 50, "dedicated", false, false);
    if (d.dryer) addDedicated("Dryer", rn, 30, "dedicated", false, false);
    if (d.washer) addDedicated("Washer", rn, 20, "dedicated", false, false);
    if (d.acHeatPumpTons > 0)
      addDedicated(
        `AC / heat pump (~${d.acHeatPumpTons} ton)`,
        rn,
        30,
        "hvac",
        false,
        false,
      );
    if (d.evLevel1) addDedicated("EV charger Level 1", rn, 20, "dedicated", false, false);
    if (d.evLevel2) addDedicated("EV charger Level 2", rn, 50, "dedicated", false, false);
    if (d.hotTub === "50" || d.hotTub === "60")
      addDedicated(`Hot tub / spa (${d.hotTub}A)`, rn, d.hotTub === "60" ? 60 : 50, "dedicated", false, false);
    if (d.poolPump === "20" || d.poolPump === "30")
      addDedicated("Pool pump", rn, d.poolPump === "30" ? 30 : 20, "dedicated", false, false);
    if (d.generatorTransfer)
      addDedicated("Generator transfer", rn, 30, "dedicated", false, false);
    for (let k = 0; k < Math.max(0, Math.round(d.customDedicatedCount)); k++) {
      addDedicated(`Custom dedicated ${k + 1}`, rn, 20, "dedicated", false, false);
    }
  }

  if (additional.evCharging && !rooms.some((x) => x.dedicated.evLevel2 || x.dedicated.evLevel1)) {
    addDedicated("EV charging (project level)", "Site", 50, "dedicated", false, false);
  }
  if (additional.poolSpa && !rooms.some((x) => x.dedicated.hotTub !== "none")) {
    addDedicated("Pool / spa (project level)", "Outdoor", 50, "dedicated", false, false);
  }
  if (additional.generator && !rooms.some((x) => x.dedicated.generatorTransfer)) {
    addDedicated(
      `Generator stub (${additional.genKw || 12} kW, ${additional.genTransfer})`,
      "Service",
      50,
      "dedicated",
      false,
      false,
    );
  }

  const compliance: ComplianceItem[] = [];
  if (hasKitchen && smallApplianceCircuits >= 2) {
    compliance.push({
      status: "pass",
      text: "Kitchen has minimum two small-appliance branch circuits (NEC 210.52(B)).",
    });
  } else if (hasKitchen) {
    compliance.push({
      status: "fail",
      text: "Kitchen present — plan at least two 20A small-appliance circuits (NEC 210.52(B)).",
    });
  } else {
    compliance.push({
      status: "info",
      text: "No kitchen in room list — small-appliance circuit minimums not triggered.",
    });
  }

  if (bathCount > 0) {
    compliance.push({
      status: "pass",
      text: `Bathrooms: ${bathCount} dedicated 20A circuit(s) allocated (NEC 210.11(C)(1) style).`,
    });
  }

  const outdoorRec = rooms.reduce((s, r) => s + r.recOutdoor, 0);
  if (outdoorRec > 0) {
    compliance.push({
      status: "warn",
      text: `Outdoor receptacles planned (${outdoorRec}) — confirm GFCI protection (NEC 210.8).`,
    });
  }

  const bedNoAfci = rooms.filter(
    (r) => r.roomType === "bedroom" && r.afciRequired === "no",
  );
  if (bedNoAfci.length > 0) {
    compliance.push({
      status: "warn",
      text: `${bedNoAfci.length} bedroom(s) marked without AFCI — verify NEC 210.12 / local amendments.`,
    });
  } else if (rooms.some((r) => r.roomType === "bedroom")) {
    compliance.push({
      status: "pass",
      text: "Bedrooms: AFCI not marked as omitted — verify AFCI protection on 120V branch circuits (NEC 210.12).",
    });
  }

  if (additional.smokeDetectors) {
    compliance.push({
      status: "pass",
      text: `Smoke detectors planned (${additional.smokeCount}${additional.smokeInterconnected ? ", interconnected" : ""}).`,
    });
  } else {
    compliance.push({
      status: "fail",
      text: "Smoke detectors not planned — add per NFPA 72 / IRC / local requirements.",
    });
  }

  compliance.push({
    status: "info",
    text: "Panel working space: maintain 30 in. width, 36 in. depth, 6 ft 6 in. height (NEC 110.26) — field verify.",
  });

  const panelSchedule: PanelSlotRow[] = [];
  let space = 1;
  const panelCat = (row: CircuitScheduleRow): CircuitCategory =>
    row.amps >= 30 && row.description.toLowerCase().includes("ac")
      ? "hvac"
      : row.category;
  const shortLabel = (s: string) =>
    s.length > 26 ? `${s.slice(0, 26)}…` : s;
  for (const row of schedule) {
    if (space > recommendedPanelSpaces) break;
    const cat = panelCat(row);
    const lab = shortLabel(row.description);
    const twoPole = row.amps === 30 || row.amps === 50 || row.amps === 60;
    if (twoPole) {
      if (space <= recommendedPanelSpaces) {
        panelSchedule.push({ position: space, label: `${lab} · pole 1`, category: cat });
        space++;
      }
      if (space <= recommendedPanelSpaces) {
        panelSchedule.push({ position: space, label: `${lab} · pole 2`, category: cat });
        space++;
      }
    } else {
      panelSchedule.push({ position: space, label: lab, category: cat });
      space++;
    }
  }
  while (space <= recommendedPanelSpaces) {
    panelSchedule.push({ position: space, label: "Spare", category: "spare" });
    space++;
  }

  let wire14_2 = 0;
  let wire12_2 = 0;
  let wire10_2 = 0;
  let wire6_3 = 0;
  let wire14_3 = 0;
  for (const row of schedule) {
    const three = /3-way|three-way/i.test(row.description);
    const nm = nmForBranch(row.amps, three);
    if (nm.type === "wire14_2NmLf") wire14_2 += nm.lf;
    else if (nm.type === "wire12_2NmLf") wire12_2 += nm.lf;
    else if (nm.type === "wire10_2NmLf") wire10_2 += nm.lf;
    else if (nm.type === "wire6_3NmLf") wire6_3 += nm.lf;
    else wire14_3 += nm.lf;
  }

  const duplex15 = rooms.reduce((s, r) => s + r.rec15 + r.recUsb, 0);
  const duplex20 = rooms.reduce((s, r) => s + r.rec20, 0);
  const gfci =
    rooms.reduce((s, r) => s + r.recGfci + r.recOutdoor, 0) +
    (hasKitchen ? 2 : 0);
  const switchSp = rooms.reduce(
    (s, r) =>
      s +
      r.dimmers +
      r.occupancySensors +
      Math.max(0, r.recessed + r.surfaceMount > 0 ? 1 : 0),
    0,
  );
  const switch3w = rooms.reduce((s, r) => s + r.threeWay, 0);
  const dimmer = rooms.reduce((s, r) => s + r.dimmers, 0);
  const recessed = rooms.reduce((s, r) => s + r.recessed, 0);
  const surface = rooms.reduce((s, r) => s + r.surfaceMount, 0);

  const breaker15 = schedule.filter((r) => r.amps === 15).length;
  const breaker20 = schedule.filter((r) => r.amps === 20).length;
  const breaker30 = schedule.filter((r) => r.amps === 30).length;
  const breaker50 = schedule.filter((r) => r.amps >= 50).length;

  const estimatedWireFootage =
    wire14_2 + wire12_2 + wire10_2 + wire6_3 + wire14_3;

  const roughCircuits = schedule.length;
  const trimOutlets = rooms.reduce(
    (s, r) =>
      s +
      r.rec15 +
      r.rec20 +
      r.recGfci +
      r.recUsb +
      r.recFloor +
      r.recOutdoor,
    0,
  );
  const trimSwitches =
    rooms.reduce(
      (s, r) => s + r.dimmers + r.threeWay + r.occupancySensors,
      0,
    ) + Math.min(recessed + surface, recessed + surface);
  const fixtures = rooms.reduce((s, r) => s + r.recessed + r.surfaceMount, 0);
  const laborHoursHint = {
    roughInPerCircuit: 1.5 * roughCircuits,
    trimOutlets: 0.25 * trimOutlets,
    trimSwitches: 0.25 * trimSwitches,
    fixtures: 0.5 * fixtures,
    panelInstall: 8,
    serviceEntrance: 4,
    inspectionPrep: 2,
    walkthrough: 1,
    totalEstimated: 0,
  };
  laborHoursHint.totalEstimated =
    laborHoursHint.roughInPerCircuit +
    laborHoursHint.trimOutlets +
    laborHoursHint.trimSwitches +
    laborHoursHint.fixtures +
    laborHoursHint.panelInstall +
    laborHoursHint.serviceEntrance +
    laborHoursHint.inspectionPrep +
    laborHoursHint.walkthrough;

  return {
    necEditionLabel,
    summary: {
      totalRooms: rooms.length,
      totalCircuitsEstimated: baseCircuits,
      circuitsWithGrowth: withGrowth,
      recommendedPanelSpaces,
      recommendedPanelAmps: panelAmps,
      recommendedServiceAmps,
      estimatedWireFootageLf: Math.round(estimatedWireFootage),
      loadCalcTotalVa: load.totalVa,
      loadCalcRequiredAmps: Math.round(load.requiredAmps * 100) / 100,
    },
    circuitSchedule: schedule,
    compliance,
    panelSchedule,
    materials: {
      wire14_2NmLf: Math.round(wire14_2),
      wire12_2NmLf: Math.round(wire12_2),
      wire10_2NmLf: Math.round(wire10_2),
      wire6_3NmLf: Math.round(wire6_3),
      wire14_3NmLf: Math.round(wire14_3),
      duplex15: duplex15,
      duplex20: duplex20,
      gfci,
      switchSp,
      switch3w,
      dimmer,
      recessed,
      surfaceFixtures: surface,
      breaker15Sp: breaker15,
      breaker20Sp: breaker20,
      breaker30Dp: breaker30,
      breaker50Dp: breaker50,
      panelSpaces: recommendedPanelSpaces,
      panelAmps,
      estimatedWireFootage: Math.round(estimatedWireFootage),
    },
    laborHoursHint,
  };
}

export function buildLoadCalculatorPayloadFromElectrical(
  input: ElectricalInputs,
): Partial<ResidentialInputs> & { appliances: ResidentialInputs["appliances"] } {
  const sq = Math.max(0, Math.round(input.setup.totalSqFt));
  const { bedrooms, bathrooms } = countBedroomsBathrooms(input.rooms);
  const appliances = aggregateDedicated(input.rooms);
  if (input.additional.evCharging) {
    if (!appliances.evL2.enabled && !appliances.evL1.enabled) {
      appliances.evL2.enabled = true;
    }
  }
  if (input.additional.generator) {
    appliances.generator.enabled = true;
    appliances.generator.kw = Math.max(6, input.additional.genKw || 12);
  }
  return {
    projectName: input.setup.projectName.trim() || "From electrical analyzer",
    squareFootage: sq || 2000,
    buildingType: mapBuildingToResidential(input.setup.buildingType),
    bedrooms,
    bathrooms,
    futureGrowthSolar: input.additional.solarBatteryReady,
    garageLoads: input.rooms.some((r) => r.roomType === "garage"),
    appliances,
  };
}

export function buildNecCheckerPrefillQuestion(input: ElectricalInputs): string {
  const lines: string[] = [
    `Electrical project: ${input.setup.projectName || "Untitled"}.`,
    `Building: ${input.setup.buildingType.replace(/_/g, " ")}, ${input.setup.constructionType.replace(/_/g, " ")}.`,
    `Approx. ${Math.round(input.setup.totalSqFt)} sq ft, ${input.setup.numFloors} floor(s).`,
    `Service voltage: ${input.setup.serviceVoltage.replace(/_/g, " ")}.`,
  ];
  const hasKitchen = input.rooms.some((r) => r.roomType === "kitchen");
  if (hasKitchen) {
    lines.push(
      "Kitchen present — please confirm GFCI requirements for countertops and small-appliance circuits per NEC 210.8 and 210.52(B).",
    );
  }
  const baths = input.rooms.filter((r) => r.roomType === "bathroom").length;
  if (baths > 0) {
    lines.push(
      `${baths} bathroom(s) — confirm bathroom branch circuit and GFCI rules per NEC 210.11(C) and 210.8.`,
    );
  }
  if (input.rooms.some((r) => r.dedicated.evLevel2 || r.dedicated.evLevel1)) {
    lines.push("EV charging is included — summarize NEC Article 625 load and disconnect highlights for this dwelling.");
  }
  lines.push(
    `Based on the above, list the top 5 NEC checks the inspector is most likely to verify for this job (${input.setup.permitDate ? `permit date ${input.setup.permitDate}` : "permit date TBD"}).`,
  );
  return lines.join("\n");
}
