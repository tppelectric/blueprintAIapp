"use client";

import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import { buildServiceDesign, type ServiceDesignInput } from "@/lib/load-calc-service-design";
import type { ResidentialResults, CommercialResults } from "@/lib/load-calc-engine";

function disclaimerBlock(doc: jsPDF, y: number, margin: number, pageW: number): number {
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const t =
    "For estimation and education only. Not a substitute for licensed design. Verify all values with NEC in force and AHJ.";
  const lines = doc.splitTextToSize(t, pageW - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 4 + 6;
}

export async function downloadLoadCalcServicePackagePdf(opts: {
  projectName: string;
  tab: "residential" | "commercial";
  inputs: ServiceDesignInput;
  results: ResidentialResults | CommercialResults;
  breakdown: { label: string; va: number }[];
}) {
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  let y = drawTppPdfLetterhead(doc, margin, 36, logo);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 40, 60);
  doc.text("Service design package — load calculation", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Project: ${opts.projectName || "—"}`, margin, y);
  y += 14;
  doc.text(`Mode: ${opts.tab}`, margin, y);
  y += 14;
  doc.text(`Recommended service: ${opts.inputs.recommendedAmps} A`, margin, y);
  y += 20;

  y = disclaimerBlock(doc, y, margin, pageW);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Load worksheet (summary)", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const row of opts.breakdown.slice(0, 24)) {
    if (y > 720) {
      doc.addPage();
      y = margin;
    }
    doc.text(`${row.label}: ${row.va.toLocaleString()} VA`, margin, y);
    y += 12;
  }
  y += 8;
  doc.text(
    `Total VA: ${opts.results.totalVa.toLocaleString()} · Required A @ 240V: ${opts.results.requiredAmps}`,
    margin,
    y,
  );
  y += 24;

  const sd = buildServiceDesign(opts.inputs);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Service entrance conductors", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const seLines = [
    `Phase: ${sd.serviceEntrance.phaseConductors}`,
    `Neutral: ${sd.serviceEntrance.neutralConductor}`,
    `GEC: ${sd.serviceEntrance.gec} (${sd.serviceEntrance.gecNec})`,
    `Conduit: ${sd.serviceEntrance.conduit}`,
    `Refs: ${sd.serviceEntrance.necRefs.join("; ")}`,
  ];
  for (const line of seLines) {
    if (y > 720) {
      doc.addPage();
      y = margin;
    }
    doc.text(doc.splitTextToSize(line, pageW - margin * 2), margin, y);
    y += 14;
  }
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Meter / main / panel", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.text(`Meter: ${sd.meterSocket.recommended}`, margin, y);
  y += 12;
  doc.text(`Main: ${sd.mainDisconnect.recommendedPanel}`, margin, y);
  y += 12;
  doc.text(`Panel: ${sd.panel.suggestion}`, margin, y);
  y += 20;

  if (sd.evL1) {
    doc.setFont("helvetica", "bold");
    doc.text("EV — Level 1", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    for (const l of sd.evL1.lines) {
      doc.text(l, margin, y);
      y += 12;
    }
    y += 8;
  }
  if (sd.evL2) {
    doc.setFont("helvetica", "bold");
    doc.text("EV — Level 2", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    for (const l of sd.evL2.lines) {
      doc.text(l, margin, y);
      y += 12;
    }
    y += 8;
  }
  if (sd.subpanel) {
    doc.setFont("helvetica", "bold");
    doc.text("Subpanel (garage / outbuilding)", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(sd.subpanel.recommended, margin, y);
    y += 12;
    doc.text(`Feeder: ${sd.subpanel.feederWire}`, margin, y);
    y += 12;
    doc.text(`Conduit: ${sd.subpanel.feederConduit} · Breaker: ${sd.subpanel.feederBreaker}`, margin, y);
    y += 16;
  }
  if (sd.generator) {
    doc.setFont("helvetica", "bold");
    doc.text("Generator", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(
      `Min ~${sd.generator.minKw} kW · Recommended ~${sd.generator.recommendedKw} kW · Transfer ${sd.generator.transferSwitchAmps} A class`,
      margin,
      y,
    );
    y += 16;
  }
  if (sd.solarReady) {
    doc.setFont("helvetica", "bold");
    doc.text("Solar-ready notes", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    for (const l of sd.solarReady) {
      doc.text(doc.splitTextToSize(l, pageW - margin * 2), margin, y);
      y += 12;
    }
  }

  const footY = doc.internal.pageSize.getHeight() - 28;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Printed ${new Date().toLocaleString()}`, margin, footY);

  doc.save(
    `tpp-service-design-${(opts.projectName || "load-calc").replace(/\s+/g, "-").slice(0, 40)}.pdf`,
  );
}
