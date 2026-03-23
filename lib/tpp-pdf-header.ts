import type { jsPDF } from "jspdf";
import {
  TPP_COMPANY_FULL,
  TPP_ESTABLISHED,
  TPP_LOGO_PATH,
  TPP_GOLD_RGB,
} from "@/lib/tpp-branding";

/** Load logo from public path (browser only). */
export async function fetchTppLogoDataUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(TPP_LOGO_PATH);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("read failed"));
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * PDF letterhead: white panel behind logo (left), company + Est. beside it, gold rule below.
 * Returns Y position below the separator for body content.
 */
export function drawTppPdfLetterhead(
  doc: jsPDF,
  margin: number,
  yStart: number,
  logoDataUrl: string | null,
  opts?: { logoWidthPt?: number; pageWidth?: number },
): number {
  const pageW = opts?.pageWidth ?? doc.internal.pageSize.getWidth();
  const logoW = opts?.logoWidthPt ?? 52;
  const pad = 6;
  const panelH = logoW + pad * 2;
  const y0 = yStart;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y0, pageW - margin * 2, panelH + 28, 3, 3, "F");
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(margin, y0, pageW - margin * 2, panelH + 28, 3, 3, "S");

  const logoBoxX = margin + pad;
  const logoBoxY = y0 + pad;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(logoBoxX, logoBoxY, logoW + 8, logoW + 8, 2, 2, "F");
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(logoBoxX, logoBoxY, logoW + 8, logoW + 8, 2, 2, "S");

  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(
        logoDataUrl,
        fmt,
        logoBoxX + 4,
        logoBoxY + 4,
        logoW,
        logoW,
      );
    } catch {
      /* skip image */
    }
  }

  const textX = logoBoxX + logoW + 8 + 14;
  let ty = logoBoxY + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TPP_GOLD_RGB);
  doc.text(TPP_COMPANY_FULL, textX, ty);
  ty += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Est. ${TPP_ESTABLISHED}`, textX, ty);

  const sepY = y0 + panelH + 22;
  doc.setDrawColor(...TPP_GOLD_RGB);
  doc.setLineWidth(0.75);
  doc.line(margin + 4, sepY, pageW - margin - 4, sepY);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setTextColor(0, 0, 0);

  return sepY + 16;
}
