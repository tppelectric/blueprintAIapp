import type { ShInputs, ShResults, ShSummary } from "@/lib/smarthome-analyzer-engine";

const RULE_SHORT = "━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const CB = "\u2610 ";

export type ShProposalInvestment = {
  materialsAfterMarkup: number;
  salesTax: number;
  materialsWithTax: number;
  laborNoTax: number;
  total: number;
  taxPct: number;
};

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function formatDateLong(): string {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildingPretty(b: ShInputs["buildingType"]): string {
  return b.replace(/_/g, " ");
}

function devicePhrase(s: ShSummary): string {
  const parts: string[] = [];
  if (s.lightingPoints > 0)
    parts.push(`${s.lightingPoints} lighting dimmer or switch location(s)`);
  if (s.shades > 0) parts.push(`${s.shades} motorized shade(s)`);
  if (s.thermostats > 0) parts.push(`${s.thermostats} smart thermostat(s)`);
  if (s.cameras > 0) parts.push(`${s.cameras} security camera(s)`);
  if (s.locks > 0) parts.push(`${s.locks} smart door lock(s)`);
  if (s.securitySensors > 0)
    parts.push(`${s.securitySensors} door, window, or motion sensor(s)`);
  if (parts.length === 0) return "lighting, comfort, and convenience features";
  return parts.join(", ");
}

function roomHighlightSh(row: ShResults["roomRows"][number]): string {
  const bits: string[] = [];
  if (row.dimmers > 0)
    bits.push(
      `smart lighting (${row.dimmers} dimmer or switch location${row.dimmers === 1 ? "" : "s"})`,
    );
  if (row.shades > 0)
    bits.push(
      `${row.shades} motorized window treatment${row.shades === 1 ? "" : "s"}`,
    );
  if (row.thermostat === "Yes") bits.push("climate control at the wall");
  if (row.camera > 0)
    bits.push(`${row.camera} camera${row.camera === 1 ? "" : "s"} for peace of mind`);
  if (row.lock === "Yes") bits.push("keyless entry on a main door");
  if (row.sensors > 0)
    bits.push(`${row.sensors} security sensor${row.sensors === 1 ? "" : "s"}`);
  if (row.keypad === "Yes") bits.push("a wall keypad or touchscreen for quick control");
  if (bits.length === 0)
    return `${row.roomName}: basic readiness — details to confirm on walkthrough.`;
  return `${row.roomName}: ${bits.join("; ")}.`;
}

function estLaborHoursSh(res: ShResults): number {
  return Math.max(
    12,
    Math.round(
      res.controller.programmingHours +
        res.summary.lightingPoints * 0.75 +
        res.summary.cameras * 1.5 +
        res.summary.shades * 1.5,
    ),
  );
}

export function buildSmartHomeWorkOrderText(
  inputs: ShInputs,
  r: ShResults,
  workOrderNumber: string,
): string {
  const s = r.summary;
  const clientLine = inputs.clientName?.trim()
    ? inputs.clientName.trim()
    : "_______________________________";
  const hrs = estLaborHoursSh(r);
  const targetCompletion =
    hrs <= 24 ? "2–3 days" : `${Math.max(3, Math.ceil(hrs / 8))} days`;

  const lines: string[] = [
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "EST. 1982 — Licensed Electrical Contractor",
    "FIELD WORK ORDER — Smart Home Installation",
    RULE_SHORT,
    "",
    `Work Order #: ${workOrderNumber}`,
    `Date: ${formatDateLong()}`,
    `Project: ${inputs.projectName || "—"}`,
    `Client: ${clientLine}`,
    `Building: ${buildingPretty(inputs.buildingType)}`,
    "",
    "CREW ASSIGNMENT:",
    "Lead Technician / Programmer: ________________",
    "Helper/Apprentice: ___________________________",
    `Estimated Hours: ${hrs} hours (planning estimate)`,
    `Target Completion: ${targetCompletion}`,
    "",
    "PROJECT OVERVIEW:",
    `${s.totalDevices} controlled device point(s) on plan — ${r.controller.title}.`,
    `Processor: ${r.controller.model} (qty ${r.controller.qty})`,
    `Programming budget (hours): ~${r.controller.programmingHours}`,
    "",
    "PRE-JOB CHECKLIST — COMPLETE BEFORE LEAVING SHOP:",
    "",
    "TOOLS REQUIRED:",
    `${CB}Drill / impact with low-voltage bits`,
    `${CB}Fish sticks and glow rods`,
    `${CB}Tone and probe / cable tester`,
    `${CB}Laptop for controller commissioning`,
    `${CB}Label maker`,
    `${CB}Torpedo level`,
    `${CB}Tablet for on-wall UI photos`,
    "",
    "MATERIALS TO LOAD ON TRUCK:",
    ...(s.lightingPoints > 0
      ? [`${CB}Dimmer/switch devices — ${s.lightingPoints} location(s) (per BOM)`]
      : []),
    ...(s.shades > 0
      ? [`${CB}Shade motors / rails — ${s.shades} opening(s)`]
      : []),
    ...(s.thermostats > 0
      ? [`${CB}Smart thermostat(s) — ${s.thermostats}`]
      : []),
    ...(s.cameras > 0
      ? [`${CB}IP camera(s) — ${s.cameras} · Cat6 spools`]
      : []),
    ...(s.locks > 0 ? [`${CB}Smart lock(s) — ${s.locks}`] : []),
    ...(s.securitySensors > 0
      ? [`${CB}Contact / motion sensors — ${s.securitySensors}`]
      : []),
    ...(s.keypads > 0
      ? [`${CB}Touchpanel / keypad — ${s.keypads}`]
      : []),
    `${CB}Main controller / processor — ${r.controller.model}`,
    `${CB}PoE switch or injector kit (plan ~${r.network.recommendedSwitchPorts} ports)`,
    `${CB}Cat6 patch cables, J-hooks, Velcro`,
    "",
    "CONFIRM WITH OWNER/GC:",
    `${CB}Rack / equipment closet location — power and cooling`,
    `${CB}Wi‑Fi coverage or wired backhaul for cameras`,
    `${CB}Lutron / lighting load types verified (LED, MLV, ELV)`,
    `${CB}Door prep for smart locks (bore, strike)`,
    "",
    "ROOM BY ROOM INSTALLATION PLAN:",
  ];

  const sorted = [...r.roomRows].sort((a, b) =>
    a.roomName.localeCompare(b.roomName),
  );
  for (const row of sorted) {
    lines.push(
      `Room: ${row.roomName}`,
      `${CB}Rough-in low-voltage as required (keypads, shades, sensors)`,
      `${CB}Trim devices — ${row.dimmers} dimmer location(s), ${row.shades} shade(s), cameras ${row.camera}`,
      `${CB}Label all homeruns at rack`,
      "",
    );
  }

  lines.push(
    "ROUGH-IN PHASE:",
    `${CB}Verify wire labels against floor plan`,
    `${CB}Pull Cat6 homeruns for keypads, touchpanels, and IP devices`,
    `${CB}Shade low-voltage — confirm side and stack height`,
    `${CB}Camera locations — confirm soffit / eave structure`,
    "",
    "TRIM-OUT PHASE:",
    `${CB}Install controller; connect to network`,
    `${CB}Pair lighting loads; verify LED dimming performance`,
    `${CB}Commission shades — set limits and favorite positions`,
    `${CB}Mount cameras; aim; verify recording / app view`,
    `${CB}Install locks; test codes and auto-lock rules`,
    "",
    "PROGRAMMING PHASE:",
    `${CB}Build rooms, scenes, and schedules per scope (~${r.controller.programmingHours} hr budget)`,
    `${CB}Voice assistant linking (if in scope)`,
    `${CB}Remote access and notifications tested`,
    "",
    "TESTING PHASE:",
    `${CB}Walk every room — lights, shades, climate, locks`,
    `${CB}Failover test — internet drop behavior documented`,
    `${CB}Hand off app credentials and quick-start card`,
    "",
    "DOCUMENTATION:",
    `${CB}As-built device list exported for customer`,
    `${CB}Photos of rack / panel`,
    "",
    "COMPLETION SIGN-OFF:",
    "System operational: Yes / No",
    "Punch list: ___________________________________________",
    "",
    "Lead Technician: ____________ Date: _______",
    "Owner/GC Signature: _________ Date: _______",
    "",
    RULE_SHORT,
    "TPP Electrical Contractors Inc.",
    "Licensed Electrical Contractor — Est. 1982",
    "blueprint-a-iapp.vercel.app",
    RULE_SHORT,
  );

  return lines.join("\n");
}

export function buildSmartHomeClientProposalText(
  inputs: ShInputs,
  r: ShResults,
  proposalNumber: string,
  investment: ShProposalInvestment | null,
): string {
  const clientFor = inputs.clientName?.trim() || "___________________";
  const property = inputs.projectName?.trim() || "—";
  const bt = buildingPretty(inputs.buildingType);
  const s = r.summary;
  const tierMid = r.tiers.find((t) => t.tier === "better") ?? r.tiers[1]!;

  const installBullets: string[] = [];
  if (s.lightingPoints > 0)
    installBullets.push(
      `- ${s.lightingPoints} lighting control point${s.lightingPoints === 1 ? "" : "s"} (dimming and scenes)`,
    );
  if (s.shades > 0)
    installBullets.push(`- ${s.shades} motorized shade${s.shades === 1 ? "" : "s"}`);
  if (s.cameras > 0)
    installBullets.push(`- ${s.cameras} security camera${s.cameras === 1 ? "" : "s"}`);
  if (s.locks > 0)
    installBullets.push(`- ${s.locks} smart lock${s.locks === 1 ? "" : "s"}`);
  if (installBullets.length === 0) {
    installBullets.push(
      "- Centralized automation processor and in-wall controls",
      "- Network-ready infrastructure for today’s smart devices",
    );
  }
  installBullets.push(
    "- Professional programming, testing, and training",
  );

  const investmentLines: string[] = investment
    ? [
        `Materials (after markup):     ${formatUsd(investment.materialsAfterMarkup)}`,
        `Sales tax (${investment.taxPct}% on materials only): ${formatUsd(investment.salesTax)}`,
        `Materials with tax:           ${formatUsd(investment.materialsWithTax)}`,
        `Professional installation (no sales tax): ${formatUsd(investment.laborNoTax)}`,
        RULE_SHORT,
        `Total investment:             ${formatUsd(investment.total)}`,
        "",
        "Note: Sales tax applies to materials and equipment only, not labor.",
      ]
    : [
        `Representative hardware range: ${tierMid.hardwareCostRange}`,
        "",
        "[Finalize pricing in Project Breakdown — materials, tax, and labor are itemized there.]",
      ];

  const estDays = Math.max(2, Math.ceil(estLaborHoursSh(r) / 8));

  const lines: string[] = [
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "EST. 1982",
    "Smart Home & Automation Installation Proposal",
    RULE_SHORT,
    "",
    `Proposal #: ${proposalNumber}`,
    `Date: ${formatDateLong()}`,
    "Valid for 30 days",
    "",
    `Prepared for: ${clientFor}`,
    `Property: ${property}`,
    "",
    "OVERVIEW:",
    `We will design and install a complete smart home automation system providing control of ${devicePhrase(s)} throughout your ${bt}.`,
    "You get one coordinated experience — lights, shades, locks, and cameras working together instead of a pile of separate apps.",
    "",
    "WHAT WILL BE INSTALLED:",
    ...installBullets,
    "",
    "ROOM BY ROOM HIGHLIGHTS:",
    ...r.roomRows.map((row) => `- ${roomHighlightSh(row)}`),
    "",
    "WHAT YOU WILL EXPERIENCE:",
    "- Control lighting, shades, and more from one primary app",
    "- Voice control where included in your package",
    "- Scenes such as “Away,” “Good night,” or “Entertain”",
    "- Secure remote access when you are off property",
    "",
    "INTEGRATION / DRIVER BOM (representative “better” tier):",
    tierMid.driverBom,
    r.presenceDetectionProposalLine,
    "",
    "WHAT WE NEED FROM YOU:",
    "- Network and internet details (modem location, SSID preferences)",
    "- Full access on installation and programming days",
    "- Decisions on keypad styles, scene names, and notification preferences",
    "",
    "INVESTMENT SUMMARY:",
    ...investmentLines,
    "",
    "TIMELINE:",
    `Estimated on-site work: about ${estDays} day${estDays === 1 ? "" : "s"}`,
    "Typical completion: 3–8 weeks from approval (depends on product lead times)",
    "",
    "WARRANTY:",
    "- Manufacturer warranty on all equipment",
    "- TPP Electrical workmanship warranty: 1 year",
    "",
    "APPROVAL:",
    "By signing below you authorize TPP Electrical Contractors Inc. to proceed as described.",
    "",
    "Client Signature: _________________________ Date: _________",
    "Print Name: ______________________________",
    "",
    "TPP Representative: _______________________ Date: _________",
    "",
    RULE_SHORT,
    "TPP Electrical Contractors Inc.",
    "Licensed Electrical Contractor — Est. 1982",
    "blueprint-a-iapp.vercel.app",
    RULE_SHORT,
  ];

  return lines.join("\n");
}
