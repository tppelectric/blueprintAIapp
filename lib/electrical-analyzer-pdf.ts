import { jsPDF } from "jspdf";
import type { ElectricalInputs, ElectricalResults } from "@/lib/electrical-analyzer-engine";
import {
  buildElectricalProposalText,
  buildElectricalWorkOrderText,
} from "@/lib/electrical-field-documents";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";

function addWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  pageH: number,
  margin: number,
): number {
  let cy = y;
  const parts = text.split("\n");
  for (const line of parts) {
    const split = doc.splitTextToSize(line, maxW);
    for (const p of split) {
      if (cy > pageH - margin) {
        doc.addPage();
        cy = margin;
      }
      doc.text(p, x, cy);
      cy += lineH;
    }
  }
  return cy;
}

export async function downloadElectricalFullPlanPdf(
  input: ElectricalInputs,
  results: ElectricalResults,
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
  doc.setTextColor(20, 20, 20);
  doc.text("Electrical Project Analyzer — Full Plan", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(55, 55, 55);
  y = addWrapped(
    doc,
    `Project: ${input.setup.projectName}\nClient: ${input.setup.clientName}\nAddress: ${input.setup.projectAddress}\nNEC note: ${results.necEditionLabel}`,
    margin,
    y,
    maxW,
    13,
    pageH,
    margin,
  );
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Summary", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  y = addWrapped(
    doc,
    `Rooms: ${results.summary.totalRooms}\nCircuits (base): ${results.summary.totalCircuitsEstimated}\nCircuits (+25% growth): ${results.summary.circuitsWithGrowth}\nPanel (est.): ${results.summary.recommendedPanelAmps}A, ${results.summary.recommendedPanelSpaces}-space\nService (est.): ${results.summary.recommendedServiceAmps}A\nWire footage (est.): ${results.summary.estimatedWireFootageLf} LF\nLoad (illustrative): ${Math.round(results.summary.loadCalcTotalVa)} VA, ~${results.summary.loadCalcRequiredAmps}A @ 240V`,
    margin,
    y,
    maxW,
    13,
    pageH,
    margin,
  );
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Circuit schedule (excerpt)", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const rows = results.circuitSchedule.slice(0, 35);
  for (const r of rows) {
    const line = `${r.circuit}. ${r.description} — ${r.room} | ${r.amps}A | ${r.wire} | GFCI:${r.gfci ? "Y" : "N"} AFCI:${r.afci ? "Y" : "N"}`;
    y = addWrapped(doc, line, margin, y, maxW, 12, pageH, margin);
  }
  if (results.circuitSchedule.length > 35) {
    y = addWrapped(
      doc,
      `… ${results.circuitSchedule.length - 35} additional circuits (export CSV for full list).`,
      margin,
      y,
      maxW,
      12,
      pageH,
      margin,
    );
  }

  doc.addPage();
  y = margin;
  doc.setFont("helvetica", "bold");
  doc.text("NEC compliance checklist (auto)", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  for (const c of results.compliance) {
    const sym =
      c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : c.status === "warn" ? "!" : "i";
    y = addWrapped(doc, `${sym} ${c.text}`, margin, y, maxW, 13, pageH, margin);
  }

  doc.save(
    `electrical-plan-${(input.setup.projectName || "project").replace(/\s+/g, "-").slice(0, 40)}.pdf`,
  );
}

export async function downloadElectricalPanelSchedulePdf(
  input: ElectricalInputs,
  results: ElectricalResults,
): Promise<void> {
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;

  let y = drawTppPdfLetterhead(doc, margin, margin + 8, logo, {
    logoWidthPt: 52,
    pageWidth: pageW,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Panel schedule (illustrative)", margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const mid = pageW / 2;
  const left = results.panelSchedule.filter((_, i) => i % 2 === 0);
  const right = results.panelSchedule.filter((_, i) => i % 2 === 1);
  const maxRows = Math.max(left.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
    }
    const L = left[i];
    const R = right[i];
    if (L) {
      doc.setTextColor(30, 30, 120);
      doc.text(`${L.position}. ${L.label}`, margin, y);
    }
    if (R) {
      doc.setTextColor(30, 30, 120);
      doc.text(`${R.position}. ${R.label}`, mid + 10, y);
    }
    doc.setTextColor(0, 0, 0);
    y += 12;
  }

  doc.save(
    `electrical-panel-${(input.setup.projectName || "project").replace(/\s+/g, "-").slice(0, 40)}.pdf`,
  );
}

export async function downloadElectricalWorkOrderPdf(
  input: ElectricalInputs,
  results: ElectricalResults,
  docNo: string,
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
  const body = buildElectricalWorkOrderText(input, results, docNo);
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  y = addWrapped(doc, body, margin, y, maxW, 11, pageH, margin);
  doc.save(`electrical-work-order-${docNo}.pdf`);
}

export async function downloadElectricalProposalPdf(
  input: ElectricalInputs,
  results: ElectricalResults,
  docNo: string,
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
  const body = buildElectricalProposalText(input, results, docNo);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = addWrapped(doc, body, margin, y, maxW, 14, pageH, margin);
  doc.save(`electrical-proposal-${docNo}.pdf`);
}
