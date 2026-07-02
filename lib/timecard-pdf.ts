import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { TimesheetRow } from "@/lib/time-management-types";
import { num } from "@/lib/time-calendar-helpers";
import { drawTppPdfLetterhead } from "@/lib/tpp-pdf-header";
import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function lastTableBottom(doc: jsPDF): number {
  const t = (doc as DocWithTable).lastAutoTable;
  return typeof t?.finalY === "number" ? t.finalY + 16 : 120;
}

function loadLogoDataUrlFromDisk(): string | null {
  const rel = TPP_LOGO_PATH.replace(/^\//, "");
  const p = join(process.cwd(), "public", rel);
  if (!existsSync(p)) return null;
  try {
    const buf = readFileSync(p);
    const lower = rel.toLowerCase();
    const mime = lower.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function fmtHours(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Payroll time cards: one table per employee for the pay period, with per-employee
 * subtotals and a grand total. Built with the same jsPDF + TPP letterhead as the
 * daily-log PDF. Returns raw PDF bytes.
 */
export function buildTimecardPdf(
  rows: TimesheetRow[],
  range: { from: string; to: string },
): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageH = doc.internal.pageSize.getHeight();
  const logo = loadLogoDataUrlFromDisk();

  let y = drawTppPdfLetterhead(doc, margin, 40, logo);

  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text("Payroll Time Cards", margin, y + 4);
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Pay period: ${range.from} – ${range.to}`, margin, y + 20);
  y += 38;

  // Group rows by employee.
  const groups = new Map<string, { name: string; rows: TimesheetRow[] }>();
  for (const r of rows) {
    const key = r.employee_id ?? r.employee_name ?? "unknown";
    const g = groups.get(key) ?? {
      name: r.employee_name?.trim() || "—",
      rows: [],
    };
    g.rows.push(r);
    groups.set(key, g);
  }
  const groupList = [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  let grandReg = 0;
  let grandOt = 0;

  for (const g of groupList) {
    const sorted = g.rows
      .slice()
      .sort((a, b) => a.log_date.localeCompare(b.log_date));
    const body = sorted.map((r) => [
      prettyDate(r.log_date),
      r.job_name?.trim() || "—",
      r.entry_type,
      fmtHours(num(r.hours_worked)),
      fmtHours(num(r.overtime_hours)),
      r.status,
    ]);
    const empReg = g.rows.reduce((s, r) => s + num(r.hours_worked), 0);
    const empOt = g.rows.reduce((s, r) => s + num(r.overtime_hours), 0);
    grandReg += empReg;
    grandOt += empOt;

    if (y > pageH - 120) {
      doc.addPage();
      y = 44;
    }

    autoTable(doc, {
      startY: y,
      head: [[g.name, "Job", "Type", "Reg", "OT", "Status"]],
      body,
      foot: [["", "", "Total", fmtHours(empReg), fmtHours(empOt), ""]],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [10, 22, 40], textColor: [232, 200, 74] },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: [20, 20, 20],
        fontStyle: "bold",
      },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    y = lastTableBottom(doc);
  }

  if (y > pageH - 60) {
    doc.addPage();
    y = 44;
  }
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(
    `Grand total — Regular: ${fmtHours(grandReg)} hrs · Overtime: ${fmtHours(grandOt)} hrs`,
    margin,
    y + 4,
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
