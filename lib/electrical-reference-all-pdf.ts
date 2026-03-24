"use client";

import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import { AMPACITY_CHEAT, CONDUIT_FILL_CHEAT_EMT, STANDARD_BREAKERS } from "@/lib/electrical-reference-engine";

const SHEETS: { title: string; lines: string[] }[] = [
  {
    title: "Wire ampacity cheat (Table 310.12 style)",
    lines: [
      "AWG | Cu 60°C | Cu 75°C | Cu 90°C | Al 75°C",
      ...Object.entries(AMPACITY_CHEAT).map(
        ([k, v]) =>
          `${k} | ${v.cu60}A | ${v.cu75}A | ${v.cu90}A | ${v.al75 == null ? "--" : `${v.al75}A`}`,
      ),
    ],
  },
  {
    title: "Conduit fill cheat — THHN in EMT",
    lines: Object.entries(CONDUIT_FILL_CHEAT_EMT).flatMap(([g, m]) => [
      g,
      ...Object.entries(m).map(([sz, n]) => `  ${sz}: ${n} max`),
    ]),
  },
  {
    title: "Standard breaker sizes",
    lines: [STANDARD_BREAKERS.join(", ") + " A"],
  },
  {
    title: "Circuit wire sizes (typical Cu branch)",
    lines: [
      "15 A = 14 AWG min",
      "20 A = 12 AWG min",
      "30 A = 10 AWG min",
      "40 A = 8 AWG min",
      "50–60 A = 6 AWG min",
      "70 A = 4 AWG min",
      "100 A = 1 AWG",
      "125 A = 1/0 AWG",
      "150 A = 2/0 AWG",
      "200 A = 3/0 AWG",
      "400 A = 600 kcmil Cu parallel (engineering)",
    ],
  },
  {
    title: "Derating — conductor count",
    lines: [
      "4–6: ×0.80",
      "7–9: ×0.70",
      "10–20: ×0.50",
      "21–30: ×0.45",
      "NEC 310.15(C)(1)",
    ],
  },
  {
    title: "Temperature correction (Cu, ref.)",
    lines: [
      "86°F: 1.00",
      "95°F: 0.94",
      "104°F: 0.88",
      "113°F: 0.82",
      "122°F: 0.75",
      "131°F: 0.67",
      "140°F: 0.58",
      "NEC 310.15(B)(1)",
    ],
  },
  {
    title: "Motor circuit (NEC 430 summary)",
    lines: [
      "Min conductor: FLA × 125%",
      "Inverse-time breaker max: FLA × 250%",
      "Dual-element fuse max: FLA × 175%",
      "Overload: 115–125% FLA per 430.32",
    ],
  },
  {
    title: "Equipment GEC (Table 250.122 ref.)",
    lines: [
      "15–20 A: 14 Cu",
      "30–60 A: 10 Cu",
      "100 A: 8 Cu",
      "200 A: 6 Cu",
      "300 A: 4 Cu",
      "400 A: 3 Cu",
      "500 A: 2 Cu",
      "600 A: 1 Cu",
      "800 A: 1/0 Cu",
      "1000 A: 2/0 Cu",
      "1200 A: 3/0 Cu",
    ],
  },
  {
    title: "Box fill (314.16)",
    lines: [
      "#14: 2.00 in³ / conductor",
      "#12: 2.25",
      "#10: 2.50",
      "#8: 3.00",
      "#6: 5.00",
      "Count: each conductor + devices ×2 + largest ground + clamps",
    ],
  },
];

export async function downloadElectricalReferenceSheetsPdf() {
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();

  for (let i = 0; i < SHEETS.length; i++) {
    if (i > 0) doc.addPage();
    let y = drawTppPdfLetterhead(doc, margin, 36, logo);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 40, 60);
    doc.text(SHEETS[i]!.title, margin, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const line of SHEETS[i]!.lines) {
      if (y > 720) {
        doc.addPage();
        y = margin;
      }
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 11 + 2;
    }
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "TPP Electric — field reference only. Verify NEC edition with AHJ.",
      margin,
      doc.internal.pageSize.getHeight() - 32,
    );
    doc.text(`Printed ${new Date().toLocaleString()}`, margin, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save("tpp-electric-reference-sheets.pdf");
}
