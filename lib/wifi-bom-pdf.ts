import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import type { WifiAnalyzerInputs, WifiAnalyzerResults } from "@/lib/wifi-analyzer-engine";
import {
  buildProjectCostSummary,
  formatMoneyCell,
  formatUsd,
  type ProjectCostSummary,
} from "@/lib/wifi-project-cost";
import { vendorDisplayName } from "@/lib/wifi-field-documents";

const TPP_TAG = "TPP Electrical Contractors Inc. · Est. 1982";

export async function downloadWifiBomPdf(
  inputs: WifiAnalyzerInputs,
  results: WifiAnalyzerResults,
  laborRatePerHour: number,
): Promise<void> {
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  const summary = buildProjectCostSummary(results, laborRatePerHour);

  let y = drawTppPdfLetterhead(doc, margin, margin + 8, logo, {
    logoWidthPt: 52,
    pageWidth: pageW,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(25, 25, 25);
  doc.text("Bill of Materials — Wi‑Fi Project", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 100, 40);
  doc.text(TPP_TAG, margin, y);
  y += 16;
  doc.setTextColor(60, 60, 60);
  doc.text(`Project: ${inputs.projectName || "—"}`, margin, y);
  y += 11;
  if (inputs.clientName?.trim()) {
    doc.text(`Client: ${inputs.clientName.trim()}`, margin, y);
    y += 11;
  }
  doc.text(`Vendor: ${vendorDisplayName(inputs.vendor)}`, margin, y);
  y += 11;
  doc.text(
    `Rooms: ${results.totalRooms} · Indoor sq ft: ${results.totalIndoorSqFt} · APs: ${results.recommendedAps}`,
    margin,
    y,
  );
  y += 18;
  doc.setTextColor(0, 0, 0);

  const x0 = margin;
  const x1 = margin + 168;
  const x2 = margin + 208;
  const x3 = margin + 248;
  const x4 = margin + 318;
  const rowH = 16;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - 72) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("MATERIALS", margin, y);
  y += 12;
  doc.setFontSize(7);
  doc.setFillColor(255, 248, 220);
  doc.rect(margin, y - 2, pageW - margin * 2, 14, "F");
  doc.setTextColor(90, 70, 20);
  doc.text("Item", x0 + 2, y + 8);
  doc.text("Qty", x2 - 8, y + 8, { align: "right" });
  doc.text("Unit", x2 + 18, y + 8, { align: "center" });
  doc.text("Unit cost", x3 + 28, y + 8, { align: "right" });
  doc.text("Total", x4 + 38, y + 8, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 16;
  doc.setFont("helvetica", "normal");

  for (const row of summary.materialRows) {
    ensureSpace(28);
    const itemLines = doc.splitTextToSize(row.item, x1 - x0 - 6);
    const h = Math.max(rowH, itemLines.length * 10 + 6);
    doc.text(itemLines, x0 + 2, y + 10);
    doc.text(String(row.qty), x2 - 8, y + 10, { align: "right" });
    doc.text(row.unit, x2 + 18, y + 10, { align: "center" });
    doc.text(formatMoneyCell(row.unitCost), x3 + 28, y + 10, {
      align: "right",
    });
    doc.text(formatMoneyCell(row.total), x4 + 38, y + 10, {
      align: "right",
    });
    y += h;
  }

  y += 4;
  doc.setDrawColor(200, 180, 100);
  doc.line(margin, y, pageW - margin, y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Material subtotal:", x3, y);
  doc.text(formatMoneyCell(results.materialSubtotalMid ?? 0), x4 + 38, y, {
    align: "right",
  });
  y += 22;

  ensureSpace(120);
  doc.text("LABOR", margin, y);
  y += 12;
  doc.setFontSize(7);
  doc.setFillColor(255, 248, 220);
  doc.rect(margin, y - 2, pageW - margin * 2, 14, "F");
  doc.setTextColor(90, 70, 20);
  doc.text("Task", x0 + 2, y + 8);
  doc.text("Hours", x2 + 10, y + 8, { align: "right" });
  doc.text("Rate", x3 + 28, y + 8, { align: "right" });
  doc.text("Cost", x4 + 38, y + 8, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 16;
  doc.setFont("helvetica", "normal");

  for (const L of summary.laborLines) {
    ensureSpace(22);
    const taskLines = doc.splitTextToSize(L.taskLabel, x1 - x0 - 6);
    doc.text(taskLines, x0 + 2, y + 10);
    doc.text(`${L.hours}`, x2 + 10, y + 10, { align: "right" });
    doc.text(`${formatMoneyCell(L.rate)}/hr`, x3 + 28, y + 10, {
      align: "right",
    });
    doc.text(formatMoneyCell(L.lineTotal), x4 + 38, y + 10, {
      align: "right",
    });
    y += Math.max(rowH, taskLines.length * 10 + 6);
  }

  y += 4;
  doc.line(margin, y, pageW - margin, y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text(
    `Labor subtotal (${summary.totalLaborHours} hrs):`,
    x3,
    y,
  );
  doc.text(formatMoneyCell(summary.laborSubtotal), x4 + 38, y, {
    align: "right",
  });
  y += 20;

  doc.setFontSize(10);
  doc.text("Materials (mid):", margin, y);
  doc.text(formatMoneyCell(summary.materialSubtotalMid), pageW - margin, y, {
    align: "right",
  });
  y += 14;
  doc.text("Labor:", margin, y);
  doc.text(formatMoneyCell(summary.laborSubtotal), pageW - margin, y, {
    align: "right",
  });
  y += 16;
  doc.line(margin, y, pageW - margin, y);
  y += 14;
  doc.setFontSize(11);
  doc.text("Total estimate:", margin, y);
  doc.text(
    `${formatUsd(summary.totalLow)} – ${formatUsd(summary.totalHigh)}`,
    pageW - margin,
    y,
    { align: "right" },
  );
  y += 20;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  const foot = doc.splitTextToSize(
    `${TPP_TAG} — Planning / takeoff document only. Not to scale. MSRP-style materials; confirm dealer pricing on site.`,
    pageW - margin * 2,
  );
  doc.text(foot, margin, y);

  doc.save(
    `wifi-bom-${(inputs.projectName || "export").replace(/\s+/g, "-")}.pdf`,
  );
}

export function buildWifiBomCsv(
  inputs: WifiAnalyzerInputs,
  results: WifiAnalyzerResults,
  summary: ProjectCostSummary,
): string {
  const lines: string[] = [
    "TPP Electrical Contractors Inc. — Wi-Fi Bill of Materials",
    "TPP Electrical Contractors Inc. · Est. 1982 — Licensed electrical contractor",
    `Project,${csvCell(inputs.projectName)}`,
    `Client,${csvCell(inputs.clientName || "")}`,
    `Vendor,${csvCell(vendorDisplayName(inputs.vendor))}`,
    "",
    "MATERIALS",
    "Item,Qty,Unit,Unit cost,Total",
  ];
  for (const row of summary.materialRows) {
    lines.push(
      [
        csvCell(row.item),
        row.qty,
        csvCell(row.unit),
        row.unitCost,
        row.total,
      ].join(","),
    );
  }
  lines.push("", `Material subtotal,,,,${results.materialSubtotalMid ?? 0}`);
  lines.push("", "LABOR", "Task,Hours,Rate ($/hr),Cost ($)");
  for (const L of summary.laborLines) {
    lines.push(
      [csvCell(L.taskLabel), L.hours, L.rate, L.lineTotal].join(","),
    );
  }
  lines.push(
    "",
    `Labor subtotal (${summary.totalLaborHours} total hours),,,${summary.laborSubtotal}`,
    "",
    "TOTALS",
    `Materials (mid estimate),,,${summary.materialSubtotalMid}`,
    `Labor (at your rate),,,${summary.laborSubtotal}`,
    `Total estimate low,,,${summary.totalLow}`,
    `Total estimate high,,,${summary.totalHigh}`,
  );
  return lines.join("\r\n");
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
