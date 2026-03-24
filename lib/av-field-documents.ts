import type { AvAvInputs, AvResults } from "@/lib/av-analyzer-engine";

const RULE_SHORT = "━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const CB = "\u2610 ";

export type AvProposalInvestment = {
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

function buildingPretty(b: AvAvInputs["buildingType"]): string {
  return b.replace(/_/g, " ");
}

function roomHighlightPlain(row: AvResults["roomRows"][number]): string {
  const parts: string[] = [];
  if (row.speakerQty > 0) {
    parts.push(
      `even sound with ${row.speakerQty} in-ceiling speaker${row.speakerQty === 1 ? "" : "s"}`,
    );
  }
  if (row.displaySizeIn) {
    parts.push(
      `a large-screen TV or projector setup around ${row.displaySizeIn} inches, sized for comfortable viewing`,
    );
  }
  if (parts.length === 0) return `${row.roomName}: support spaces as needed.`;
  return `${row.roomName}: ${parts.join(" and ")}.`;
}

function estLaborHours(r: AvResults): number {
  return Math.max(
    8,
    Math.round(
      r.totalSpeakers * 2 +
        r.totalDisplays * 2.5 +
        r.ampZones * 3 +
        r.materials.projectorQty * 4,
    ),
  );
}

/**
 * Field work order — Wi‑Fi-style depth for AV installation.
 */
export function buildAvWorkOrderText(
  inputs: AvAvInputs,
  r: AvResults,
  workOrderNumber: string,
): string {
  const m = r.materials;
  const clientLine = inputs.clientName?.trim()
    ? inputs.clientName.trim()
    : "_______________________________";
  const hrs = estLaborHours(r);
  const targetCompletion =
    hrs <= 16 ? "1–2 days" : `${Math.max(2, Math.ceil(hrs / 8))} days`;

  const lines: string[] = [
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "EST. 1982 — Licensed Electrical Contractor",
    "FIELD WORK ORDER — Audio/Video Installation",
    RULE_SHORT,
    "",
    `Work Order #: ${workOrderNumber}`,
    `Date: ${formatDateLong()}`,
    `Project: ${inputs.projectName || "—"}`,
    `Client: ${clientLine}`,
    `Building: ${buildingPretty(inputs.buildingType)}`,
    "",
    "CREW ASSIGNMENT:",
    "Lead Technician: _______________________",
    "Helper/Apprentice: _____________________",
    `Estimated Hours: ${hrs} hours (planning estimate)`,
    `Target Completion: ${targetCompletion}`,
    "",
    "PROJECT OVERVIEW:",
    `${r.roomsWithAudio} room(s) with audio · ${r.roomsWithVideo} with video · ${r.totalSpeakers} speakers · ${r.ampZones} amplification zone(s).`,
    `Recommended distribution approach: ${r.recommendedDistribution}`,
    "",
    "PRE-JOB CHECKLIST — COMPLETE BEFORE LEAVING SHOP:",
    "",
    "TOOLS REQUIRED:",
    `${CB}Stud finder / structure scan`,
    `${CB}Fish tape and rods (25 ft+ )`,
    `${CB}Laser measure`,
    `${CB}Torpedo and 4 ft level`,
    `${CB}Impact driver / drill with paddle and installer bits`,
    `${CB}Drywall saw and oscillating tool`,
    `${CB}Cable tester (speaker + HDMI continuity as applicable)`,
    `${CB}HDMI / HDBaseT field tester where specified`,
    `${CB}Label maker`,
    `${CB}Painter’s tape for layout marks`,
    `${CB}Ladder (8–12 ft typical)`,
    "",
    "MATERIALS TO LOAD ON TRUCK:",
    ...(m.speakers525 > 0
      ? [`${CB}${m.speakers525} In-ceiling speaker(s) 5.25" (allowance)`]
      : []),
    ...(m.speakers65 > 0
      ? [`${CB}${m.speakers65} In-ceiling speaker(s) 6.5" (allowance)`]
      : []),
    ...(m.speakers8 > 0
      ? [`${CB}${m.speakers8} In-ceiling speaker(s) 8" (allowance)`]
      : []),
    ...(m.outdoorPairs > 0
      ? [`${CB}${m.outdoorPairs} Outdoor speaker pair(s)`]
      : []),
    ...(m.displays.length > 0
      ? [
          `${CB}Display(s) / mount hardware per takeoff (${m.displays.reduce((a, d) => a + d.qty, 0)} unit(s))`,
        ]
      : []),
    ...(m.projectorQty > 0
      ? [`${CB}Projector / screen kit(s) — ${m.projectorQty} location(s)`]
      : []),
    `${CB}Speaker wire — 16/2: ~${m.speakerWire16Lf} LF, 14/2: ~${m.speakerWire14Lf} LF, 12/2: ~${m.speakerWire12Lf} LF`,
    `${CB}HDMI 2.1 — ~${m.hdmiLf} LF · Cat6 — ~${m.cat6Lf} LF`,
    ...(m.hdbasetKits > 0
      ? [`${CB}HDBaseT extender kit(s) — ${m.hdbasetKits}`]
      : []),
    `${CB}Low-voltage brackets — ${m.lvBrackets}`,
    `${CB}Volume controls / keypads — ${m.volumeControls} (if specified)`,
    `${CB}Rack screws, bushings, plates, and Velcro`,
    "",
    "CONFIRM WITH OWNER/GC BEFORE STARTING:",
    `${CB}Speaker and TV locations approved`,
    `${CB}Equipment rack / closet location and ventilation`,
    `${CB}Confirm ceiling depth and obstructions above each speaker`,
    `${CB}Confirm display wall structure (stud spacing, stone, etc.)`,
    `${CB}Network path for streaming / control verified`,
    "",
    "ROOM BY ROOM INSTALLATION PLAN:",
  ];

  const sorted = [...r.roomRows].sort(
    (a, b) => a.floor - b.floor || a.roomName.localeCompare(b.roomName),
  );
  for (const row of sorted) {
    lines.push(
      `Room: ${row.roomName} | Floor ${row.floor} | ${row.sqFt} sq ft | Zone ${row.zone}`,
      `Speakers: ${row.speakerQty} (${row.speakerSizeNote})`,
      row.displaySizeIn
        ? `Display: ~${row.displaySizeIn}" — ${row.displayTypeNote}`
        : "Display: none on plan",
      `Speaker wire: ${row.speakerWireNote} · Video: ${row.videoWireNote}`,
      `${CB}Rough-in speaker cable; label at rack`,
      `${CB}Install LV bracket(s); firestop per code where required`,
      ...(row.speakerQty > 0
        ? [`${CB}Trim speakers; aim and phase-check`]
        : []),
      ...(row.displaySizeIn
        ? [
            `${CB}Mount display or projector per manufacturer`,
            `${CB}Pull and dress HDMI / fiber / HDBaseT per plan`,
          ]
        : []),
      "",
    );
  }

  lines.push(
    "ROUGH-IN PHASE:",
    `${CB}Walk job with homeowner / GC — confirm all locations`,
    `${CB}Mark ceiling and wall penetrations`,
    `${CB}Pull all homerun speaker wires to rack / amp location`,
    `${CB}Pull video backbone (HDMI / Cat6) per distance rules`,
    `${CB}Photograph cable tails before drywall repair`,
    "",
    "TRIM-OUT PHASE:",
    `${CB}Install in-ceiling / in-wall speakers`,
    `${CB}Install displays, projectors, and screens`,
    `${CB}Dress rack — patch panels, power sequencing, labeling`,
    `${CB}Connect amplification and sources per riser`,
    "",
    "TESTING PHASE:",
    `${CB}Verify every zone plays from selected sources`,
    `${CB}HDMI/HDBaseT — picture and HDR handshake check`,
    `${CB}Level-match zones; basic EQ / loudness per room`,
    `${CB}Demonstrate app or keypad control to customer`,
    `${CB}Document any punch-list items`,
    "",
    "DOCUMENTATION:",
    `${CB}Photos of rack wiring (before/after dress)`,
    `${CB}Save IP / login info in secure job file (no passwords on WO copy)`,
    "",
    "COMPLETION SIGN-OFF:",
    "Installation complete and tested: Yes / No",
    "Notes: ________________________________________________",
    "",
    "Lead Technician: ____________ Date: _______",
    "Print Name: ___________________________",
    "",
    "Owner/GC Acceptance:",
    "Signature: ______________ Date: _______",
    "Print Name: ___________________________",
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
 * Client-facing proposal — matches Wi‑Fi analyzer structure and tone.
 */
export function buildAvClientProposalText(
  inputs: AvAvInputs,
  r: AvResults,
  proposalNumber: string,
  investment: AvProposalInvestment | null,
): string {
  const clientFor = inputs.clientName?.trim() || "___________________";
  const property = inputs.projectName?.trim() || "—";
  const bt = buildingPretty(inputs.buildingType);
  const tierMid = r.tiers.find((t) => t.popular) ?? r.tiers[1] ?? r.tiers[0]!;

  const installBullets: string[] = [
    `- ${r.totalSpeakers} in-ceiling or architectural speaker${r.totalSpeakers === 1 ? "" : "s"} across ${r.roomsWithAudio} room${r.roomsWithAudio === 1 ? "" : "s"}`,
  ];
  if (r.totalDisplays > 0) {
    installBullets.push(
      `- ${r.totalDisplays} large-screen TV or projector system${r.totalDisplays === 1 ? "" : "s"}`,
    );
  }
  installBullets.push(
    "- Complete low-voltage wiring for audio and video",
    "- Professional configuration, testing, and owner walkthrough",
  );

  const experience = [
    "- Music and TV sound where you want it, room by room",
    "- Balanced volume as you move through the home",
    "- Simple control from your phone or tablet where designed",
    "- Equipment selected for reliability and clear dialogue",
  ];

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
        `Representative range (from plan tiers): ${tierMid.costRange}`,
        "",
        "[Finalize pricing in Project Breakdown — materials, tax, and labor are itemized there.]",
      ];

  const estDays = Math.max(2, Math.ceil(estLaborHours(r) / 8));

  const lines: string[] = [
    RULE_SHORT,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "EST. 1982",
    "Audio/Video Installation Proposal",
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
    `We will design and install a complete audio and video system for your ${bt}, providing ${r.ampZones} zone${r.ampZones === 1 ? "" : "s"} of music throughout ${r.roomsWithAudio} room${r.roomsWithAudio === 1 ? "" : "s"} and ${r.totalDisplays} display system${r.totalDisplays === 1 ? "" : "s"}.`,
    "Everything is planned for easy everyday use — you get great sound and picture without needing to be a tech expert.",
    "",
    "WHAT WILL BE INSTALLED:",
    ...installBullets,
    "",
    "ROOM BY ROOM HIGHLIGHTS:",
    ...r.roomRows.map((row) => `- ${roomHighlightPlain(row)}`),
    "",
    "WHAT YOU WILL EXPERIENCE:",
    ...experience,
    "",
    "WHAT WE NEED FROM YOU:",
    "- Reliable internet and network information for streaming devices",
    "- Access to all rooms on installation days",
    "- Final decisions on equipment finishes and control preferences",
    "",
    "INVESTMENT SUMMARY:",
    ...investmentLines,
    "",
    "TIMELINE:",
    `Estimated on-site installation: about ${estDays} day${estDays === 1 ? "" : "s"}`,
    "Typical completion: 2–6 weeks from written approval (varies by lead times and construction schedule)",
    "",
    "WARRANTY:",
    "- Equipment covered by manufacturer warranty (per manufacturer terms)",
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
