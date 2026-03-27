"use client";

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type QrSheetItem = { url: string; label: string };

export type QrPdfGrid = "4x4" | "8x8";

/**
 * Multi-QR PDF. `4x4` = up to 16 labels per page (larger codes).
 * `8x8` = up to 64 smaller codes per page.
 */
export async function downloadInventoryQrPdfSheet(
  items: QrSheetItem[],
  title = "TPP Electric — Inventory QR",
  grid: QrPdfGrid = "4x4",
): Promise<void> {
  if (items.length === 0) return;
  const cols = grid === "8x8" ? 8 : 4;
  const rows = grid === "8x8" ? 8 : 4;
  const perPage = cols * rows;
  const qrPixelSize = grid === "8x8" ? 96 : 180;

  const dataUrls = await Promise.all(
    items.map((it) =>
      QRCode.toDataURL(it.url, {
        margin: 1,
        width: qrPixelSize,
        errorCorrectionLevel: "M",
      }),
    ),
  );

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const headerH = grid === "8x8" ? 10 : 12;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerH;
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const imgSize = Math.min(cellW * 0.72, cellH * 0.55, grid === "8x8" ? 18 : 32);
  const fontSize = grid === "8x8" ? 5 : 7;

  let idx = 0;
  while (idx < items.length) {
    doc.setFontSize(grid === "8x8" ? 10 : 12);
    doc.text(title, margin, margin + 6);
    for (let slot = 0; slot < perPage && idx < items.length; slot++, idx++) {
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const x = margin + col * cellW + (cellW - imgSize) / 2;
      const y = margin + headerH + row * cellH + 2;
      doc.addImage(dataUrls[idx], "PNG", x, y, imgSize, imgSize);
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(
        items[idx].label,
        cellW - 2,
      );
      const maxLines = grid === "8x8" ? 2 : 3;
      doc.text(lines.slice(0, maxLines), margin + col * cellW + 1, y + imgSize + 3);
    }
    if (idx < items.length) doc.addPage();
  }

  doc.save(`tpp-inventory-qr-${new Date().toISOString().slice(0, 10)}.pdf`);
}
