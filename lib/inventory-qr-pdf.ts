"use client";

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type QrSheetItem = { url: string; label: string };

/** Multi-QR printable PDF (letter, grid). */
export async function downloadInventoryQrPdfSheet(
  items: QrSheetItem[],
  title = "Inventory QR sheet",
): Promise<void> {
  if (items.length === 0) return;
  const dataUrls = await Promise.all(
    items.map((it) =>
      QRCode.toDataURL(it.url, { margin: 1, width: 160, errorCorrectionLevel: "M" }),
    ),
  );
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  doc.setFontSize(14);
  doc.text(title, margin, 14);
  const cellW = 42;
  const cellH = 48;
  const imgSize = 28;
  let x = margin;
  let y = 22;
  const rowGap = 6;
  for (let i = 0; i < items.length; i++) {
    if (y + cellH > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.addImage(dataUrls[i], "PNG", x, y, imgSize, imgSize);
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(items[i].label, cellW - 2);
    doc.text(lines, x, y + imgSize + 4);
    x += cellW;
    if (x + cellW > pageW - margin) {
      x = margin;
      y += cellH + rowGap;
    }
  }
  doc.save(`inventory-qr-${new Date().toISOString().slice(0, 10)}.pdf`);
}
