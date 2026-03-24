import type {
  PlanningPriority,
  VendorChoice,
  WifiAnalyzerInputs,
  WifiAnalyzerResults,
  WifiRoomInput,
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

function planningPriorityLabel(p: PlanningPriority): string {
  switch (p) {
    case "best_value":
      return "Best value";
    case "best_performance":
      return "Best performance";
    case "future_proof":
      return "Future-proof";
    case "lowest_cost":
      return "Lowest cost";
    default:
      return p;
  }
}

function roomInputById(
  inputs: WifiAnalyzerInputs,
  id: string,
): WifiRoomInput | undefined {
  return inputs.rooms?.find((x) => x.id === id);
}

function indoorApIndexFromServedBy(s: string): number | null {
  const m = s.match(/Indoor AP (\d+) of/);
  return m ? Number(m[1]) : null;
}

function outdoorApIndexFromServedBy(s: string): number | null {
  const m = s.match(/Outdoor AP (\d+) of/);
  return m ? Number(m[1]) : null;
}

function primaryRoomForIndoorAp(
  r: WifiAnalyzerResults,
  apNum: number,
): { name: string; id: string } | null {
  const row = r.roomRows.find(
    (x) =>
      x.complete &&
      !x.outdoor &&
      indoorApIndexFromServedBy(x.servedByAp) === apNum,
  );
  return row ? { name: row.name, id: row.id } : null;
}

function primaryRoomForOutdoorAp(
  r: WifiAnalyzerResults,
  apNum: number,
): { name: string; id: string } | null {
  const row = r.roomRows.find(
    (x) =>
      x.complete &&
      x.outdoor &&
      outdoorApIndexFromServedBy(x.servedByAp) === apNum,
  );
  return row ? { name: row.name, id: row.id } : null;
}

function mountHeightLine(
  roomId: string | undefined,
  inputs: WifiAnalyzerInputs,
): string {
  const room = roomId ? roomInputById(inputs, roomId) : undefined;
  if (!room) {
    return "  Height: Ceiling mount or 7 ft wall — confirm with owner/GC";
  }
  const h = room.ceilingHeight;
  if (h === "higher" || h === "12") {
    return "  Height: Ceiling mount (high/vaulted — ladder safety / lift plan)";
  }
  if (h === "10") {
    return "  Height: Ceiling mount preferred (10 ft ceiling); wall mount if approved";
  }
  return "  Height: Ceiling mount preferred; 7 ft wall mount alternate if approved";
}

function vendorControllerNote(v: VendorChoice): string {
  switch (v) {
    case "ubiquiti":
    case "none":
      return "UniFi (app.ui.com or local controller)";
    case "cisco_meraki":
      return "Meraki Dashboard (cloud)";
    case "tp_link":
      return "TP-Link Omada controller (cloud or hardware)";
    case "ruckus":
      return "Ruckus management (SmartZone / RUCKUS One per deployment)";
    case "access_networks":
      return "Access Networks / integrated controller per line card";
    default:
      return "Vendor management portal";
  }
}

function perRoomCableLf(r: WifiAnalyzerResults): number {
  return Math.max(
    25,
    Math.round(r.cat6FootageLf / Math.max(1, r.cat6Drops)),
  );
}

/**
 * Technician field work order (Unicode ☐ for screen/print; PDF draws boxes).
 */
export function buildWorkOrderText(
  inputs: WifiAnalyzerInputs,
  r: WifiAnalyzerResults,
  workOrderNumber: string,
): string {
  const eq = r.equipment;
  const cat6Bring = Math.ceil(r.cat6FootageLf * 1.2);
  const vendorName = vendorDisplayName(inputs.vendor);
  const hrs = r.laborHours.totalLaborHours;
  const targetCompletion =
    hrs <= 8
      ? "Same day"
      : `${Math.max(2, Math.ceil(hrs / 8))} days (estimated multi-day)`;
  const clientLine = inputs.clientName?.trim()
    ? inputs.clientName.trim()
    : "_______________________________";
  const patch3 = Math.max(1, Math.ceil(r.patchCables / 2));
  const patch1 = Math.max(1, Math.floor(r.patchCables / 2));

  const sortedRooms = [...r.roomRows].sort(
    (a, b) => a.floor - b.floor || a.name.localeCompare(b.name),
  );

  const lines: string[] = [];

  lines.push(
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "EST. 1982 — Licensed Electrical Contractor",
    "FIELD WORK ORDER — Wi-Fi Network Installation",
    RULE_SHORT,
    "",
    `Work Order #: ${workOrderNumber}`,
    `Date: ${formatDateLong()}`,
    `Project: ${inputs.projectName || "—"}`,
    `Client: ${clientLine}`,
    `Priority: ${planningPriorityLabel(inputs.planningPriority)}`,
    "",
    "CREW ASSIGNMENT:",
    "Lead Technician: _______________________",
    "Helper/Apprentice: _____________________",
    `Estimated Hours: ${hrs} hours`,
    `Target Completion: ${targetCompletion}`,
    "",
    "PROJECT OVERVIEW:",
    `Install complete Wi-Fi network system for ${inputs.buildingType.replace(/_/g, " ")} — ${r.totalRooms} rooms — ${r.totalCoverageSqFt} sq ft (complete-room footprint).`,
    `${r.indoorAps} indoor APs + ${r.outdoorAps} outdoor APs (${r.recommendedAps} total).`,
    `Vendor: ${vendorName}`,
    `Internet Speed: ${inputs.internetSpeedMbps} Mbps`,
    "",
    "PRE-JOB CHECKLIST — COMPLETE BEFORE LEAVING SHOP:",
    "",
    "TOOLS REQUIRED:",
    `${CB}Power drill with bits (3/4\" spade, 1/4\" bits)`,
    `${CB}Fish tape (25ft minimum)`,
    `${CB}Cable staples and staple gun`,
    `${CB}Network cable tester`,
    `${CB}Laptop/tablet for configuration`,
    `${CB}Label maker or cable labels`,
    `${CB}Voltage tester`,
    `${CB}Level`,
    `${CB}Measuring tape`,
    `${CB}Low voltage mounting tool`,
    "",
    "MATERIALS TO LOAD ON TRUCK:",
    `${CB}${r.indoorAps} Wireless Access Points — ${indoorApModelSummary(r)}`,
    ...(r.outdoorAps > 0 && eq.outdoorApModel
      ? [`${CB}${r.outdoorAps} Outdoor Access Points — ${eq.outdoorApModel}`]
      : []),
    `${CB}1 PoE Network Switch — ${eq.switchNote}`,
    `${CB}1 Network Gateway — ${r.gatewayRecommendation}`,
    `${CB}${cat6Bring} LF CAT6 Cable (${r.cat6FootageLf} LF planned + 20% extra)`,
    `${CB}${r.lvBrackets} Low Voltage Brackets`,
    `${CB}${r.rj45Jacks} RJ45 Keystone Jacks`,
    `${CB}${patch3} Patch Cables (3ft)`,
    `${CB}${patch1} Patch Cables (1ft)`,
    `${CB}Spare RJ45 connectors`,
    `${CB}Cable ties and velcro straps`,
    `${CB}Mounting screws and anchors`,
    "",
    "CONFIRM WITH OWNER/GC BEFORE STARTING:",
    `${CB}Internet modem/router location confirmed`,
    `${CB}Network closet/switch location confirmed`,
    `${CB}Confirm OK to drill through walls/ceilings`,
    `${CB}Confirm cable routing path approved`,
    `${CB}Get network name (SSID) from owner:`,
    "  SSID: ________________________________",
    "  Password: ____________________________",
    "  Guest SSID (if needed): _______________",
    "  Guest Password: ______________________",
    "",
    "ROOM BY ROOM INSTALLATION PLAN:",
  );

  const completeRooms = sortedRooms.filter((row) => row.complete);
  if (completeRooms.length === 0) {
    lines.push(
      "[No complete rooms in planner — add room names and dimensions.]",
      "",
    );
  } else {
    for (const row of completeRooms) {
      const lf = perRoomCableLf(r);
      const apServing =
        row.servedByAp !== "—" ? row.servedByAp : "Assign on site";
      lines.push(
        `Room: ${row.name} | Floor ${row.floor} | ${row.areaSqFt} sq ft`,
        `Zone: ${row.zoneType} | Served by: ${apServing}`,
        `Cable run: Approx ${lf} LF from switch location`,
        `${CB}Run CAT6 cable to this location`,
        `${CB}Install low voltage bracket`,
        `${CB}Leave 3ft service loop`,
        `${CB}Label cable: ${row.name}`,
        "",
      );
    }
  }

  lines.push(
    "ROUGH-IN PHASE:",
    `${CB}Walk entire building with owner/GC`,
    `${CB}Mark all AP locations on wall/ceiling`,
    `${CB}Identify and mark cable routes`,
    `${CB}Locate all obstacles (HVAC, structure)`,
    `${CB}Begin cable runs — start farthest point first`,
    `${CB}Pull all CAT6 runs to switch location`,
    `${CB}Label every cable at BOTH ends`,
    `${CB}Install all low voltage brackets`,
    `${CB}Document any deviations from plan`,
    `${CB}Photo document all cable runs before closing`,
    "",
    "TRIM-OUT PHASE:",
  );

  for (let i = 1; i <= r.indoorAps; i++) {
    const pr = primaryRoomForIndoorAp(r, i);
    const label = pr?.name ?? `Indoor location ${i} (confirm on site)`;
    const rid = pr?.id;
    lines.push(
      `${CB}Mount indoor AP #${i} — ${label}`,
      mountHeightLine(rid, inputs),
      `  ${CB}Terminate CAT6 at keystone`,
      `  ${CB}Mount bracket and AP`,
      `  ${CB}Confirm LED status light`,
    );
  }
  for (let i = 1; i <= r.outdoorAps; i++) {
    const pr = primaryRoomForOutdoorAp(r, i);
    const label = pr?.name ?? `Outdoor zone ${i}`;
    lines.push(
      `${CB}Mount outdoor AP #${i} — ${label}`,
      `  ${CB}Weatherproof cable entry and grounding per manufacturer`,
      `  ${CB}Terminate and mount per outdoor spec`,
      `  ${CB}Confirm LED status light`,
    );
  }

  if (r.indoorAps === 0 && r.outdoorAps === 0) {
    lines.push(
      `${CB}No APs in current plan — verify planner inputs before field work`,
    );
  }

  lines.push(
    `${CB}Install PoE switch in network location`,
    `  ${CB}Mount securely (rack or wall mount)`,
    `  ${CB}Label each port with room name`,
    `  ${CB}Connect all CAT6 runs to switch`,
    `${CB}Install network gateway`,
    `  ${CB}Connect to modem/router`,
    `  ${CB}Connect to PoE switch`,
    `  ${CB}Confirm power and link lights`,
    "",
    "CONFIGURATION PHASE:",
    `${CB}Connect laptop to local network`,
    ...(inputs.vendor === "ubiquiti" || inputs.vendor === "none"
      ? [
          `${CB}Access UniFi Network Application (app.ui.com or local controller)`,
          `${CB}Adopt network gateway`,
          `  ${CB}Confirm internet connectivity (WAN / speed test)`,
        ]
      : [
          `${CB}Access ${vendorControllerNote(inputs.vendor)}`,
          `${CB}Adopt / register gateway per ${vendorName} procedure`,
          `  ${CB}Confirm internet connectivity`,
        ]),
  );

  for (let i = 1; i <= r.indoorAps; i++) {
    const pr = primaryRoomForIndoorAp(r, i);
    const label = pr?.name ?? `location ${i}`;
    lines.push(
      `  ${CB}Indoor AP #${i} — ${label} — adopted, firmware current`,
    );
  }
  for (let i = 1; i <= r.outdoorAps; i++) {
    const pr = primaryRoomForOutdoorAp(r, i);
    const label = pr?.name ?? `outdoor ${i}`;
    lines.push(
      `  ${CB}Outdoor AP #${i} — ${label} — adopted, firmware current`,
    );
  }

  lines.push(
    `${CB}Create wireless network:`,
    `  ${CB}SSID configured: ____________________`,
    `  ${CB}WPA3 security enabled (where supported)`,
    `  ${CB}Band steering enabled (2.4 / 5 / 6 GHz as applicable)`,
    `${CB}Create guest network (if required):`,
    `  ${CB}Guest SSID configured: ______________`,
    `  ${CB}Client isolation enabled`,
    `${CB}Configure VLANs (if required)`,
    `${CB}Set minimum data rates`,
    `${CB}Adjust TX power per site survey`,
    `${CB}Enable roaming settings (802.11r) where supported`,
    "",
    "TESTING PHASE:",
    `${CB}Walk test — connect phone to network`,
    `${CB}Test in every room on plan:`,
  );

  for (const row of completeRooms) {
    lines.push(
      `  ${CB}${row.name} — signal: _____ dBm / bars: _____ Mbps: _____`,
    );
  }
  if (completeRooms.length === 0) {
    lines.push(`  ${CB}________________ — signal: _____ Mbps: _____`);
  }

  lines.push(
    `${CB}Test speed at furthest point from primary AP`,
    `${CB}Test roaming between APs (walk between rooms; confirm handoff)`,
    `${CB}Connect 3+ devices simultaneously`,
    `${CB}Test guest network separately (if installed)`,
    `${CB}Run cable test on all drops`,
    `${CB}Document any problem areas`,
    "",
    "DOCUMENTATION:",
    `${CB}Photo: each AP mounted location`,
    `${CB}Photo: switch with labeled cables`,
    `${CB}Photo: gateway installation`,
    `${CB}Note any deviations from original plan`,
    `${CB}Record final speed test results:`,
    "  Best location: _______ Mbps",
    "  Worst location: ______ Mbps",
    `${CB}Record network credentials in job file`,
    "",
    "OWNER WALKTHROUGH:",
    `${CB}Show owner how to connect devices`,
    `${CB}Explain guest network (if installed)`,
    `${CB}Show how to check network status (app / portal)`,
    `${CB}Leave network credentials card`,
    `${CB}Answer all questions`,
    `${CB}Collect signed completion sign-off`,
    "",
    "COMPLETION SIGN-OFF:",
    "Installation complete and tested: Yes / No",
    "Notes: ____________________________________",
    "___________________________________________",
    "",
    "Lead Technician: ____________ Date: _______",
    "Print Name: ___________________________",
    "",
    "Owner/GC Acceptance:",
    "Signature: ______________ Date: _______",
    "Print Name: ___________________________",
    "Title: ________________________________",
    "",
    RULE_SHORT,
    "TPP Electrical Contractors Inc.",
    "Licensed Electrical Contractor — Est. 1982",
    "blueprint-a-iapp.vercel.app",
    RULE_SHORT,
  );

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
