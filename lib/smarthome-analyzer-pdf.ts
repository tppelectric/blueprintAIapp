import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import {
  buildSmartHomeClientProposalText,
  buildSmartHomeWorkOrderText,
  type ShProposalInvestment,
} from "@/lib/smarthome-field-documents";
import {
  addProposalPdfLines,
  addWorkOrderPdfLines,
  drawTppFieldDocFooter,
} from "@/lib/tpp-field-doc-pdf";
import type { ShInputs, ShResults } from "@/lib/smarthome-analyzer-engine";

const FOOTER = "TPP Electrical Contractors Inc. · Est. 1982";

function addLines(
  doc: jsPDF,
  lines: string[],
  margin: number,
  maxW: number,
  pageH: number,
  y: number,
  lh: number,
): number {
  let yy = y;
  for (const line of lines) {
    if (yy > pageH - 56) {
      doc.addPage();
      yy = margin;
    }
    const parts = doc.splitTextToSize(line, maxW);
    for (const p of parts) {
      if (yy > pageH - 56) {
        doc.addPage();
        yy = margin;
      }
      doc.text(p, margin, yy);
      yy += lh;
    }
  }
  return yy;
}

export async function downloadSmartHomeAnalysisPdf(
  inputs: ShInputs,
  results: ShResults,
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
  doc.setFontSize(15);
  doc.text("Smart Home & Automation Planner", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = addLines(doc, results.summaryLines, margin, maxW, pageH, y, 14);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Recommended controller", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  y = addLines(
    doc,
    [
      results.controller.title,
      results.controller.why,
      `Model: ${results.controller.model} × ${results.controller.qty}`,
      `Programming est.: ${results.controller.programmingHours} hrs`,
      results.controller.networkNotes,
      results.controller.integrationNotes,
    ],
    margin,
    maxW,
    pageH,
    y,
    13,
  );
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Network", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  y = addLines(
    doc,
    [
      `IP cameras: ${results.network.ipCameras}`,
      `Controllers: ${results.network.ipControllers}`,
      `Switch ports (target): ${results.network.recommendedSwitchPorts}`,
      ...results.network.vlanNotes.map((v) => `• ${v}`),
    ],
    margin,
    maxW,
    pageH,
    y,
    13,
  );
  doc.setFontSize(8);
  doc.text(FOOTER, margin, pageH - 28);
  const safe =
    (inputs.projectName || "smarthome")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "smarthome";
  doc.save(`smarthome-analyzer-${safe}.pdf`);
}

export async function downloadSmartHomeWorkOrderPdf(
  inputs: ShInputs,
  results: ShResults,
  docNo: string,
): Promise<void> {
  const body = buildSmartHomeWorkOrderText(inputs, results, docNo);
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
    "Smart Home",
  );
  drawTppFieldDocFooter(doc, margin, pageH);
  doc.save(`SH-WO-${docNo}.pdf`);
}

export async function downloadSmartHomeProposalPdf(
  inputs: ShInputs,
  results: ShResults,
  docNo: string,
  investment: ShProposalInvestment | null,
): Promise<void> {
  const body = buildSmartHomeClientProposalText(inputs, results, docNo, investment);
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
    "Smart Home",
  );
  drawTppFieldDocFooter(doc, margin, pageH);
  doc.save(`SH-PROP-${docNo}.pdf`);
}
