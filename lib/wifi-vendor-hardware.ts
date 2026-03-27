/**
 * Vendor-specific SKUs, MSRP-style unit pricing, and material stack planning.
 * Engine passes vendor as string (VendorChoice union).
 *
 * Equipment tier map (reference):
 * - Basic: Wi‑Fi 5 legacy / value (UAP-AC-* class) — new stock often Wi‑Fi 6 (U6 Lite)
 * - Standard: Wi‑Fi 6 (U6 Pro family)
 * - Professional: Wi‑Fi 6E (U6 Enterprise)
 * - Premium: Wi‑Fi 7 (U7 Pro, U7 Pro Max, U7 Pro Wall, U7 Outdoor, U7‑XG, U7‑XGS)
 * - Enterprise: Access Networks / Ruckus Wi‑Fi 7 (custom channel — verify MAP)
 */

export type EquipmentRec = {
  apModel: string;
  outdoorApModel: string | null;
  switchNote: string;
  switchPorts: number;
  costRangeLabel: string;
  wholeHomeApPlan: string;
};

export type HardwareBomLine = {
  id: string;
  description: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  lineTotal: number;
};

/** Planning / takeoff unit costs (cost card & BOM). */
const CAT6_LF = 0.25;
const KEYSTONE_EA = 4;
const LV_BRACKET_EA = 5;
const PATCH_3FT = 5;
const PATCH_6FT = 8;

/** Ubiquiti MSRP reference — round numbers; verify store.ui.com before quoting. */
const U6_LITE = 99;
const U6_PRO = 179;
const U6_ENT = 299;
const U6_MESH = 179;
const U7_PRO = 219;
const U7_PRO_MAX = 279;
const U7_PRO_WALL = 189;
const U7_OUTDOOR = 279;
const U7_PRO_XG = 249;
const U7_PRO_XGS = 299;
const CGW_ULTRA = 179;
const CGW_MAX = 299;
const USW_LITE_8 = 109;
const USW_PRO_16 = 299;
const USW_PRO_24 = 499;

/** UniFi Wi‑Fi 7 lineup (Mar 2026 — confirm on ui.com). */
export const UNIFI_WIFI7_PRODUCT_LINE = [
  "U7 Pro — Wi‑Fi 7 tri‑band ceiling AP",
  "U7 Pro Max — higher density Wi‑Fi 7",
  "U7 Pro Wall — in‑wall Wi‑Fi 7 + switch ports",
  "U7 Outdoor — weatherized Wi‑Fi 7",
  "U7 Pro XG / U7 Pro XGS — 10GbE uplink, flagship (XGS = spectral scan radio)",
] as const;

export const CHOWMAIN_UNIFI_DRIVER_USD = 150;
/** Snap One announced simplified optional Connect pricing — verify before quoting. */
export const CONTROL4_CONNECT_ANNUAL_EST_USD = 249;

export const CHOWMAIN_UNIFI_DRIVER_LINE: HardwareBomLine = {
  id: "chowmain-unifi-driver",
  description:
    "Chowmain UniFi driver (~$150 MSRP — UniFi Protect / network presence in Control4)",
  quantity: 1,
  unitLabel: "ea",
  unitPrice: CHOWMAIN_UNIFI_DRIVER_USD,
  lineTotal: CHOWMAIN_UNIFI_DRIVER_USD,
};

export const CONTROL4_CONNECT_ANNUAL_LINE: HardwareBomLine = {
  id: "control4-connect-annual",
  description:
    "Control4 Connect — annual subscription (optional; remote access, HomeKit, premium features — verify Snap One / dealer)",
  quantity: 1,
  unitLabel: "yr",
  unitPrice: CONTROL4_CONNECT_ANNUAL_EST_USD,
  lineTotal: CONTROL4_CONNECT_ANNUAL_EST_USD,
};

/** Append integration lines for C4 + UniFi proposals (BOM). */
export function appendIntegrationBomLines(
  lines: HardwareBomLine[],
  opts: { chowmainUniFi?: boolean; control4ConnectAnnual?: boolean },
): HardwareBomLine[] {
  const out = [...lines];
  if (opts.chowmainUniFi) out.push({ ...CHOWMAIN_UNIFI_DRIVER_LINE });
  if (opts.control4ConnectAnnual) out.push({ ...CONTROL4_CONNECT_ANNUAL_LINE });
  return out;
}

function pickUbiquitiIndoor(
  totalIndoorSqFt: number,
  totalDevices: number,
  priority: string,
  stackOpts?: PlanStackOptions,
): { label: string; unit: number } {
  const o = stackOpts?.ubiquitiIndoorOverride;
  if (o) return o;

  const preferWifi7 =
    Boolean(stackOpts?.preferWifi7) ||
    priority === "future_proof" ||
    totalDevices >= 50 ||
    totalIndoorSqFt >= 3500;

  if (preferWifi7) {
    if (totalIndoorSqFt < 1600)
      return {
        label: `UniFi U7 Pro ($${U7_PRO} ea.) — Wi‑Fi 7`,
        unit: U7_PRO,
      };
    if (totalIndoorSqFt < 2800)
      return {
        label: `UniFi U7 Pro Max ($${U7_PRO_MAX} est.) — Wi‑Fi 7`,
        unit: U7_PRO_MAX,
      };
    if (totalIndoorSqFt < 4200)
      return {
        label: `UniFi U7 Pro Wall ($${U7_PRO_WALL} est.) — Wi‑Fi 7 in‑wall`,
        unit: U7_PRO_WALL,
      };
    if (totalIndoorSqFt < 5500)
      return {
        label: `UniFi U7 Pro XG ($${U7_PRO_XG} est.) — Wi‑Fi 7`,
        unit: U7_PRO_XG,
      };
    return {
      label: `UniFi U7 Pro XGS ($${U7_PRO_XGS} ea.) — Wi‑Fi 7 flagship`,
      unit: U7_PRO_XGS,
    };
  }

  if (totalIndoorSqFt < 1500)
    return {
      label: `UniFi U6 Lite ($${U6_LITE} ea.) — Wi‑Fi 6 value (legacy Wi‑Fi 5: UAP‑AC‑* class)`,
      unit: U6_LITE,
    };
  if (totalIndoorSqFt < 2500)
    return {
      label: `UniFi U6 Pro ($${U6_PRO} ea.) — Wi‑Fi 6`,
      unit: U6_PRO,
    };
  if (totalIndoorSqFt < 4000)
    return {
      label: `UniFi U6 Enterprise ($${U6_ENT} ea.) — Wi‑Fi 6E`,
      unit: U6_ENT,
    };
  return {
    label: `UniFi U7 Pro ($${U7_PRO} ea.) — Wi‑Fi 7 at this scale`,
    unit: U7_PRO,
  };
}

function ubiquitiGateway(
  indoorSqFt: number,
  totalDevices: number,
  priority: string,
): { label: string; unit: number } {
  const useMax =
    indoorSqFt >= 3500 ||
    totalDevices >= 40 ||
    priority === "future_proof";
  return useMax
    ? {
        label: `UniFi Cloud Gateway Max ($${CGW_MAX})`,
        unit: CGW_MAX,
      }
    : {
        label: `UniFi Cloud Gateway Ultra ($${CGW_ULTRA})`,
        unit: CGW_ULTRA,
      };
}

function ubiquitiSwitch(indoorAps: number): { label: string; unit: number } {
  if (indoorAps <= 3)
    return {
      label: `UniFi USW Lite 8 PoE ($${USW_LITE_8})`,
      unit: USW_LITE_8,
    };
  if (indoorAps <= 12)
    return {
      label: `UniFi USW Pro 16 PoE ($${USW_PRO_16})`,
      unit: USW_PRO_16,
    };
  return {
    label: `UniFi USW Pro 24 PoE ($${USW_PRO_24})`,
    unit: USW_PRO_24,
  };
}

export type VendorMaterialPlan = {
  line: string;
  equipment: EquipmentRec;
  apUnit: number;
  outdoorUnit: number;
  switchUnit: number;
  gatewayUnit: number;
  gatewayBomLabel: string | null;
  /** Multiplier applied to switch MSRP (enterprise vendors). */
  switchSpendFactor: number;
  mesh: boolean;
  gatewayRecommendation: string;
};

export type PlanStackOptions = {
  /** Force a specific UniFi indoor AP SKU (e.g. proposal “Better” tier). */
  ubiquitiIndoorOverride?: { label: string; unit: number };
  /** Bias UniFi stack to Wi‑Fi 7 (new construction, smart home, 50+ devices, etc.). */
  preferWifi7?: boolean;
};

export function planVendorMaterialStack(
  vendor: string,
  indoorAps: number,
  outdoorAps: number,
  totalIndoorSqFt: number,
  totalDevices: number,
  priority: string,
  stackOpts?: PlanStackOptions,
): VendorMaterialPlan {
  const mesh = vendor === "eero" || vendor === "google_nest" || vendor === "netgear_orbi";

  const outdoorUniWifi7 = `UniFi U7 Outdoor ($${U7_OUTDOOR} est.) — Wi‑Fi 7`;
  const outdoorUniLegacy = `UniFi U6 Mesh / outdoor ($${U6_MESH} ea.)`;

  if (vendor === "ubiquiti" || vendor === "none") {
    const useWifi7Outdoor =
      Boolean(stackOpts?.preferWifi7) ||
      (stackOpts?.ubiquitiIndoorOverride?.label.includes("U7") ?? false);
    const outdoorUni = useWifi7Outdoor ? outdoorUniWifi7 : outdoorUniLegacy;
    const outdoorUnitPrice = useWifi7Outdoor ? U7_OUTDOOR : U6_MESH;
    const indoor = pickUbiquitiIndoor(
      totalIndoorSqFt,
      totalDevices,
      priority,
      stackOpts,
    );
    const sw = ubiquitiSwitch(indoorAps);
    const gw = ubiquitiGateway(totalIndoorSqFt, totalDevices, priority);
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× ${indoor.label}`);
    if (outdoorAps > 0) parts.push(`${outdoorAps}× ${outdoorUni}`);
    const line = parts.join(" · ") || "—";
    const equipment: EquipmentRec = {
      apModel: indoor.label.replace(" ea.", ""),
      outdoorApModel: outdoorAps > 0 ? outdoorUni : null,
      switchNote: `${sw.label} — scale to port count on site`,
      switchPorts: 0,
      costRangeLabel: "Ubiquiti UniFi stack",
      wholeHomeApPlan: line,
    };
    return {
      line,
      equipment,
      apUnit: indoor.unit,
      outdoorUnit: outdoorAps > 0 ? outdoorUnitPrice : 0,
      switchUnit: sw.unit,
      gatewayUnit: gw.unit,
      gatewayBomLabel: gw.label,
      switchSpendFactor: 1,
      mesh: false,
      gatewayRecommendation: gw.label.replace(/\(\$\d+\)/, "").trim() + ".",
    };
  }

  if (mesh) {
    if (vendor === "eero") {
      const unit =
        totalIndoorSqFt < 2000 ? 139 : totalIndoorSqFt < 3500 ? 219 : 599;
      const label =
        unit === 139
          ? "eero 6+"
          : unit === 219
            ? "eero Pro 6E"
            : "eero Max 7";
      const parts: string[] = [];
      if (indoorAps > 0) parts.push(`${indoorAps}× ${label} ($${unit} ea.)`);
      if (outdoorAps > 0) parts.push(`${outdoorAps}× eero Pro 6E outdoor/node ($219 ea.)`);
      const line = parts.join(" · ") || "—";
      return {
        line,
        equipment: {
          apModel: `${label} (mesh)`,
          outdoorApModel: outdoorAps > 0 ? "eero Pro 6E (node)" : null,
          switchNote: "No PoE switch — mesh uses wireless/Ethernet backhaul per design",
          switchPorts: 0,
          costRangeLabel: "eero mesh",
          wholeHomeApPlan: line,
        },
        apUnit: unit,
        outdoorUnit: outdoorAps > 0 ? 219 : 0,
        switchUnit: 0,
        gatewayUnit: 0,
        gatewayBomLabel: null,
        switchSpendFactor: 0,
        mesh: true,
        gatewayRecommendation:
          "No separate security gateway — eero mesh handles routing. NOT recommended for professional Control4 / Josh.ai / Savant / VLAN-heavy installs — specify UniFi, Access Networks, Ruckus, or Araknis.",
      };
    }
    if (vendor === "google_nest") {
      const unit = 199;
      const parts: string[] = [];
      if (indoorAps > 0)
        parts.push(`${indoorAps}× Nest WiFi Pro ($${unit} ea.)`);
      if (outdoorAps > 0)
        parts.push(`${outdoorAps}× Nest WiFi Pro (node) ($${unit} ea.)`);
      const line = parts.join(" · ") || "—";
      return {
        line,
        equipment: {
          apModel: "Google Nest WiFi Pro (mesh)",
          outdoorApModel: outdoorAps > 0 ? "Nest WiFi Pro (node)" : null,
          switchNote: "No PoE switch — mesh topology",
          switchPorts: 0,
          costRangeLabel: "Google Nest WiFi Pro",
          wholeHomeApPlan: line,
        },
        apUnit: unit,
        outdoorUnit: outdoorAps > 0 ? unit : 0,
        switchUnit: 0,
        gatewayUnit: 0,
        gatewayBomLabel: null,
        switchSpendFactor: 0,
        mesh: true,
        gatewayRecommendation:
          "No separate gateway — Nest WiFi Pro is a mesh system. Consumer mesh — NOT for professional C4 / Josh / Savant integration; use enterprise Wi‑Fi for integrator-grade projects.",
      };
    }
    // netgear_orbi
    const nodeUnit = Math.round(699 / 3);
    const parts: string[] = [];
    if (indoorAps > 0)
      parts.push(
        `${indoorAps}× Orbi RBK863S-class node (~$${nodeUnit} ea., 3-pack $699 MSRP)`,
      );
    if (outdoorAps > 0)
      parts.push(`${outdoorAps}× Orbi satellite (est. $${nodeUnit} ea.)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: "Netgear Orbi (RBK863S class)",
        outdoorApModel: outdoorAps > 0 ? "Orbi satellite" : null,
        switchNote: "No managed PoE switch — high-performance mesh",
        switchPorts: 0,
        costRangeLabel: "Netgear Orbi",
        wholeHomeApPlan: line,
      },
      apUnit: nodeUnit,
      outdoorUnit: outdoorAps > 0 ? nodeUnit : 0,
      switchUnit: 0,
      gatewayUnit: 0,
      gatewayBomLabel: null,
      switchSpendFactor: 0,
      mesh: true,
      gatewayRecommendation:
        "Orbi router + satellites in mesh. Consumer mesh — avoid for professional smart-home deployments; prefer wired APs (UniFi / Access Networks / Ruckus).",
    };
  }

  if (vendor === "tp_link") {
    const indoor =
      totalIndoorSqFt < 2500
        ? { label: `Omada EAP670 ($89 ea.)`, unit: 89 }
        : { label: `Omada EAP773 ($129 ea.)`, unit: 129 };
    const outdoorL =
      outdoorAps > 0 ? `Omada EAP225-Outdoor class ($90 ea.)` : null;
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× ${indoor.label}`);
    if (outdoorAps > 0) parts.push(`${outdoorAps}× ${outdoorL}`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: indoor.label.replace(" ea.", ""),
        outdoorApModel: outdoorL,
        switchNote: `TL-SG2008P ($79) + OC200 hardware controller ($29)`,
        switchPorts: 0,
        costRangeLabel: "TP-Link Omada",
        wholeHomeApPlan: line,
      },
      apUnit: indoor.unit,
      outdoorUnit: outdoorAps > 0 ? 120 : 0,
      switchUnit: 79,
      gatewayUnit: 0,
      gatewayBomLabel: null,
      switchSpendFactor: 1,
      mesh: false,
      gatewayRecommendation:
        "Use TP-Link Omada-compatible gateway or existing firewall; OC200 hardware controller ($29) for local management.",
    };
  }

  if (vendor === "access_networks") {
    /** Ruckus technology via Access Networks (Snap One / ADI) — Wi‑Fi 7 SKUs Feb 2025+. */
    const indoor =
      totalIndoorSqFt < 3500
        ? {
            label: `Access Networks A670 Unleashed Wi‑Fi 7 ($749 est. — verify MAP, Ruckus-based)`,
            unit: 749,
          }
        : {
            label: `Access Networks A770 Wi‑Fi 7 ($999 est. — verify MAP, Ruckus / ARCC)`,
            unit: 999,
          };
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× ${indoor.label}`);
    if (outdoorAps > 0)
      parts.push(`${outdoorAps}× AN outdoor Wi‑Fi 7 / Ruckus-class (est. $849 ea., verify)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: indoor.label.replace(" ea.", "").replace(" est.", ""),
        outdoorApModel:
          outdoorAps > 0 ? "Access Networks outdoor (Ruckus-class)" : null,
        switchNote: "Matched PoE switch (line card) — dealer package",
        switchPorts: 0,
        costRangeLabel: "Access Networks (Ruckus Wi‑Fi 7)",
        wholeHomeApPlan: line,
      },
      apUnit: indoor.unit,
      outdoorUnit: outdoorAps > 0 ? 849 : 0,
      switchUnit: 520,
      gatewayUnit: 0,
      gatewayBomLabel: null,
      switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
      mesh: false,
      gatewayRecommendation:
        "Access Networks (Snap One): top-tier custom-install Wi‑Fi — Ruckus antenna tech; A670 Unleashed / A770 Wi‑Fi 7 (verify 2026 MAP). Pair with ARCC cloud or Unleashed + OvrC per package.",
    };
  }

  if (vendor === "araknis") {
    const indoor =
      totalIndoorSqFt < 2500
        ? { label: `AN-510-AP-I-AC ($199 ea.)`, unit: 199 }
        : { label: `AN-810-AP-I-AC ($299 ea.)`, unit: 299 };
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× ${indoor.label}`);
    if (outdoorAps > 0) parts.push(`${outdoorAps}× Araknis outdoor AP (est. $349 ea.)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: indoor.label.replace(" ea.", ""),
        outdoorApModel: outdoorAps > 0 ? "Araknis outdoor AP" : null,
        switchNote: "Araknis PoE+ switch (integrator line)",
        switchPorts: 0,
        costRangeLabel: "Araknis Networks",
        wholeHomeApPlan: line,
      },
      apUnit: indoor.unit,
      outdoorUnit: outdoorAps > 0 ? 349 : 0,
      switchUnit: 450,
      gatewayUnit: 0,
      gatewayBomLabel: null,
      switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
      mesh: false,
      gatewayRecommendation:
        "Araknis: pair with Snap One / OvrC-compatible router or specified gateway — common with Control4 / Savant deployments.",
    };
  }

  if (vendor === "luxul") {
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× Luxul XAP-1510-class ($395 ea.)`);
    if (outdoorAps > 0) parts.push(`${outdoorAps}× Luxul outdoor AP (est. $425 ea.)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: "Luxul XAP-1510 class",
        outdoorApModel: outdoorAps > 0 ? "Luxul outdoor AP" : null,
        switchNote: "Luxul PoE+ managed switch",
        switchPorts: 0,
        costRangeLabel: "Luxul",
        wholeHomeApPlan: line,
      },
      apUnit: 395,
      outdoorUnit: outdoorAps > 0 ? 425 : 0,
      switchUnit: 360,
      gatewayUnit: 220,
      gatewayBomLabel: "Luxul / matched gateway (est.)",
      switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
      mesh: false,
      gatewayRecommendation:
        "Luxul commercial line — use matched gateway/switch per project; confirm distributor pricing.",
    };
  }

  if (vendor === "ruckus") {
    const indoorPick =
      totalIndoorSqFt < 2200
        ? { label: `Ruckus R560 Wi‑Fi 6E ($349 est.)`, unit: 349 }
        : totalIndoorSqFt < 4000
          ? { label: `Ruckus R670 Wi‑Fi 7 tri‑band ($599 ea.)`, unit: 599 }
          : { label: `Ruckus R770 Wi‑Fi 7 ($799 est.)`, unit: 799 };
    const t350 = 499;
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× ${indoorPick.label}`);
    if (outdoorAps > 0)
      parts.push(`${outdoorAps}× Ruckus T350 outdoor ($${t350} ea.)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: indoorPick.label.replace(" ea.", ""),
        outdoorApModel:
          outdoorAps > 0 ? `Ruckus T350 outdoor ($${t350} ea.)` : null,
        switchNote: `Ruckus ICX 7150-C08P switch ($899) — scale on site`,
        switchPorts: 0,
        costRangeLabel: "Ruckus",
        wholeHomeApPlan: line,
      },
      apUnit: indoorPick.unit,
      outdoorUnit: outdoorAps > 0 ? t350 : 0,
      switchUnit: 899,
      gatewayUnit: 0,
      gatewayBomLabel: null,
      switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
      mesh: false,
      gatewayRecommendation:
        "RUCKUS Networks (Wi‑Fi 7 lines for new projects): confirm R560 / R670 / R770 with distributor; SmartZone / RUCKUS One / Unleashed per deployment. Access Networks packages same Ruckus silicon for CEDIA channel.",
    };
  }

  if (vendor === "cisco_meraki") {
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× Meraki MR36 / MR46 class ($450 ea.)`);
    if (outdoorAps > 0) parts.push(`${outdoorAps}× Meraki outdoor AP class ($600 ea.)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: "Meraki MR36 / MR46 class",
        outdoorApModel: outdoorAps > 0 ? "Meraki outdoor AP" : null,
        switchNote: "Meraki MS PoE switch (licensed)",
        switchPorts: 0,
        costRangeLabel: "Cisco Meraki",
        wholeHomeApPlan: line,
      },
      apUnit: 450,
      outdoorUnit: outdoorAps > 0 ? 600 : 0,
      switchUnit: 800,
      gatewayUnit: 695,
      gatewayBomLabel: "Meraki MX-class security appliance (est. MSRP)",
      switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
      mesh: false,
      gatewayRecommendation:
        "Meraki MX security appliance (e.g. MX67 class ~$695+ license) — cloud dashboard for full stack.",
    };
  }

  // fallback access-like
  const parts: string[] = [];
  if (indoorAps > 0) parts.push(`${indoorAps}× Professional indoor AP ($400 ea.)`);
  if (outdoorAps > 0) parts.push(`${outdoorAps}× Outdoor-rated AP ($500 ea.)`);
  return {
    line: parts.join(" · ") || "—",
    equipment: {
      apModel: "Professional indoor AP",
      outdoorApModel: outdoorAps > 0 ? "Outdoor-rated AP" : null,
      switchNote: "Matched PoE switch",
      switchPorts: 0,
      costRangeLabel: vendor,
      wholeHomeApPlan: parts.join(" · ") || "—",
    },
    apUnit: 400,
    outdoorUnit: outdoorAps > 0 ? 500 : 0,
    switchUnit: 450,
    gatewayUnit: 0,
    gatewayBomLabel: null,
    switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
    mesh: false,
    gatewayRecommendation:
      "Use vendor-recommended gateway or firewall for this line.",
  };
}

export function buildHardwareBomLines(
  vendor: string,
  stack: VendorMaterialPlan,
  indoorAps: number,
  outdoorAps: number,
  cat6FootageLf: number,
  lvBrackets: number,
  rj45Jacks: number,
  patchCables: number,
): HardwareBomLine[] {
  const lines: HardwareBomLine[] = [];
  const add = (
    id: string,
    description: string,
    quantity: number,
    unitLabel: string,
    unitPrice: number,
  ) => {
    const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
    lines.push({
      id,
      description,
      quantity,
      unitLabel,
      unitPrice,
      lineTotal,
    });
  };

  if (indoorAps > 0) {
    const d = stack.equipment.apModel;
    add("indoor-ap", d, indoorAps, "ea", stack.apUnit);
  }
  if (outdoorAps > 0 && stack.outdoorUnit > 0) {
    add(
      "outdoor-ap",
      stack.equipment.outdoorApModel ?? "Outdoor AP / node",
      outdoorAps,
      "ea",
      stack.outdoorUnit,
    );
  }

  if (!stack.mesh) {
    if (stack.gatewayUnit > 0 && stack.gatewayBomLabel) {
      add("gateway", stack.gatewayBomLabel, 1, "ea", stack.gatewayUnit);
    } else if (stack.gatewayUnit > 0) {
      add(
        "gateway",
        "Security gateway / router (see plan notes)",
        1,
        "ea",
        stack.gatewayUnit,
      );
    }
    if (vendor === "tp_link") {
      add("omada-controller", "TP-Link Omada OC200 hardware controller", 1, "ea", 29);
    }
    if (stack.switchUnit > 0 && stack.switchSpendFactor > 0) {
      const desc =
        vendor === "tp_link"
          ? "TP-Link TL-SG2008P PoE switch"
          : stack.equipment.switchNote.split("—")[0]?.trim() ?? "PoE switch";
      const unitP = Math.round(stack.switchUnit * stack.switchSpendFactor);
      add("poe-switch", desc, 1, "ea", unitP);
    }
  } else {
    add(
      "mesh-note",
      "Mesh system — no separate PoE switch / gateway in BOM (see vendor kit)",
      1,
      "lot",
      0,
    );
  }

  add("cat6", "CAT6 cable (estimated run length)", cat6FootageLf, "LF", CAT6_LF);
  add("lv-bracket", "Low-voltage mounting bracket", lvBrackets, "ea", LV_BRACKET_EA);
  add("keystone", "RJ45 keystone jack", rj45Jacks, "ea", KEYSTONE_EA);
  const nPatch3 = Math.max(0, Math.floor(patchCables / 2));
  const nPatch6 = Math.max(0, patchCables - nPatch3);
  if (nPatch3 > 0) {
    add("patch-3", "Patch cable (3 ft)", nPatch3, "ea", PATCH_3FT);
  }
  if (nPatch6 > 0) {
    add("patch-6", "Patch cable (6 ft)", nPatch6, "ea", PATCH_6FT);
  }

  return lines;
}

export function sumBomMaterialSubtotal(lines: HardwareBomLine[]): number {
  return Math.round(
    lines.reduce((s, L) => s + L.lineTotal, 0) * 100,
  ) / 100;
}
