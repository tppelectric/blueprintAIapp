import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import type { WifiAnalyzerInputs, WifiAnalyzerResults } from "@/lib/wifi-analyzer-engine";
import {
  buildClientProposalText,
  buildWorkOrderText,
} from "@/lib/wifi-field-documents";
import {
  addProposalPdfLines,
  addWorkOrderPdfLines,
  drawTppFieldDocFooter,
} from "@/lib/tpp-field-doc-pdf";

const FOOTER_PRIMARY = "Prepared by Blueprint AI";
const FOOTER_SECONDARY = "blueprint-a-iapp.vercel.app";

function addParagraphs(
  doc: jsPDF,
  lines: string[],
  margin: number,
  maxW: number,
  pageH: number,
  startY: number,
  lineHeight: number,
): number {
  let y = startY;
  for (const line of lines) {
    if (y > pageH - 72) {
      doc.addPage();
      y = margin;
    }
    const split = doc.splitTextToSize(line, maxW);
    for (const part of split) {
      if (y > pageH - 72) {
        doc.addPage();
        y = margin;
      }
      doc.text(part, margin, y);
      y += lineHeight;
    }
  }
  return y;
}

export async function downloadWifiAnalysisPdf(
  inputs: WifiAnalyzerInputs,
  results: WifiAnalyzerResults,
): Promise<void> {
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;

  let y = drawTppPdfLetterhead(doc, margin, margin + 8, logo, {
    logoWidthPt: 52,
    pageWidth: pageW,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(25, 25, 25);
  doc.text("Wi-Fi Network Analyzer & Planner", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Project: ${inputs.projectName || "—"}`, margin, y);
  y += 14;
  if (inputs.clientName?.trim()) {
    doc.text(`Client: ${inputs.clientName.trim()}`, margin, y);
    y += 14;
  }
  doc.text(
    `Internet: ${inputs.internetSpeedMbps} Mbps · Priority: ${inputs.planningPriority.replace(/_/g, " ")}`,
    margin,
    y,
    { maxWidth: maxW },
  );
  y += 14;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 24;
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Coverage summary", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summaryLines = [
    `Total rooms: ${results.totalRooms} (${results.completeRooms} complete, ${results.incompleteRooms} incomplete)`,
    `Total indoor sq ft: ${results.totalIndoorSqFt} · Total devices (summed): ${results.totalDevices}`,
    `Recommended access points: ${results.recommendedAps} (${results.indoorAps} indoor + ${results.outdoorAps} outdoor)`,
    `Avg indoor coverage per AP: ~${results.coveragePerApSqFt} sq ft`,
    `Total footprint (all complete rooms): ${results.totalCoverageSqFt} sq ft`,
    `Estimated hardware budget tier: ${results.estimatedHardwareCostRange}`,
    `Hardware estimate: ${results.hardwareCostEstimateLabel}`,
  ];
  y = addParagraphs(doc, summaryLines, margin, maxW, pageH, y, 14);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Gateway", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  y = addParagraphs(
    doc,
    [results.gatewayRecommendation],
    margin,
    maxW,
    pageH,
    y,
    14,
  );
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Zone map (by room)", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const zoneLines = results.roomRows.map((row) =>
    row.complete
      ? `${row.name} (fl ${row.floor}, ${row.areaSqFt} sq ft) — ${row.zoneType} — ${row.servedByAp}`
      : `${row.name} — incomplete: ${row.incompleteReason ?? "fix inputs"}`,
  );
  y = addParagraphs(doc, zoneLines, margin, maxW, pageH, y, 14);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Whole-home AP plan", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const eq = results.equipment;
  y = addParagraphs(
    doc,
    [
      eq.wholeHomeApPlan,
      `Primary indoor SKU line: ${eq.apModel}`,
      ...(eq.outdoorApModel ? [`Outdoor: ${eq.outdoorApModel}`] : []),
      `${eq.switchNote} — target ${eq.switchPorts} PoE ports`,
    ],
    margin,
    maxW,
    pageH,
    y,
    14,
  );
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.text("Cable & low-voltage takeoff", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const mat = [
    `CAT6 cable: ${results.cat6FootageLf} LF`,
    `CAT6 home runs (drops): ${results.cat6Drops}`,
    `Low-voltage brackets: ${results.lvBrackets} EA`,
    `RJ45 keystone jacks: ${results.rj45Jacks} EA`,
    `Patch cables (short): ${results.patchCables} EA`,
    `PoE switch ports (target): ${results.poeSwitchPorts}`,
    `Wireless APs (indoor): ${results.indoorAps} EA`,
    ...(results.outdoorAps > 0
      ? [`Wireless APs (outdoor): ${results.outdoorAps} EA`]
      : []),
  ];
  y = addParagraphs(doc, mat, margin, maxW, pageH, y, 14);
  y += 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  y = addParagraphs(
    doc,
    [`Switch location: ${results.switchLocationNote}`],
    margin,
    maxW,
    pageH,
    y,
    14,
  );
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Labor planning estimates", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const lh = results.laborHours;
  const laborLines = [
    `Cable rough-in: ${lh.cableRoughInHours} h (${results.cat6Drops} drops × 1.5 h)`,
    `AP mount & terminate: ${lh.apMountTerminateHours} h (${results.recommendedAps} APs × 0.5 h)`,
    `Switch & gateway setup: ${lh.switchGatewaySetupHours} h (flat)`,
    `Network configuration: ${lh.networkConfigHours} h (1 h per 10 APs, min 1)`,
    `Testing & walkthrough: ${lh.testingWalkthroughHours} h (flat)`,
    `Total estimated labor: ${lh.totalLaborHours} h`,
  ];
  y = addParagraphs(doc, laborLines, margin, maxW, pageH, y, 13);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Work scope notes", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const scopeNoteLines = [
    "Whole-home RF design: AP count is not one-per-room; final positions coordinated on site.",
    "Low-voltage: homerun CAT6 from each AP to the PoE switch location; terminate to keystone.",
    "Configuration: SSID, WPA3 where supported, optional guest VLAN — per owner direction.",
  ];
  y = addParagraphs(doc, scopeNoteLines, margin, maxW, pageH, y, 13);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Planning notes", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const noteLines = [
    "AP count is planned for a whole-home layout, not one access point per room.",
    ...results.planNotes,
    ...results.incompleteWarnings.map((w) => `Warning: ${w}`),
  ];
  y = addParagraphs(doc, noteLines, margin, maxW, pageH, y, 13);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  y = addParagraphs(
    doc,
    [
      `${results.assumptionsLine}. Actual coverage may vary. Professional site survey recommended for large or complex installations.`,
    ],
    margin,
    maxW,
    pageH,
    y,
    12,
  );

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(FOOTER_PRIMARY, margin, pageH - 36);
  doc.text(FOOTER_SECONDARY, margin, pageH - 26);

  const safe =
    (inputs.projectName || "wifi-plan")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "wifi-plan";
  doc.save(`wifi-analyzer-${safe}.pdf`);
}

/** Field work order PDF — drawn checkboxes + TPP letterhead. */
export async function downloadWifiWorkOrderPdf(
  inputs: WifiAnalyzerInputs,
  results: WifiAnalyzerResults,
  workOrderNumber: string,
): Promise<void> {
  const body = buildWorkOrderText(inputs, results, workOrderNumber);
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;

  let y = drawTppPdfLetterhead(doc, margin, margin + 8, logo, {
    logoWidthPt: 52,
    pageWidth: pageW,
  });

  y = addWorkOrderPdfLines(
    doc,
    body.split("\n"),
    margin,
    maxW,
    pageH,
    y,
    13,
    "Wi-Fi",
  );

  drawTppFieldDocFooter(doc, margin, pageH);

  const safe =
    (inputs.projectName || "wifi-wo")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "wifi-wo";
  doc.save(`wifi-work-order-${safe}.pdf`);
}

/** Client proposal PDF — TPP letterhead, clean typography. */
export async function downloadWifiClientProposalPdf(
  inputs: WifiAnalyzerInputs,
  results: WifiAnalyzerResults,
  proposalNumber: string,
): Promise<void> {
  const body = buildClientProposalText(inputs, results, proposalNumber);
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;

  let y = drawTppPdfLetterhead(doc, margin, margin + 8, logo, {
    logoWidthPt: 52,
    pageWidth: pageW,
  });

  y = addProposalPdfLines(
    doc,
    body.split("\n"),
    margin,
    maxW,
    pageH,
    y,
    13,
    "Wi-Fi",
  );

  drawTppFieldDocFooter(doc, margin, pageH);

  const safe =
    (inputs.projectName || "wifi-proposal")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "wifi-proposal";
  doc.save(`wifi-client-proposal-${safe}.pdf`);
}
