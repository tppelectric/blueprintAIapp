import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ALL_CHECKLIST_ITEMS } from "@/lib/nec-checker-data";

const BRAND = "TPP Electric";
const FOOTER = "TPP Electric | blueprint-a-iapp.vercel.app";

export function downloadNecChecklistPdf(opts: {
  projectName: string;
  jurisdiction: string;
  permitDate: string;
  necEdition: string;
  occupancyType: string;
  constructionType: string;
  answers: Record<string, boolean | undefined>;
}): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(BRAND, margin, 56);
  doc.setFontSize(14);
  doc.text("NEC Code Checklist Report", margin, 80);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Project: ${opts.projectName || "—"}`, margin, 102);
  doc.text(`Jurisdiction: ${opts.jurisdiction}`, margin, 118);
  doc.text(`Permit date: ${opts.permitDate || "—"}`, margin, 134);
  doc.text(`NEC edition used: ${opts.necEdition}`, margin, 150);
  doc.text(`Occupancy: ${opts.occupancyType}`, margin, 166);
  doc.text(`Construction: ${opts.constructionType}`, margin, 182);

  const body: string[][] = [];
  for (const item of ALL_CHECKLIST_ITEMS) {
    const a = opts.answers[item.id];
    const status =
      a === true ? "PASS" : a === false ? "FAIL" : "—";
    body.push([item.necRef, item.label, status, item.resolution]);
  }

  autoTable(doc, {
    startY: 200,
    head: [["NEC ref", "Item", "Result", "If failing — resolution"]],
    body,
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 4 },
    headStyles: { fillColor: [15, 35, 60] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 150 },
      2: { cellWidth: 36 },
      3: { cellWidth: 200 },
    },
  });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(FOOTER, margin, pageH - 22);
    doc.text(`Page ${i} of ${n}`, pageW - margin - 60, pageH - 22);
    doc.setTextColor(0, 0, 0);
  }

  const safe = (opts.projectName || "checklist").replace(/[^\w\- ]+/g, "").trim() || "nec-checklist";
  doc.save(`nec-checklist-${safe}.pdf`);
}
