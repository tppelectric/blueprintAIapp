import type {
  PlanningPriority,
  VendorChoice,
  WifiAnalyzerInputs,
  WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";

const RULE =
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export function vendorRecommendationReason(
  vendor: VendorChoice,
  priority: PlanningPriority,
): string {
  const p =
    priority === "future_proof"
      ? "future-proof headroom"
      : priority === "best_performance"
        ? "performance-focused RF and throughput"
        : priority === "lowest_cost"
          ? "cost sensitivity"
          : "balanced value";
  switch (vendor) {
    case "ubiquiti":
      return `Ubiquiti UniFi recommended for integrated gateway, PoE switches, and indoor/outdoor APs at strong ${p}.`;
    case "ruckus":
      return `Ruckus recommended for challenging RF environments and enterprise-grade Wi‑Fi under ${p} goals.`;
    case "cisco_meraki":
      return `Cisco Meraki recommended for cloud-managed stack and simplified ongoing operations (${p}).`;
    case "tp_link":
      return `TP-Link Omada recommended for cost-effective managed Wi‑Fi with local or cloud control (${p}).`;
    case "access_networks":
      return `Access Networks recommended for premium residential and light commercial integrated deployments (${p}).`;
    default:
      return `Vendor left open; defaulting to best-value UniFi-class stack unless you standardize on another line (${p}).`;
  }
}

function specialInstallNotes(inputs: WifiAnalyzerInputs, r: WifiAnalyzerResults): string[] {
  const notes: string[] = [];
  if (r.outdoorAps > 0) {
    notes.push("Outdoor-rated APs and weatherproof cable practices apply to exterior zones.");
  }
  if (inputs.poe === "recommend") {
    notes.push("PoE switch sizing should match or exceed the target port count with headroom.");
  }
  if (r.incompleteRooms > 0) {
    notes.push(
      `${r.incompleteRooms} room(s) are incomplete in the planner — confirm dimensions and device counts on site.`,
    );
  }
  const hard =
    inputs.rooms?.filter(
      (x) =>
        ["brick", "concrete_block", "mixed"].includes(x.wallMaterial) && !x.outdoor,
    ).length ?? 0;
  if (hard >= 3) {
    notes.push("Multiple hard-wall rooms may require extra AP density or alternate mounting — verify on walkthrough.");
  }
  if (notes.length === 0) {
    notes.push("No unusual constraints flagged beyond standard residential/commercial Wi‑Fi practice.");
  }
  return notes;
}

function ownerDecisions(inputs: WifiAnalyzerInputs): string[] {
  return [
    "Final SSID names, password policy, and whether to enable a guest VLAN or separate guest SSID.",
    "Whether ISP equipment stays in place or is bridged; static IP needs if any.",
    "Preferred network closet / rack location and any aesthetic constraints for visible APs.",
    inputs.poe === "yes"
      ? "Confirm existing PoE switch make/model and available PoE budget for new APs."
      : "Approve PoE switch model and port count for this design.",
  ];
}

/**
 * Full printable scope-of-work text (TPP header block + sections).
 */
export function buildWorkScopeText(
  inputs: WifiAnalyzerInputs,
  r: WifiAnalyzerResults,
): string {
  const dateStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const eq = r.equipment;
  const lh = r.laborHours;
  const vendorLine = vendorRecommendationReason(inputs.vendor, inputs.planningPriority);
  const special = specialInstallNotes(inputs, r);
  const decisions = ownerDecisions(inputs);

  const materialsBlock = [
    `- ${r.indoorAps} Wireless Access Points (${eq.apModel})`,
    ...(r.outdoorAps > 0 && eq.outdoorApModel
      ? [`- ${r.outdoorAps} Outdoor Wireless Access Points (${eq.outdoorApModel})`]
      : []),
    `- 1 PoE Network Switch (${eq.switchNote})`,
    `- 1 Network Gateway (${r.gatewayRecommendation})`,
    `- ${r.cat6FootageLf} LF CAT6 Cable`,
    `- ${r.lvBrackets} Low Voltage Brackets`,
    `- ${r.rj45Jacks} RJ45 Keystone Jacks`,
    `- ${r.patchCables} Patch Cables`,
    `Estimated Material Cost: ${r.hardwareCostEstimateLabel}`,
  ].join("\n");

  const coverageZones = r.roomRows
    .map((row) => {
      if (!row.complete) {
        return `- ${row.name}: INCOMPLETE — ${row.incompleteReason ?? "fix inputs"}`;
      }
      return `- ${row.name} (fl ${row.floor}, ${row.areaSqFt} sq ft): ${row.zoneType} — ${row.servedByAp}`;
    })
    .join("\n");

  const lines: string[] = [
    RULE,
    "TPP ELECTRICAL CONTRACTORS INC.",
    "Wi-Fi Network Installation Scope of Work",
    RULE,
    "",
    `PROJECT: ${inputs.projectName || "—"}`,
    `DATE: ${dateStr}`,
    "PREPARED BY: Blueprint AI",
    "",
    "OVERVIEW:",
    `Supply and install a complete Wi-Fi network system for ${inputs.buildingType.replace(/_/g, " ")} with ${r.totalRooms} room(s) totaling approximately ${r.totalCoverageSqFt} sq ft (complete rooms footprint).`,
    "",
    "MATERIALS TO BE SUPPLIED:",
    materialsBlock,
    "",
    "LABOR SCOPE:",
    `- Install and mount ${r.recommendedAps} wireless access point(s) in locations per coverage plan (whole-home layout; not necessarily one AP per room).`,
    `- Run CAT6 cable from each AP location to network closet/switch location. Estimated footage: ${r.cat6FootageLf} LF.`,
    "- Terminate all CAT6 runs at keystone jacks.",
    "- Install and configure PoE network switch.",
    "- Install and configure network gateway.",
    "- Connect all APs to switch via PoE.",
    "- Configure wireless network:",
    "  * Network name (SSID)",
    "  * Security settings (WPA3 where supported)",
    "  * VLAN configuration if required",
    "  * Guest network if required",
    "- Test coverage in all rooms.",
    "- Document network configuration.",
    "- Walk through with owner/GC.",
    "",
    "COVERAGE ZONES:",
    coverageZones,
    "",
    "RECOMMENDATIONS:",
    `- ${vendorLine}`,
    ...special.map((s) => `- ${s}`),
    ...decisions.map((d) => `- Owner to decide: ${d}`),
    "",
    "ESTIMATED LABOR HOURS:",
    `- Cable rough-in: ${lh.cableRoughInHours} hours (${r.cat6Drops} drops × 1.5 hours per drop)`,
    `- AP mounting and termination: ${lh.apMountTerminateHours} hours (${r.recommendedAps} APs × 0.5 hours each)`,
    "- Switch and gateway setup: 2 hours",
    `- Network configuration: ${lh.networkConfigHours} hours (1 hour per 10 APs, minimum 1)`,
    "- Testing and walkthrough: 1 hour",
    `Total estimated labor: ${lh.totalLaborHours} hours`,
    "",
    "NOTES AND EXCLUSIONS:",
    "- Final AP placement to be confirmed on site with owner.",
    "- Network passwords and credentials to be provided by owner.",
    "- Conduit not included unless specified.",
    "- Patch panel not included unless specified.",
    "- This scope is based on provided room dimensions and may vary on site.",
    "",
    RULE,
    "This document is for planning purposes.",
    "Final scope subject to site conditions.",
    RULE,
  ];

  return lines.join("\n");
}
