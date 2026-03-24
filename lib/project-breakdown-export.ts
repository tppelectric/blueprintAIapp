import { jsPDF } from "jspdf";
import { drawTppPdfLetterhead, fetchTppLogoDataUrl } from "@/lib/tpp-pdf-header";
import {
  grandTotals,
  laborLineCost,
  laborLineCustomerPrice,
  laborLineProfit,
  materialLineCustomerPrice,
  materialLineMarkupPct,
  materialLineProfit,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { formatMoneyCell } from "@/lib/wifi-project-cost";

const TPP_TAG = "TPP Electrical Contractors Inc. · Est. 1982";

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildProjectBreakdownCsv(
  state: ProjectBreakdownState,
  projectTitle: string,
): string {
  const g = grandTotals(state);
  const lines: string[] = [];
  lines.push(`Project,${csvEscape(projectTitle)}`);
  lines.push("");
  lines.push(
    "MATERIALS,Description,Qty,Unit,Unit Cost,Markup%,Customer Price,Profit",
  );
  for (const m of state.materials) {
    const mk = materialLineMarkupPct(m, state.materialMarkupPct);
    lines.push(
      [
        "",
        csvEscape(m.description),
        String(m.qty),
        csvEscape(m.unit),
        String(m.unitCost),
        String(mk),
        String(materialLineCustomerPrice(m, state.materialMarkupPct)),
        String(materialLineProfit(m, state.materialMarkupPct)),
      ].join(","),
    );
  }
  lines.push(
    `MATERIALS TOTAL,,,,,${formatMoneyCell(g.materials.cost)},${formatMoneyCell(g.materials.customerPrice)},${formatMoneyCell(g.materials.profit)}`,
  );
  lines.push("");
  lines.push(
    "LABOR,Task,Hours,Techs,Rate/hr,Cost,Customer Price,Profit",
  );
  for (const L of state.labor) {
    const techs = L.techs ?? state.technicianCount;
    const rate = L.ratePerHour ?? state.laborRatePerHour;
    lines.push(
      [
        "",
        csvEscape(L.task),
        String(L.hours),
        String(techs),
        String(rate),
        String(laborLineCost(L, state.technicianCount, state.laborRatePerHour)),
        String(laborLineCustomerPrice(L, state)),
        String(laborLineProfit(L, state)),
      ].join(","),
    );
  }
  lines.push(
    `LABOR TOTAL,,,,,${formatMoneyCell(g.labor.cost)},${formatMoneyCell(g.labor.customerPrice)},${formatMoneyCell(g.labor.profit)}`,
  );
  lines.push("");
  lines.push("");
  lines.push("SUMMARY (materials tax on sell after markup only)");
  lines.push(
    `Materials after markup,${formatMoneyCell(g.materialsCustomerAfterMarkup)}`,
  );
  lines.push(
    `Sales tax (${state.salesTaxPct}%),${formatMoneyCell(g.materialsTaxAmount)}`,
  );
  lines.push(
    `Materials with tax,${formatMoneyCell(g.materialsWithTaxCustomer)}`,
  );
  lines.push(`Labor customer price,${formatMoneyCell(g.laborCustomerPrice)}`);
  lines.push(`TOTAL customer,${formatMoneyCell(g.grandCustomer)}`);
  lines.push(`Total cost basis,${formatMoneyCell(g.totalCostBasis)}`);
  lines.push(`Total profit,${formatMoneyCell(g.totalProfit)}`);
  lines.push(`Overall margin %,${g.overallMarginPct}`);
  return lines.join("\n");
}

export async function downloadProjectBreakdownPdf(
  state: ProjectBreakdownState,
  projectTitle: string,
): Promise<void> {
  const logo = await fetchTppLogoDataUrl();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = drawTppPdfLetterhead(doc, margin, margin + 6, logo, {
    logoWidthPt: 48,
    pageWidth: pageW,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Project Breakdown", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 100, 40);
  doc.text(TPP_TAG, margin, y);
  y += 14;
  doc.setTextColor(50, 50, 50);
  doc.text(`Project: ${projectTitle}`, margin, y);
  y += 20;
  doc.setTextColor(0, 0, 0);

  const ensure = (need: number) => {
    if (y + need > pageH - 56) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Global: material markup %, techs, labor $/hr, labor markup %", margin, y);
  y += 12;
  doc.setFont("normal");
  doc.setFontSize(8);
  doc.text(
    `${state.materialMarkupPct}% material · ${state.technicianCount} tech(s) · $${state.laborRatePerHour}/hr labor · ${state.laborMarkupPct}% labor markup · ${state.salesTaxPct}% tax`,
    margin,
    y,
  );
  y += 16;

  doc.setFont("bold");
  doc.text("Materials", margin, y);
  y += 10;
  doc.setFontSize(7);
  const mx = [margin, margin + 120, margin + 150, margin + 175, margin + 210, margin + 250, margin + 300, margin + 360];
  ensure(40);
  doc.text("Description", mx[0], y);
  doc.text("Qty", mx[1], y);
  doc.text("Unit", mx[2], y);
  doc.text("U.Cost", mx[3], y, { align: "right" });
  doc.text("Mk%", mx[4], y, { align: "right" });
  doc.text("Sell", mx[5], y, { align: "right" });
  doc.text("Profit", mx[6], y, { align: "right" });
  y += 10;
  doc.setFont("helvetica", "normal");
  for (const m of state.materials) {
    ensure(22);
    const mk = materialLineMarkupPct(m, state.materialMarkupPct);
    const lines = doc.splitTextToSize(m.description, mx[1] - mx[0] - 4);
    doc.text(lines, mx[0], y + 8);
    doc.text(String(m.qty), mx[1], y + 8);
    doc.text(m.unit, mx[2], y + 8);
    doc.text(formatMoneyCell(m.unitCost), mx[3], y + 8, { align: "right" });
    doc.text(`${mk}%`, mx[4], y + 8, { align: "right" });
    doc.text(
      formatMoneyCell(materialLineCustomerPrice(m, state.materialMarkupPct)),
      mx[5],
      y + 8,
      { align: "right" },
    );
    doc.text(
      formatMoneyCell(materialLineProfit(m, state.materialMarkupPct)),
      mx[6],
      y + 8,
      { align: "right" },
    );
    y += Math.max(14, lines.length * 9 + 4);
  }
  const g = grandTotals(state);
  y += 4;
  doc.setFont("bold");
  doc.text("Materials subtotal", mx[0], y);
  doc.text(formatMoneyCell(g.materials.cost), mx[3], y, { align: "right" });
  doc.text(formatMoneyCell(g.materials.customerPrice), mx[5], y, {
    align: "right",
  });
  doc.text(formatMoneyCell(g.materials.profit), mx[6], y, { align: "right" });
  y += 18;

  doc.text("Labor", margin, y);
  y += 10;
  doc.setFontSize(7);
  const lx = [margin, margin + 200, margin + 230, margin + 255, margin + 285, margin + 330, margin + 380, margin + 430];
  doc.text("Task", lx[0], y);
  doc.text("Hrs", lx[1], y);
  doc.text("Tech", lx[2], y);
  doc.text("Rate", lx[3], y, { align: "right" });
  doc.text("Cost", lx[4], y, { align: "right" });
  doc.text("Sell", lx[5], y, { align: "right" });
  doc.text("Profit", lx[6], y, { align: "right" });
  y += 10;
  doc.setFont("helvetica", "normal");
  for (const L of state.labor) {
    ensure(20);
    const techs = L.techs ?? state.technicianCount;
    const rate = L.ratePerHour ?? state.laborRatePerHour;
    const tlines = doc.splitTextToSize(L.task, lx[1] - lx[0] - 4);
    doc.text(tlines, lx[0], y + 8);
    doc.text(String(L.hours), lx[1], y + 8);
    doc.text(String(techs), lx[2], y + 8);
    doc.text(formatMoneyCell(rate), lx[3], y + 8, { align: "right" });
    doc.text(
      formatMoneyCell(laborLineCost(L, state.technicianCount, state.laborRatePerHour)),
      lx[4],
      y + 8,
      { align: "right" },
    );
    doc.text(formatMoneyCell(laborLineCustomerPrice(L, state)), lx[5], y + 8, {
      align: "right",
    });
    doc.text(formatMoneyCell(laborLineProfit(L, state)), lx[6], y + 8, {
      align: "right",
    });
    y += Math.max(14, tlines.length * 9 + 4);
  }
  y += 4;
  doc.setFont("bold");
  doc.text("Labor subtotal", lx[0], y);
  doc.text(formatMoneyCell(g.labor.cost), lx[4], y, { align: "right" });
  doc.text(formatMoneyCell(g.labor.customerPrice), lx[5], y, {
    align: "right",
  });
  doc.text(formatMoneyCell(g.labor.profit), lx[6], y, { align: "right" });
  y += 22;

  ensure(80);
  doc.setFontSize(9);
  doc.text("Totals", margin, y);
  y += 12;
  doc.setFontSize(8);
  doc.text(
    `Materials  · Cost ${formatMoneyCell(g.materials.cost)} · Markup ${formatMoneyCell(g.materials.markupDollars)} · Price ${formatMoneyCell(g.materials.customerPrice)} · Profit ${formatMoneyCell(g.materials.profit)}`,
    margin,
    y,
  );
  y += 12;
  doc.text(
    `Labor  · Cost ${formatMoneyCell(g.labor.cost)} · Markup ${formatMoneyCell(g.labor.markupDollars)} · Price ${formatMoneyCell(g.labor.customerPrice)} · Profit ${formatMoneyCell(g.labor.profit)}`,
    margin,
    y,
  );
  y += 14;
  doc.setFont("bold");
  doc.text(
    `Sell subtotal  · Materials after markup ${formatMoneyCell(g.materialsCustomerAfterMarkup)} · Tax (${state.salesTaxPct}%) ${formatMoneyCell(g.materialsTaxAmount)} · Materials w/ tax ${formatMoneyCell(g.materialsWithTaxCustomer)} · Labor ${formatMoneyCell(g.laborCustomerPrice)}`,
    margin,
    y,
  );
  y += 12;
  doc.text(
    `TOTAL ${formatMoneyCell(g.grandCustomer)} · Your cost ${formatMoneyCell(g.totalCostBasis)} · Profit ${formatMoneyCell(g.totalProfit)} · Margin ${g.overallMarginPct}%`,
    margin,
    y,
  );
  y += 14;
  doc.setFont("normal");
  doc.text(
    `Cost basis vs customer total: ${formatMoneyCell(g.totalLow)} – ${formatMoneyCell(g.totalHigh)}`,
    margin,
    y,
  );

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "Blueprint AI — Project Breakdown",
      margin,
      pageH - 28,
    );
    doc.setTextColor(0, 0, 0);
  }

  const safe =
    projectTitle
      .slice(0, 36)
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "project-breakdown";
  doc.save(`project-breakdown-${safe}.pdf`);
}
