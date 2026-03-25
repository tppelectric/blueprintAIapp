import { jsPDF } from "jspdf";

/**
 * Single-page–friendly quick reference PDF (client-side jsPDF).
 */
export function downloadQuickReferencePdf(params: {
  title: string;
  lines: string[];
  footerNote?: string;
  fileSlug: string;
}): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(168, 132, 22);
  doc.text("TPP Electric — Reference Library", margin, y);
  y += 28;

  doc.setTextColor(10, 22, 40);
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(params.title, maxW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 18 + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);

  for (const line of params.lines) {
    const wrapped = doc.splitTextToSize(line, maxW);
    const blockH = wrapped.length * 15 + 4;
    if (y + blockH > pageH - 72) {
      doc.addPage();
      y = 48;
    }
    doc.text(wrapped, margin, y);
    y += blockH;
  }

  if (params.footerNote) {
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const fw = doc.splitTextToSize(params.footerNote, maxW);
    for (let i = 0; i < fw.length; i++) {
      if (y + 14 > pageH - 48) {
        doc.addPage();
        y = 48;
      }
      doc.text(fw[i] ?? "", margin, y);
      y += 13;
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Printed ${new Date().toLocaleString()}`, margin, pageH - 28);

  const safe = params.fileSlug.replace(/[^a-z0-9-]+/gi, "-").slice(0, 80);
  doc.save(`${safe || "reference-card"}.pdf`);
}
