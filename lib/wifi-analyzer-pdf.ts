import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import type { WifiAnalyzerInputs, WifiAnalyzerResults } from "@/lib/wifi-analyzer-engine";

const FOOTER = "Blueprint AI — blueprint-a-iapp.vercel.app";

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
    `Recommended access points: ${results.recommendedAps} (indoor ${results.indoorAps}, outdoor ${results.outdoorAps})`,
    `Effective coverage per AP (planning basis): ~${results.effectiveSqFtPerAp} sq ft`,
    `Building total area: ${results.totalCoverageSqFt} sq ft`,
    `Dead zone risk: ${results.deadZoneRisk}`,
    `Estimated hardware budget tier: ${results.estimatedHardwareCostRange}`,
  ];
  for (const line of summaryLines) {
    doc.text(line, margin, y, { maxWidth: maxW });
    y += 14;
  }
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Equipment", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const eq = results.equipment;
  doc.text(`Primary AP: ${eq.apModel}`, margin, y, { maxWidth: maxW });
  y += 14;
  if (eq.outdoorApModel) {
    doc.text(`Outdoor AP: ${eq.outdoorApModel}`, margin, y, { maxWidth: maxW });
    y += 14;
  }
  doc.text(`${eq.switchNote} — target ${eq.switchPorts} PoE ports`, margin, y, {
    maxWidth: maxW,
  });
  y += 22;

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
    `Wireless APs (indoor): ${results.indoorAps} EA`,
    ...(results.outdoorAps > 0
      ? [`Wireless APs (outdoor): ${results.outdoorAps} EA`]
      : []),
  ];
  for (const m of mat) {
    doc.text(m, margin, y);
    y += 14;
  }
  y += 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(`Switch location: ${results.switchLocationNote}`, margin, y, {
    maxWidth: maxW,
  });
  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.text(
    `Assumptions: ${results.assumptionsLine}. Actual coverage may vary. Professional site survey recommended for large or complex installations.`,
    margin,
    y,
    { maxWidth: maxW },
  );

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(FOOTER, margin, pageH - 28);

  const safe =
    (inputs.projectName || "wifi-plan")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "wifi-plan";
  doc.save(`wifi-analyzer-${safe}.pdf`);
}
