"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AssetRow } from "@/lib/inventory-types";
import type { MaterialRow } from "@/lib/inventory-types";
import type { AssetLocationRow } from "@/lib/inventory-types";
import type { AssetTransactionRow } from "@/lib/inventory-types";
import { formatEmployeeName } from "@/lib/inventory-employee";

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportInventoryCsv(params: {
  assets: AssetRow[];
  materials: MaterialRow[];
  locations: AssetLocationRow[];
}): void {
  const lines: string[] = [];
  lines.push("ASSETS");
  lines.push(
    [
      "asset_number",
      "name",
      "asset_type",
      "status",
      "location_id",
      "assigned_to",
      "assigned_to_name",
      "serial_number",
    ].join(","),
  );
  for (const a of params.assets) {
    lines.push(
      [
        csvEscape(a.asset_number),
        csvEscape(a.name),
        csvEscape(a.asset_type),
        csvEscape(a.status),
        csvEscape(a.location_id ?? ""),
        csvEscape(a.assigned_to ?? ""),
        csvEscape(a.assigned_to_name ?? ""),
        csvEscape(a.serial_number ?? ""),
      ].join(","),
    );
  }
  lines.push("");
  lines.push("MATERIALS");
  lines.push(
    [
      "name",
      "part_number",
      "unit",
      "current_quantity",
      "minimum_quantity",
      "location_id",
      "supplier",
    ].join(","),
  );
  for (const m of params.materials) {
    lines.push(
      [
        csvEscape(m.name),
        csvEscape(m.part_number ?? ""),
        csvEscape(m.unit),
        String(m.current_quantity),
        String(m.minimum_quantity),
        csvEscape(m.location_id ?? ""),
        csvEscape(m.supplier ?? ""),
      ].join(","),
    );
  }
  lines.push("");
  lines.push("LOCATIONS");
  lines.push(["name", "location_type", "address"].join(","));
  for (const l of params.locations) {
    lines.push(
      [
        csvEscape(l.name),
        csvEscape(l.location_type),
        csvEscape(l.address ?? ""),
      ].join(","),
    );
  }
  downloadText(
    `tpp-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    lines.join("\n"),
    "text/csv;charset=utf-8",
  );
}

export function exportTransactionsCsv(rows: AssetTransactionRow[]): void {
  const header = [
    "created_at",
    "transaction_type",
    "employee_name",
    "asset_id",
    "material_id",
    "quantity",
    "job_id",
    "from_location_id",
    "to_location_id",
    "notes",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.created_at),
        csvEscape(r.transaction_type),
        csvEscape(r.employee_name ?? ""),
        csvEscape(r.asset_id ?? ""),
        csvEscape(r.material_id ?? ""),
        r.quantity != null ? String(r.quantity) : "",
        csvEscape(r.job_id ?? ""),
        csvEscape(r.from_location_id ?? ""),
        csvEscape(r.to_location_id ?? ""),
        csvEscape(r.notes ?? ""),
      ].join(","),
    );
  }
  downloadText(
    `tpp-inventory-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
    lines.join("\n"),
    "text/csv;charset=utf-8",
  );
}

export function exportInventorySummaryPdf(params: {
  assets: AssetRow[];
  materials: MaterialRow[];
  locations: AssetLocationRow[];
}): void {
  const doc = new jsPDF({ unit: "mm", format: "letter" }) as import("jspdf").jsPDF & {
    lastAutoTable?: { finalY: number };
  };
  doc.setFontSize(14);
  doc.text("TPP Electric — Inventory summary", 14, 16);
  let y = 24;
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["#", "Name", "Type", "Status", "Asset #"]],
    body: params.assets.map((a) => [
      a.asset_number,
      a.name,
      a.asset_type,
      a.status,
      a.serial_number ?? "—",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [88, 28, 135] },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 12;

  autoTable(doc, {
    startY: y,
    head: [["Material", "Qty", "Unit", "Min", "Part #"]],
    body: params.materials.map((m) => [
      m.name,
      String(m.current_quantity),
      m.unit,
      String(m.minimum_quantity),
      m.part_number ?? "—",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [88, 28, 135] },
  });

  doc.save(`tpp-inventory-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportAssignmentReportPdf(
  assets: AssetRow[],
  profiles: Record<
    string,
    { first_name?: string | null; last_name?: string | null; email?: string | null }
  >,
): void {
  const checked = assets.filter((a) => a.status === "checked_out" && a.assigned_to);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  doc.setFontSize(14);
  doc.text("TPP Electric — Checked out assets", 14, 16);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);

  const body = checked.map((a) => {
    const name =
      a.assigned_to_name?.trim() ||
      formatEmployeeName(profiles[a.assigned_to!] ?? {});
    return [a.asset_number, a.name, a.asset_type, name];
  });

  autoTable(doc, {
    startY: 28,
    head: [["Asset #", "Item", "Type", "Assigned to"]],
    body: body.length ? body : [["—", "No checked-out assets", "", ""]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [88, 28, 135] },
  });

  doc.save(
    `tpp-assignment-report-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}
