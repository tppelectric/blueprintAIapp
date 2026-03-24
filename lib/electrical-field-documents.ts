import type {
  ElectricalInputs,
  ElectricalResults,
} from "@/lib/electrical-analyzer-engine";

const CB = "\u2610 ";

export function buildElectricalWorkOrderText(
  input: ElectricalInputs,
  results: ElectricalResults,
  docNo: string,
): string {
  const s = input.setup;
  const lines: string[] = [
    "TPP ELECTRIC — WORK ORDER",
    `Document: ${docNo}`,
    `Project: ${s.projectName || "—"}`,
    `Client: ${s.clientName || "—"}`,
    `Address: ${s.projectAddress || "—"}`,
    "",
    "ROOM-BY-ROOM CHECKLIST",
    ...input.rooms.map(
      (r, i) =>
        `${i + 1}. ${r.name} (fl ${r.floor}, ${r.roomType.replace(/_/g, " ")}) — rough-in devices per plan; verify box counts.`,
    ),
    "",
    "CIRCUIT ROUGH-IN",
    ...results.circuitSchedule.slice(0, 40).map(
      (c) =>
        `${CB} Circuit ${c.circuit}: ${c.description} — ${c.room} (${c.amps}A, ${c.wire})`,
    ),
    results.circuitSchedule.length > 40
      ? `\n… +${results.circuitSchedule.length - 40} more circuits (see schedule export).`
      : "",
    "",
    "PANEL / TRIM",
    `${CB} Main panel: ${results.summary.recommendedPanelAmps}A, ${results.summary.recommendedPanelSpaces}-space (estimate)`,
    `${CB} Label all homeruns; torque breakers per manufacturer`,
    "",
    "TESTING",
    `${CB} GFCI / AFCI function tests`,
    `${CB} Polarity and grounding verification`,
    `${CB} Load test critical circuits`,
    "",
    "SIGN-OFF",
    "Technician: _________________  Date: _________",
    "Homeowner/GC: ______________  Date: _________",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildElectricalProposalText(
  input: ElectricalInputs,
  results: ElectricalResults,
  docNo: string,
): string {
  const s = input.setup;
  return [
    "TPP ELECTRIC — CLIENT PROPOSAL",
    `Reference: ${docNo}`,
    "",
    "OVERVIEW",
    `We propose electrical planning and installation support for ${s.projectName || "your project"} at ${s.projectAddress || "the job address"}.`,
    `Scope is based on approximately ${Math.round(s.totalSqFt)} sq ft, ${s.buildingType.replace(/_/g, " ")}, ${s.constructionType.replace(/_/g, " ")}.`,
    "",
    "WHAT WE INSTALL (SUMMARY)",
    `• Approximately ${results.summary.totalCircuitsEstimated} branch circuits before growth factor; ${results.summary.circuitsWithGrowth} circuits after 25% growth allowance.`,
    `• Service recommendation: ${results.summary.recommendedServiceAmps}A (illustrative — verify with load calc and AHJ).`,
    `• Panel target: ~${results.summary.recommendedPanelSpaces} spaces.`,
    `• ${input.rooms.length} room(s) captured in the takeoff.`,
    "",
    "NEC / CODE HIGHLIGHTS",
    results.necEditionLabel,
    "• GFCI: required in many kitchen, bath, basement, garage, and outdoor locations (NEC 210.8) — we verify against your final finishes.",
    "• AFCI: dwelling-unit 120V branch circuits in listed spaces (NEC 210.12) — coordinated with your room list.",
    "• Kitchen: two or more 20A small-appliance circuits where required (NEC 210.52(B)).",
    "",
    "INVESTMENT",
    "Detailed materials, labor, tax, and margin are summarized in the Project Breakdown section of your Blueprint AI export.",
    "",
    "TIMELINE",
    "Rough-in, inspection, trim, and final walkthrough scheduling to be confirmed after permit status and site readiness.",
    "",
    "PERMITS",
    s.permitRequired === "yes"
      ? "Permit required — we coordinate drawings and inspection scheduling as contracted."
      : s.permitRequired === "unknown"
        ? "Permit status unknown — confirm with local AHJ before scheduling."
        : "Permit status noted as not required — verify locally.",
    "",
    "Thank you for considering TPP Electric.",
  ].join("\n");
}
