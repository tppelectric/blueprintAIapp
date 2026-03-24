import type {
  VendorChoice,
  WifiAnalyzerInputs,
  WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";

const RULE_SHORT = "━━━━━━━━━━━━━━━━━━━━━━━━━━━";

/** Matches PDF checkbox detection (\u2610 BALLOT BOX). */
const CB = "\u2610 ";

/** e.g. WO-20260323-847 or PROP-20260323-412 */
export function generateWifiDocumentNumber(prefix: "WO" | "PROP"): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const n = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${y}${m}${day}-${n}`;
}

export function vendorDisplayName(v: VendorChoice): string {
  switch (v) {
    case "ubiquiti":
      return "Ubiquiti UniFi";
    case "ruckus":
      return "Ruckus";
    case "cisco_meraki":
      return "Cisco Meraki";
    case "tp_link":
      return "TP-Link Omada";
    case "access_networks":
      return "Access Networks";
    default:
      return "Professional-grade";
  }
}

/** Friendly coverage description for proposals (non-technical). */
export function zonePlainEnglish(zoneType: string): string {
  switch (zoneType) {
    case "Primary coverage zone":
      return "Strong Wi‑Fi for streaming, video calls, and daily use in this main area.";
    case "Shared coverage zone":
      return "Reliable everyday wireless, shared with nearby access points.";
    case "Outdoor coverage zone":
      return "Outdoor or patio-style coverage for devices used outside.";
    case "High-demand office":
      return "Work-from-home or office zone with priority connectivity.";
    case "Transition zone":
      return "Hallways and connecting spaces with supporting coverage.";
    case "Likely shared coverage":
      return "Light-use areas where Wi‑Fi is covered by adjacent access points.";
    default:
      return "Coverage to be confirmed during installation.";
  }
}

export function parseHardwareCostRange(
  label: string,
): { low: number; high: number } {
  const matches = label.match(/\$[\d,]+/g);
  if (!matches?.length) return { low: 0, high: 0 };
  const nums = matches.map((s) =>
    Number.parseInt(s.replace(/[$,]/g, ""), 10),
  );
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  return { low, high };
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function laborInstallDollarRange(totalLaborHours: number): {
  low: number;
  high: number;
} {
  const hrLow = 95;
  const hrHigh = 155;
  return {
    low: Math.round(totalLaborHours * hrLow),
    high: Math.round(totalLaborHours * hrHigh),
  };
}

function indoorApModelSummary(r: WifiAnalyzerResults): string {
  const line = r.equipment.wholeHomeApPlan;
  const indoor = r.indoorAps > 0 ? line.split("·")[0]?.trim() ?? r.equipment.apModel : r.equipment.apModel;
  return indoor || r.equipment.apModel;
}

function formatDateLong(): string {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Technician field work order (Unicode checkboxes for screen/print).
 */
export function buildWorkOrderText(
  inputs: WifiAnalyzerInputs,
  r: WifiAnalyzerResults,
  workOrderNumber: string,
): string {
  const eq = r.equipment;
  const cat6Bring = Math.ceil(r.cat6FootageLf * 1.2);

  let cableRuns = r.roomRows
    .filter((row) => row.complete)
    .map((row) => {
      const est = Math.max(
        25,
        Math.round(r.cat6FootageLf / Math.max(1, r.cat6Drops)),
      );
      return `${row.name} (fl ${row.floor}) — ~${est} LF est. homerun`;
    });

  if (cableRuns.length === 0) {
    cableRuns = ["(Add complete rooms in planner for per-room cable list.)"];
  }

  const lines: string[] = [
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "FIELD WORK ORDER — Wi-Fi Installation",
    RULE_SHORT,
    "",
    `Work Order #: ${workOrderNumber}`,
    `Date: ${formatDateLong()}`,
    `Project: ${inputs.projectName || "—"}`,
    "Technician: ________________",
    "Helper: ____________________",
    "",
    "MATERIALS ON TRUCK:",
    "Check off before leaving shop:",
    `${CB}${r.recommendedAps} Wireless APs — ${indoorApModelSummary(r)}`,
    ...(r.outdoorAps > 0 && eq.outdoorApModel
      ? [`${CB}${r.outdoorAps} Outdoor APs — ${eq.outdoorApModel}`]
      : []),
    `${CB}PoE Switch — ${eq.switchNote}`,
    `${CB}Network Gateway — ${r.gatewayRecommendation}`,
    `${CB}${cat6Bring} LF CAT6 Cable (bring extra 20%)`,
    `${CB}${r.lvBrackets} Low Voltage Brackets`,
    `${CB}${r.rj45Jacks} RJ45 Keystone Jacks`,
    `${CB}${r.patchCables} Patch Cables`,
    `${CB}Laptop for configuration`,
    `${CB}Network tester`,
    `${CB}Fish tape / drill bits`,
    `${CB}Cable staples / straps`,
    "",
    "INSTALLATION CHECKLIST:",
    "ROUGH-IN PHASE:",
    `${CB}Confirm AP locations with owner/GC`,
    `${CB}Mark cable routes on plans`,
    `${CB}Run CAT6 to each AP location:`,
    ...cableRuns.map((x) => `  ${CB}${x}`),
    `${CB}Leave 3ft service loop at each location`,
    `${CB}Label each cable at both ends`,
    `${CB}Install low voltage brackets`,
    "",
    "TRIM-OUT PHASE:",
    `${CB}Mount each AP per manufacturer specs`,
    `${CB}Terminate CAT6 at keystone jacks`,
    `${CB}Install PoE switch in network location`,
    `${CB}Install gateway`,
    `${CB}Connect all runs to switch`,
    "",
    "CONFIGURATION PHASE:",
    `${CB}Adopt gateway to UniFi controller (or vendor equivalent)`,
    `${CB}Adopt all APs`,
    `${CB}Create wireless network:`,
    "  SSID: _____________________",
    "  Password: _________________",
    `${CB}Configure guest network if required:`,
    "  SSID: _____________________",
    "  Password: _________________",
    `${CB}Configure VLANs if required`,
    `${CB}Set channel widths and TX power`,
    `${CB}Run site survey after config`,
    "",
    "TESTING PHASE:",
    `${CB}Walk every room and verify signal`,
    `${CB}Test speed in each zone`,
    `${CB}Verify all devices connect`,
    `${CB}Document any dead zones`,
    "",
    "SIGN OFF:",
    "Technician: _____________ Date: _______",
    "Owner/GC: ______________ Date: _______",
    "Notes: _________________________________",
    "",
    RULE_SHORT,
    "TPP Electrical Contractors Inc.",
    "blueprint-a-iapp.vercel.app",
    RULE_SHORT,
  ];

  return lines.join("\n");
}

/**
 * Client-facing proposal (plain language).
 */
export function buildClientProposalText(
  inputs: WifiAnalyzerInputs,
  r: WifiAnalyzerResults,
  proposalNumber: string,
): string {
  const mat = parseHardwareCostRange(r.hardwareCostEstimateLabel);
  const labor = laborInstallDollarRange(r.laborHours.totalLaborHours);
  const totalLow = mat.low + labor.low;
  const totalHigh = mat.high + labor.high;
  const clientFor = inputs.clientName?.trim() || "___________________";
  const vendorName = vendorDisplayName(inputs.vendor);
  const apSummary = indoorApModelSummary(r);
  const deviceFloor = Math.max(r.totalDevices + 5, 25);

  const coverageLines = r.roomRows.map((row) => {
    if (!row.complete) {
      return `- ${row.name}: details to be finalized on site`;
    }
    return `- ${row.name}: ${zonePlainEnglish(row.zoneType)}`;
  });

  const lines: string[] = [
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "EST. 1982",
    "Wi-Fi Network Installation Proposal",
    RULE_SHORT,
    "",
    `Prepared for: ${clientFor}`,
    `Property: ${inputs.projectName || "—"}`,
    `Date: ${formatDateLong()}`,
    `Proposal #: ${proposalNumber}`,
    "Valid for 30 days",
    "",
    "WHAT WE WILL INSTALL:",
    `We will design and install a complete professional Wi-Fi network system for your ${inputs.buildingType.replace(/_/g, " ")} providing seamless wireless coverage throughout the property.`,
    "",
    "YOUR SYSTEM WILL INCLUDE:",
    `- ${r.recommendedAps} professional wireless access point(s) (${vendorName} — ${apSummary}) strategically placed for complete coverage`,
    `- ${r.poeSwitchPorts}-port network switch with Power over Ethernet (PoE) to power all access points`,
    "- Professional network gateway for fast, reliable internet distribution",
    `- Complete CAT6 cabling infrastructure (~${r.cat6FootageLf} LF estimated)`,
    "- Professional configuration and setup",
    "",
    "COVERAGE AREAS:",
    ...(coverageLines.length > 0
      ? coverageLines
      : ["- Coverage details to be confirmed on site."]),
    "",
    "WHAT YOU WILL EXPERIENCE:",
    "- Strong Wi‑Fi signal throughout the planned coverage areas",
    `- Support for ${deviceFloor}+ connected devices`,
    `- ${inputs.internetSpeedMbps} Mbps internet capability where your ISP supports it`,
    "- Seamless roaming between access points where designed",
    "- Secure, encrypted network",
    "- Optional separate guest network (if you choose)",
    "",
    "WHAT WE NEED FROM YOU:",
    "- Internet service provider modem/router location confirmed before start",
    "- Network name (SSID) and password preferences",
    "- Access to all areas on installation day",
    "- Electrical outlet at the network switch location",
    "",
    "INVESTMENT SUMMARY:",
    `Materials & Equipment:    ${formatUsd(mat.low)} – ${formatUsd(mat.high)}`,
    `Professional Installation: ${formatUsd(labor.low)} – ${formatUsd(labor.high)}`,
    "                         (based on estimated labor hours at typical service rates)",
    RULE_SHORT,
    `Total Investment:         ${formatUsd(totalLow)} – ${formatUsd(totalHigh)}`,
    "",
    "[Note: Final pricing subject to site conditions. This proposal is based on provided room dimensions.]",
    "",
    "TIMELINE:",
    `Estimated installation time: ${r.laborHours.totalLaborHours} hours`,
    "Typical completion: same day (may vary by site)",
    "",
    "WARRANTY & SUPPORT:",
    `- ${vendorName} manufacturer warranty on equipment (per manufacturer terms)`,
    "- TPP Electrical workmanship warranty: 1 year",
    "- Post-installation support available",
    "",
    "APPROVAL:",
    "By signing below you authorize TPP Electrical Contractors Inc. to proceed with installation as described above.",
    "",
    "Client Signature: _________ Date: _______",
    "Print Name: ___________________________",
    "TPP Representative: ___________________",
    "",
    RULE_SHORT,
    "TPP Electrical Contractors Inc.",
    "Licensed Electrical Contractor",
    "EST. 1982",
    "blueprint-a-iapp.vercel.app",
    RULE_SHORT,
  ];

  return lines.join("\n");
}
