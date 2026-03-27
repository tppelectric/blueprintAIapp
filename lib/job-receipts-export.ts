import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatReceiptCurrency,
  receiptCategoryBucket,
  type ReceiptRow,
} from "@/lib/receipts-types";

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function escapeCsvField(v: string): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportJobReceiptsCsv(
  receipts: ReceiptRow[],
  jobLabel: string,
): void {
  const header =
    "Date,Vendor,Category,Total,Payment,Notes";
  const lines = receipts.map((r) =>
    [
      r.receipt_date ?? "",
      escapeCsvField(r.vendor_name ?? ""),
      escapeCsvField(r.receipt_category),
      String(r.total_amount ?? 0),
      escapeCsvField(r.payment_method ?? ""),
      escapeCsvField(r.notes ?? ""),
    ].join(","),
  );
  const bom = "\uFEFF";
  const blob = new Blob([bom + header + "\n" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipts-${jobLabel.replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJobReceiptsPdf(
  receipts: ReceiptRow[],
  jobLabel: string,
  totals: {
    materials: number;
    gasFuel: number;
    tools: number;
    other: number;
    grand: number;
  },
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as DocWithTable;
  const margin = 48;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text("Job receipts", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(jobLabel, margin, y);
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Materials: ${formatReceiptCurrency(totals.materials)}`, margin, y);
  y += 14;
  doc.text(`Gas/Fuel: ${formatReceiptCurrency(totals.gasFuel)}`, margin, y);
  y += 14;
  doc.text(`Tools: ${formatReceiptCurrency(totals.tools)}`, margin, y);
  y += 14;
  doc.text(`Other: ${formatReceiptCurrency(totals.other)}`, margin, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${formatReceiptCurrency(totals.grand)}`, margin, y);
  doc.setFont("helvetica", "normal");
  y += 24;

  const body = receipts.map((r) => [
    r.receipt_date ?? "—",
    (r.vendor_name ?? "—").slice(0, 40),
    r.receipt_category,
    formatReceiptCurrency(Number(r.total_amount)),
    receiptCategoryBucket(r.receipt_category),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Date", "Vendor", "Category", "Total", "Bucket"]],
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 22, 40] },
  });

  const finalY = doc.lastAutoTable?.finalY ?? y + 100;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    `Generated ${new Date().toLocaleString()} · Blueprint AI`,
    margin,
    finalY + 28,
  );

  doc.save(
    `receipts-${jobLabel.replace(/[^a-zA-Z0-9_-]+/g, "_")}.pdf`,
  );
}
