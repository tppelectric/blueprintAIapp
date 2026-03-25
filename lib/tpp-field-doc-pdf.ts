import type { jsPDF } from "jspdf";

const CHECKBOX_CHAR = "\u2610";

function leadingSpaceCount(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * Renders field work order text with drawn ☐ boxes. `titleMarker` must appear
 * on the document title line (e.g. "Wi-Fi", "Audio/Video", "Smart Home").
 */
export function addWorkOrderPdfLines(
  doc: jsPDF,
  lines: string[],
  margin: number,
  maxW: number,
  pageH: number,
  startY: number,
  lineHeight: number,
  titleMarker: string,
): number {
  let y = startY;
  const box = 9;
  const spaceW = 3.15;

  for (const raw of lines) {
    if (raw.trim() === "") {
      y += lineHeight * 0.5;
      continue;
    }

    const leadSpaces = leadingSpaceCount(raw);
    const xBase = margin + leadSpaces * spaceW;
    const trimmedLeft = raw.trimStart();
    const isCheckbox = trimmedLeft.startsWith(CHECKBOX_CHAR);

    if (isCheckbox) {
      const label = trimmedLeft.slice(CHECKBOX_CHAR.length).trim();
      doc.setDrawColor(32, 32, 32);
      doc.setLineWidth(0.75);
      if (y > pageH - 88) {
        doc.addPage();
        y = margin;
      }
      doc.rect(xBase, y - box + 3, box, box);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(28, 28, 28);
      const textW = margin + maxW - xBase - box - 10;
      const parts = doc.splitTextToSize(label, Math.max(100, textW));
      for (let i = 0; i < parts.length; i++) {
        if (y > pageH - 88) {
          doc.addPage();
          y = margin;
        }
        doc.text(parts[i], xBase + box + 5, y);
        y += lineHeight;
      }
      continue;
    }

    if (y > pageH - 88) {
      doc.addPage();
      y = margin;
    }

    const t = raw.trim();
    const isRule = t.includes("━");
    const hasUnderscoreFill = /_{3,}/.test(t);
    const isDocTitle =
      t.includes("FIELD WORK ORDER") && t.includes(titleMarker);
    const isCompany = t === "TPP ELECTRICAL CONTRACTORS INC.";
    const isEstSubtitle =
      t.includes("EST. 1982") && t.includes("Licensed Electrical Contractor");
    const isSection =
      !hasUnderscoreFill &&
      t.length > 6 &&
      t.length < 92 &&
      /^[A-Z0-9][A-Z0-9\s—\-/&:]+:$/.test(t);

    doc.setTextColor(30, 30, 30);
    if (isRule) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
    } else if (isDocTitle) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      y += 3;
    } else if (isCompany) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
    } else if (isEstSubtitle) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
    } else if (isSection) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      y += 5;
    } else if (t.startsWith("[")) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(75, 75, 75);
    } else if (
      t.startsWith("Room:") ||
      t.startsWith("Zone:") ||
      t.startsWith("Cable run:")
    ) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(38, 38, 38);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    const split = doc.splitTextToSize(raw.trim(), maxW - (xBase - margin));
    for (const part of split) {
      if (y > pageH - 88) {
        doc.addPage();
        y = margin;
      }
      doc.text(part, xBase, y);
      y += lineHeight;
    }
  }

  return y;
}

/** Client proposal PDF body. `titleMarker` appears in the Installation Proposal title line. */
export function addProposalPdfLines(
  doc: jsPDF,
  lines: string[],
  margin: number,
  maxW: number,
  pageH: number,
  startY: number,
  lineHeight: number,
  titleMarker: string,
): number {
  let y = startY;

  for (const raw of lines) {
    if (raw.trim() === "") {
      y += lineHeight * 0.5;
      continue;
    }

    if (y > pageH - 88) {
      doc.addPage();
      y = margin;
    }

    const t = raw.trim();
    const isRule = t.includes("━");
    const isDocTitle =
      t.includes("Installation Proposal") &&
      t.includes(titleMarker) &&
      !t.startsWith("Proposal #");
    const isSection =
      /^[A-Z][A-Z\s/&',+0-9-]+:$/.test(t) && t.length < 64 && !t.startsWith("DATE");

    doc.setTextColor(30, 30, 30);
    if (isRule) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
    } else if (isDocTitle || t === "EST. 1982") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(isDocTitle ? 13 : 10);
    } else if (isSection) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      y += 4;
    } else if (t.startsWith("[")) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(70, 70, 70);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    const split = doc.splitTextToSize(raw.trim(), maxW);
    for (const part of split) {
      if (y > pageH - 88) {
        doc.addPage();
        y = margin;
      }
      doc.text(part, margin, y);
      y += lineHeight;
    }
  }

  return y;
}

export function drawTppFieldDocFooter(doc: jsPDF, margin: number, pageH: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text("TPP Electrical Contractors Inc.", margin, pageH - 52);
  doc.text("Licensed Electrical Contractor · EST. 1982", margin, pageH - 40);
  doc.text("blueprint-a-iapp.vercel.app", margin, pageH - 28);
}
