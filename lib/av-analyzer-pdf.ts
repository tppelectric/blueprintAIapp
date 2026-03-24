import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import {
  buildAvClientProposalText,
  buildAvWorkOrderText,
  type AvProposalInvestment,
} from "@/lib/av-field-documents";
import {
  addProposalPdfLines,
  addWorkOrderPdfLines,
  drawTppFieldDocFooter,
} from "@/lib/tpp-field-doc-pdf";
import type { AvAvInputs, AvResults } from "@/lib/av-analyzer-engine";

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

export async function downloadAvAnalysisPdf(
  inputs: AvAvInputs,
  results: AvResults,
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
  doc.text("Audio/Video System Analyzer & Planner", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = addLines(
    doc,
    [
      `Project: ${inputs.projectName || "—"}`,
      inputs.clientName ? `Client: ${inputs.clientName}` : "",
      ...results.summaryLines,
    ].filter(Boolean),
    margin,
    maxW,
    pageH,
    y,
    14,
  );
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Room plan", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const rows = results.roomRows.map(
    (r) =>
      `${r.roomName} (fl ${r.floor}) — ${r.speakerQty} spk — ${r.displaySizeIn ? `${r.displaySizeIn}"` : "no display"} — ${r.zone}`,
  );
  y = addLines(doc, rows, margin, maxW, pageH, y, 12);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Materials rollup", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const m = results.materials;
  y = addLines(
    doc,
    [
      `Speakers 5.25" / 6.5" / 8": ${m.speakers525} / ${m.speakers65} / ${m.speakers8}`,
      `Outdoor pairs: ${m.outdoorPairs}`,
      `Speaker wire LF — 16/2: ${m.speakerWire16Lf}, 14/2: ${m.speakerWire14Lf}, 12/2: ${m.speakerWire12Lf}`,
      `HDMI LF: ${m.hdmiLf} · Cat6: ${m.cat6Lf} · HDBaseT kits: ${m.hdbasetKits}`,
    ],
    margin,
    maxW,
    pageH,
    y,
    13,
  );
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(FOOTER, margin, pageH - 28);

  const safe =
    (inputs.projectName || "av-plan")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "av-plan";
  doc.save(`av-analyzer-${safe}.pdf`);
}

export async function downloadAvWorkOrderPdf(
  inputs: AvAvInputs,
  results: AvResults,
  docNo: string,
): Promise<void> {
  const body = buildAvWorkOrderText(inputs, results, docNo);
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
    "Audio/Video",
  );
  drawTppFieldDocFooter(doc, margin, pageH);
  doc.save(`AV-WO-${docNo}.pdf`);
}

export async function downloadAvProposalPdf(
  inputs: AvAvInputs,
  results: AvResults,
  docNo: string,
  investment: AvProposalInvestment | null,
): Promise<void> {
  const body = buildAvClientProposalText(inputs, results, docNo, investment);
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
    "Audio/Video",
  );
  drawTppFieldDocFooter(doc, margin, pageH);
  doc.save(`AV-PROP-${docNo}.pdf`);
}
