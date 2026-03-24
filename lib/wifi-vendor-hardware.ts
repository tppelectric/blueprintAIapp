/**
 * Vendor-specific SKUs, MSRP-style unit pricing, and material stack planning.
 * Engine passes vendor as string (VendorChoice union).
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

/** Ubiquiti MSRP reference (user spec). */
const U6_LITE = 99;
const U6_PRO = 179;
const U6_ENT = 299;
const U6_MESH = 179;
const U7_PRO = 219;
const CGW_ULTRA = 179;
const CGW_MAX = 299;
const USW_LITE_8 = 109;
const USW_PRO_16 = 299;
const USW_PRO_24 = 499;

function pickUbiquitiIndoor(totalIndoorSqFt: number): {
  label: string;
  unit: number;
} {
  if (totalIndoorSqFt < 1500)
    return { label: `UniFi U6 Lite ($${U6_LITE} ea.)`, unit: U6_LITE };
  if (totalIndoorSqFt < 2500)
    return { label: `UniFi U6 Pro ($${U6_PRO} ea.)`, unit: U6_PRO };
  if (totalIndoorSqFt < 4000)
    return { label: `UniFi U7 Pro ($${U7_PRO} ea.)`, unit: U7_PRO };
  return { label: `UniFi U6 Enterprise ($${U6_ENT} ea.)`, unit: U6_ENT };
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
  const outdoorUni = `UniFi U6 Mesh / outdoor ($${U6_MESH} ea.)`;

  const mesh = vendor === "eero" || vendor === "google_nest" || vendor === "netgear_orbi";

  if (vendor === "ubiquiti" || vendor === "none") {
    const indoor =
      stackOpts?.ubiquitiIndoorOverride ?? pickUbiquitiIndoor(totalIndoorSqFt);
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
      outdoorUnit: outdoorAps > 0 ? U6_MESH : 0,
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
          "No separate security gateway — eero mesh handles routing. Self-configuring mesh; use eero app.",
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
          "No separate gateway — Nest WiFi Pro is a mesh system. Residential-focused; limited VLAN/enterprise features.",
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
        "Orbi router + satellites in mesh; ~2,500 sq ft coverage per node (manufacturer claim). Verify pack/satellite count on site.",
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
    const indoor =
      totalIndoorSqFt < 4000
        ? { label: `AN-500-AC ($349 ea.)`, unit: 349 }
        : { label: `AN-700-AC ($499 ea.)`, unit: 499 };
    const parts: string[] = [];
    if (indoorAps > 0) parts.push(`${indoorAps}× ${indoor.label}`);
    if (outdoorAps > 0) parts.push(`${outdoorAps}× AN outdoor-rated AP (est. $449 ea.)`);
    const line = parts.join(" · ") || "—";
    return {
      line,
      equipment: {
        apModel: indoor.label.replace(" ea.", ""),
        outdoorApModel: outdoorAps > 0 ? "Access Networks outdoor AP" : null,
        switchNote: "Matched PoE switch (line card) — dealer package",
        switchPorts: 0,
        costRangeLabel: "Access Networks",
        wholeHomeApPlan: line,
      },
      apUnit: indoor.unit,
      outdoorUnit: outdoorAps > 0 ? 449 : 0,
      switchUnit: 520,
      gatewayUnit: 0,
      gatewayBomLabel: null,
      switchSpendFactor: Math.min(2.2, 1 + indoorAps / 16),
      mesh: false,
      gatewayRecommendation:
        "Access Networks: use manufacturer-recommended gateway/controller; premium AV/custom install — confirm dealer pricing.",
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
        ? { label: `Ruckus R350 ($299 ea.)`, unit: 299 }
        : totalIndoorSqFt < 4000
          ? { label: `Ruckus R370 ($399 ea.)`, unit: 399 }
          : { label: `Ruckus R670 ($599 ea.)`, unit: 599 };
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
        "Use Ruckus-recommended edge gateway or existing firewall; SmartZone / RUCKUS One for management.",
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
