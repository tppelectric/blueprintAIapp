import type { AvBuildingType, AvBudgetTier, AvDisplayPref, AvPrimaryFocus, AvRoomInput, AvAudioBrand } from "@/lib/av-analyzer-engine";
import {
  createElectricalRoom,
  defaultEleDedicated,
  defaultEleLowVoltage,
  type EleBuildingType,
  type EleConstructionType,
  type EleRoomType,
  type EleTargetService,
  type ElectricalProjectSetup,
  type ElectricalRoomInput,
} from "@/lib/electrical-analyzer-engine";
import type { ProjectDescriptionAnalysis } from "@/lib/project-describer-types";
import type { ShBudget, ShBuildingType, ShControlSystem } from "@/lib/smarthome-analyzer-engine";
import type {
  BudgetTier,
  BuildingType,
  StoriesCount,
  VendorChoice,
} from "@/lib/wifi-analyzer-engine";
import {
  floorsFromAnalysis,
  totalSqFtFromAnalysis,
} from "@/lib/project-describer-prefill";

function deriveDims(
  sq: number | null | undefined,
  w: number | null | undefined,
  l: number | null | undefined,
) {
  if (w != null && l != null && w > 0 && l > 0) return { lengthFt: l, widthFt: w };
  if (sq != null && sq > 0) {
    const s = Math.sqrt(sq);
    return { lengthFt: Math.round(s * 10) / 10, widthFt: Math.round(s * 10) / 10 };
  }
  return { lengthFt: 14, widthFt: 12 };
}

function analysisHaystack(a: ProjectDescriptionAnalysis): string {
  return [
    a.key_items_summary,
    ...a.special_requirements,
    ...a.project_types,
    ...a.systems.map((s) => s.name),
  ]
    .join(" ")
    .toLowerCase();
}

export function guessWifiVendorFromAnalysis(a: ProjectDescriptionAnalysis): VendorChoice {
  const t = analysisHaystack(a);
  if (/ubiquiti|unifi/i.test(t)) return "ubiquiti";
  if (/meraki/i.test(t)) return "cisco_meraki";
  if (/ruckus/i.test(t)) return "ruckus";
  if (/tp-link|tplink|omada/i.test(t)) return "tp_link";
  if (/eero/i.test(t)) return "eero";
  if (/nest|google wifi|google wi-?fi/i.test(t)) return "google_nest";
  if (/orbi|netgear/i.test(t)) return "netgear_orbi";
  if (/luxul/i.test(t)) return "luxul";
  if (/araknis/i.test(t)) return "araknis";
  if (/access networks/i.test(t)) return "access_networks";
  return "ubiquiti";
}

export function guessWifiBudgetFromAnalysis(a: ProjectDescriptionAnalysis): BudgetTier {
  const hi = a.budget_max_usd ?? a.budget_min_usd;
  if (hi == null) {
    if (a.scope_size === "small") return "500_1500";
    if (a.scope_size === "large" || a.scope_size === "commercial") return "5000_plus";
    return "1500_5000";
  }
  if (hi < 500) return "under500";
  if (hi < 1500) return "500_1500";
  if (hi < 5000) return "1500_5000";
  if (hi < 25_000) return "5000_plus";
  return "unlimited";
}

export function guessWifiBuildingTypeFromAnalysis(a: ProjectDescriptionAnalysis): BuildingType {
  const t = analysisHaystack(a);
  if (a.scope_size === "commercial") return "commercial";
  if (/warehouse|distribution|storage facility/i.test(t)) return "warehouse";
  if (/office|cowork|suite/i.test(t)) return "office";
  if (/retail|restaurant|store|shop/i.test(t)) return "commercial";
  return "residential";
}

export function storiesFromAnalysisClamped(a: ProjectDescriptionAnalysis): StoriesCount {
  const n = floorsFromAnalysis(a);
  return Math.min(4, Math.max(1, n)) as StoriesCount;
}

export function guessAvBudgetFromAnalysis(a: ProjectDescriptionAnalysis): AvBudgetTier {
  const hi = a.budget_max_usd ?? a.budget_min_usd;
  if (hi == null) {
    if (a.scope_size === "small") return "5k_15k";
    if (a.scope_size === "large") return "50k_150k";
    if (a.scope_size === "commercial") return "150k_plus";
    return "15k_50k";
  }
  if (hi < 5000) return "under_5k";
  if (hi < 15_000) return "5k_15k";
  if (hi < 50_000) return "15k_50k";
  if (hi < 150_000) return "50k_150k";
  return "150k_plus";
}

export function guessAvAudioBrandFromAnalysis(a: ProjectDescriptionAnalysis): AvAudioBrand {
  const t = analysisHaystack(a);
  if (/sonos/i.test(t)) return "sonos";
  if (/sonance/i.test(t)) return "sonance";
  if (/klipsch/i.test(t)) return "klipsch";
  if (/polk/i.test(t)) return "polk";
  if (/triad/i.test(t)) return "triad";
  if (/james loudspeaker/i.test(t)) return "james";
  if (/origin acoustics/i.test(t)) return "origin";
  if (/leon speaker/i.test(t)) return "leon";
  if (/qsc/i.test(t)) return "qsc";
  if (/bose/i.test(t)) return "bose_commercial";
  if (/jbl/i.test(t)) return "jbl_commercial";
  return "no_pref";
}

export function guessAvPrimaryFocusFromAnalysis(a: ProjectDescriptionAnalysis): AvPrimaryFocus {
  const t = analysisHaystack(a);
  if (/commercial|conference|boardroom|restaurant|bar\b/i.test(t)) return "commercial_av";
  if (/outdoor|patio|pool|landscape audio/i.test(t)) return "outdoor_entertainment";
  if (/theater|cinema|atmos|projector room/i.test(t)) return "home_theater";
  if (/whole.?home|distributed|ceiling speaker|multi.?room audio/i.test(t)) return "distributed_audio";
  if (/tv|video|display|hdmi/i.test(t)) return "both_av";
  return "both_av";
}

export function guessAvBuildingTypeFromAnalysis(a: ProjectDescriptionAnalysis): AvBuildingType {
  const t = analysisHaystack(a);
  if (a.scope_size === "commercial") return "commercial";
  if (/restaurant|café|cafe|dining/i.test(t)) return "restaurant";
  if (/retail|boutique|store/i.test(t)) return "retail";
  if (/church|sanctuary|worship/i.test(t)) return "house_of_worship";
  if (/school|classroom|education/i.test(t)) return "education";
  if (/hotel|hospitality|guest rooms/i.test(t)) return "hospitality";
  return "residential";
}

export function avRoomsWithDisplayFromAnalysis(
  rooms: AvRoomInput[],
  a: ProjectDescriptionAnalysis,
): AvRoomInput[] {
  const hay = analysisHaystack(a);
  const prefersProj = /projector|projection|screen\s+wall|home theater/i.test(hay);
  const prefersTv = /\btv\b|television|flat panel|qled|oled|samsung|lg tv/i.test(hay);
  const def: AvDisplayPref = prefersProj
    ? "projector_preferred"
    : prefersTv
      ? "tv_preferred"
      : "no_pref";
  return rooms.map((r) => {
    const rn = r.name.toLowerCase();
    if (/theater|media|cinema/i.test(rn)) {
      return {
        ...r,
        displayNeeded: true,
        displayPref: prefersProj || !prefersTv ? "projector_preferred" : "tv_preferred",
      };
    }
    if (r.displayPref !== "no_pref") return r;
    return { ...r, displayPref: def };
  });
}

export function guessShBudgetFromAnalysis(a: ProjectDescriptionAnalysis): ShBudget {
  const hi = a.budget_max_usd ?? a.budget_min_usd;
  if (hi == null) {
    if (a.scope_size === "small") return "10k_30k";
    if (a.scope_size === "large" || a.scope_size === "commercial") return "75k_200k";
    return "30k_75k";
  }
  if (hi < 10_000) return "under_10k";
  if (hi < 30_000) return "10k_30k";
  if (hi < 75_000) return "30k_75k";
  if (hi < 200_000) return "75k_200k";
  return "200k_plus";
}

export function guessShControlSystemFromAnalysis(a: ProjectDescriptionAnalysis): ShControlSystem {
  const t = analysisHaystack(a);
  if (/crestron/i.test(t)) return "crestron";
  if (/control4|c4\b/i.test(t)) return "control4";
  if (/savant/i.test(t)) return "savant";
  if (/lutron homeworks/i.test(t)) return "lutron_homeworks";
  if (/josh\.ai|josh ai/i.test(t)) return "josh";
  if (/home assistant/i.test(t)) return "home_assistant";
  if (/apple homekit|homekit/i.test(t)) return "homekit";
  if (/google home|nest hub/i.test(t)) return "google";
  if (/alexa|amazon echo/i.test(t)) return "alexa";
  if (/urc|total control/i.test(t)) return "urc";
  return "no_pref";
}

export function guessShBuildingTypeFromAnalysis(a: ProjectDescriptionAnalysis): ShBuildingType {
  const t = analysisHaystack(a);
  if (a.scope_size === "commercial") return "commercial";
  if (/retrofit|existing|older home/i.test(t)) return "retrofit";
  if (/renovation|remodel|gut/i.test(t)) return "renovation";
  return "new_construction";
}

function mapEleRoomType(rt: string | null | undefined, name: string): EleRoomType {
  const n = name.toLowerCase();
  if (/kitchen/i.test(n)) return "kitchen";
  if (/bath|powder/i.test(n)) return "bathroom";
  if (/primary|master.*bed|bedroom/i.test(n)) return "bedroom";
  if (/living|great room|family room/i.test(n)) return "living_room";
  if (/garage/i.test(n)) return "garage";
  if (/basement/i.test(n)) return "basement";
  if (/laundry/i.test(n)) return "laundry";
  if (/hall|corridor/i.test(n)) return "hallway";
  if (/office|study/i.test(n)) return "office";
  if (/dining/i.test(n)) return "dining_room";
  if (/mech|utility|mud/i.test(n)) return "utility_room";
  if (/panel|electrical room/i.test(n)) return "panel_room";
  if (/outdoor|patio|deck/i.test(n)) return "outdoor";
  const t = (rt ?? "").toLowerCase();
  const map: Record<string, EleRoomType> = {
    living_room: "living_room",
    bedroom: "bedroom",
    kitchen: "kitchen",
    bathroom: "bathroom",
    garage: "garage",
    basement: "basement",
    office: "office",
    dining_room: "dining_room",
    hallway: "hallway",
    laundry: "laundry",
    utility: "utility_room",
    outdoor: "outdoor",
    patio: "outdoor",
    other: "other",
  };
  return map[t] ?? "other";
}

function baseElectricalForType(rt: EleRoomType): Partial<ElectricalRoomInput> {
  switch (rt) {
    case "kitchen":
      return {
        rec15: 4,
        rec20: 2,
        recGfci: 4,
        recessed: 6,
        dimmers: 2,
        underCabinet: true,
        afciRequired: "unknown",
        dedicated: {
          ...defaultEleDedicated(),
          refrigerator: true,
          dishwasher: true,
          microwave: true,
          disposal: true,
          rangeOven: true,
        },
        lowVoltage: { ...defaultEleLowVoltage(), ethernetDrops: 1 },
      };
    case "bathroom":
      return {
        rec15: 2,
        recGfci: 2,
        recessed: 4,
        dimmers: 1,
        afciRequired: "no",
      };
    case "garage":
      return {
        rec15: 4,
        rec20: 2,
        recessed: 2,
        dimmers: 0,
        afciRequired: "unknown",
        dedicated: { ...defaultEleDedicated(), evLevel2: false },
      };
    case "living_room":
      return {
        rec15: 6,
        recessed: 8,
        dimmers: 2,
        threeWay: 2,
        lowVoltage: { ...defaultEleLowVoltage(), ethernetDrops: 2, speakerWire: true },
      };
    case "bedroom":
      return {
        rec15: 6,
        recessed: 4,
        dimmers: 1,
        afciRequired: "yes",
      };
    default:
      return {
        rec15: 4,
        recessed: 4,
        dimmers: 1,
      };
  }
}

function mergeEleHeuristics(
  name: string,
  rt: EleRoomType,
  a: ProjectDescriptionAnalysis,
  base: Partial<ElectricalRoomInput>,
): Partial<ElectricalRoomInput> {
  const n = name.toLowerCase();
  const blob = a.devices
    .filter((d) => {
      const dr = (d.room ?? "").toLowerCase();
      return !dr || n.includes(dr) || dr.includes(n.split(/\s+/)[0] ?? "");
    })
    .map((d) => `${d.category} ${d.notes ?? ""}`.toLowerCase())
    .join(" ");
  const global = analysisHaystack(a);
  const dedicated = { ...defaultEleDedicated(), ...base.dedicated };
  const out: Partial<ElectricalRoomInput> = { ...base, dedicated };
  if (/ev|car charger|tesla|level\s*2/i.test(blob + global) && rt === "garage") {
    dedicated.evLevel2 = true;
    out.rec20 = Math.max(out.rec20 ?? 0, 2);
  }
  if (/pool|spa|hot tub/i.test(blob + global)) {
    if (dedicated.poolPump === "none") dedicated.poolPump = "30";
  }
  if (/subpanel|sub-panel|100a sub/i.test(blob + global)) {
    dedicated.customDedicatedCount = Math.max(dedicated.customDedicatedCount, 1);
  }
  out.dedicated = dedicated;
  return out;
}

export function analysisToElectricalRooms(
  a: ProjectDescriptionAnalysis,
  newId: () => string,
): ElectricalRoomInput[] {
  if (!a.rooms.length) {
    return [
      createElectricalRoom(newId(), {
        name: "Whole project",
        roomType: "other",
        floor: 1,
        lengthFt: 20,
        widthFt: 20,
        rec15: 10,
        recessed: 8,
        dimmers: 2,
      }),
    ];
  }
  return a.rooms.map((r) => {
    const { lengthFt, widthFt } = deriveDims(
      r.approximate_sq_ft,
      r.approximate_width_ft,
      r.approximate_length_ft,
    );
    const rt = mapEleRoomType(r.room_type, r.name);
    const base = baseElectricalForType(rt);
    const merged = mergeEleHeuristics(r.name, rt, a, base);
    return createElectricalRoom(newId(), {
      name: r.name,
      floor: Math.max(1, Math.round(r.floor ?? 1)),
      lengthFt,
      widthFt,
      roomType: rt,
      ...merged,
    });
  });
}

export function electricalSetupFromAnalysis(
  a: ProjectDescriptionAnalysis,
): Partial<ElectricalProjectSetup> {
  const t = analysisHaystack(a);
  let targetService: EleTargetService = "200";
  if (/\b400\b|400a|400\s*amp/i.test(t) || (a.budget_max_usd != null && a.budget_max_usd >= 200_000))
    targetService = "400";
  if (/\b800\b|800a/i.test(t)) targetService = "800";

  let buildingType: EleBuildingType = "single_family";
  if (a.scope_size === "commercial") buildingType = "commercial";
  else if (/multi.?family|duplex|triplex|apartment|condo building/i.test(t))
    buildingType = "multi_family";
  else if (/office|suite/i.test(t)) buildingType = "office";
  else if (/warehouse/i.test(t)) buildingType = "warehouse";
  else if (/retail|store/i.test(t)) buildingType = "retail";
  else if (/restaurant/i.test(t)) buildingType = "restaurant";

  let constructionType: EleConstructionType = "new_construction";
  if (/tenant|ti\b|fit-?out/i.test(t)) constructionType = "tenant_improvement";
  else if (/service upgrade|panel upgrade|meter/i.test(t)) constructionType = "service_upgrade";
  else if (/addition/i.test(t)) constructionType = "addition";
  else if (/renovation|remodel|gut/i.test(t)) constructionType = "renovation";

  return {
    totalSqFt: totalSqFtFromAnalysis(a),
    numFloors: Math.min(20, Math.max(1, floorsFromAnalysis(a))),
    buildingType,
    targetService,
    constructionType,
  };
}

export type AnalyzerAssistantToolId =
  | "wifi"
  | "av"
  | "smarthome"
  | "electrical";

export function logProjectAnalysisApply(
  tool: AnalyzerAssistantToolId,
  analysis: ProjectDescriptionAnalysis,
): void {
  if (process.env.NODE_ENV === "development") {
    console.log("Analysis result:", analysis);
    console.log("Applying to tool:", tool);
  }
}
