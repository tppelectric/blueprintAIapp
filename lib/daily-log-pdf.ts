import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import sharp from "sharp";
import type { DailyLogRow } from "@/lib/daily-logs-types";
import {
  extractMaterialLines,
  hoursWorked,
  netHoursAfterLunch,
} from "@/lib/daily-logs-helpers";
import { drawTppPdfLetterhead } from "@/lib/tpp-pdf-header";
import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

export type DailyLogPhotoAttachment = {
  file_path: string;
  caption: string | null;
  original_name: string;
  mime_type: string;
};

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function lastTableBottom(doc: jsPDF): number {
  const t = (doc as DocWithTable).lastAutoTable;
  return typeof t?.finalY === "number" ? t.finalY + 14 : 100;
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

function fmtTime(t: string | null | undefined): string {
  if (!t?.trim()) return "—";
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  return m ? `${m[1]}:${m[2]}` : s;
}

function yn(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function textLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function addPageIfNeeded(doc: jsPDF, y: number, margin: number, reserve: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y > h - reserve) {
    doc.addPage();
    return margin;
  }
  return y;
}

function writeHeading(doc: jsPDF, margin: number, y: number, title: string): number {
  y = addPageIfNeeded(doc, y, margin, 72);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(title, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  return y + 14;
}

function writeBody(
  doc: jsPDF,
  margin: number,
  pageW: number,
  y: number,
  text: string | null | undefined,
): number {
  if (!text?.trim()) return y;
  y = addPageIfNeeded(doc, y, margin, 80);
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(text.trim(), pageW - margin * 2);
  for (const line of lines) {
    y = addPageIfNeeded(doc, y, margin, 48);
    doc.text(line, margin, y);
    y += 12;
  }
  return y + 4;
}

/** Build a letterhead PDF for one daily log; server-only (fs + sharp). */
export async function buildDailyLogPdf(
  log: DailyLogRow,
  photos: DailyLogPhotoAttachment[],
  downloadPhoto: (storagePath: string) => Promise<Buffer | null>,
): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as DocWithTable;
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const logo = loadLogoDataUrlFromDisk();
  let y = drawTppPdfLetterhead(doc, margin, 36, logo, {
    pageWidth: pageW,
    logoWidthPt: 48,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Daily Field Log", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const jobLine = log.job_name?.trim() || "—";
  doc.text(`Job: ${jobLine}`, margin, y);
  y += 14;
  doc.text(`Date: ${String(log.log_date).slice(0, 10)}`, margin, y);
  y += 20;
  doc.setTextColor(0, 0, 0);

  const gross = hoursWorked(log.check_in, log.check_out);
  const net = netHoursAfterLunch(
    log.check_in,
    log.check_out,
    log.lunch_duration_minutes,
  );

  const summaryRows: string[][] = [
    ["Check-in", fmtTime(log.check_in)],
    ["Check-out", fmtTime(log.check_out)],
    [
      "Hours (gross / net)",
      gross != null
        ? net != null
          ? `${gross}h / ${net}h (after lunch)`
          : `${gross}h`
        : "—",
    ],
    ["Crew lead", log.crew_user?.trim() || "—"],
    ["Weather", log.weather?.trim() || "—"],
    ["Job status", log.job_status?.trim() || "—"],
    ["Lunch (min)", log.lunch_duration_minutes != null ? String(log.lunch_duration_minutes) : "—"],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Field", "Value"]],
    body: summaryRows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [10, 22, 40], textColor: 255 },
    columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: pageW - margin * 2 - 130 } },
  });
  y = lastTableBottom(doc);

  y = writeHeading(doc, margin, y, "Notes");
  y = writeBody(doc, margin, pageW, y, log.notes);
  y = writeBody(doc, margin, pageW, y, log.additional_notes);

  const crew = textLines(log.employees_onsite);
  if (crew.length > 0) {
    y = writeHeading(doc, margin, y, "Crew on site");
    doc.setFontSize(9);
    for (const line of crew) {
      y = addPageIfNeeded(doc, y, margin, 36);
      doc.text(`• ${line}`, margin + 6, y);
      y += 12;
    }
    y += 6;
  }

  const trades = textLines(log.trades_onsite);
  if (trades.length > 0) {
    y = writeHeading(doc, margin, y, "Trades on site");
    doc.setFontSize(9);
    for (const line of trades) {
      y = addPageIfNeeded(doc, y, margin, 36);
      doc.text(`• ${line}`, margin + 6, y);
      y += 12;
    }
    y += 6;
  }

  const visitors = textLines(log.visitors_onsite);
  if (visitors.length > 0) {
    y = writeHeading(doc, margin, y, "Visitors");
    doc.setFontSize(9);
    for (const line of visitors) {
      y = addPageIfNeeded(doc, y, margin, 36);
      doc.text(`• ${line}`, margin + 6, y);
      y += 12;
    }
    y += 6;
  }

  const mu = extractMaterialLines(log.materials_used);
  if (mu.length > 0) {
    y = addPageIfNeeded(doc, y, margin, 100);
    y = writeHeading(doc, margin, y, "Materials used");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Item"]],
      body: mu.map((m) => [m]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [232, 200, 74], textColor: [20, 20, 20] },
    });
    y = lastTableBottom(doc);
  }

  const mn = extractMaterialLines(log.materials_needed);
  if (mn.length > 0) {
    y = addPageIfNeeded(doc, y, margin, 100);
    y = writeHeading(doc, margin, y, "Materials needed");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Item"]],
      body: mn.map((m) => [m]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [232, 200, 74], textColor: [20, 20, 20] },
    });
    y = lastTableBottom(doc);
  }

  const detailRows: string[][] = [];
  const pushText = (label: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) detailRows.push([label, v]);
  };
  if (log.materials_left_onsite != null) {
    detailRows.push(["Materials left on site", yn(log.materials_left_onsite)]);
  }
  pushText("Equipment left on site", log.equipment_left_onsite);
  if (log.tpp_equipment_left != null) {
    detailRows.push(["TPP equipment left", yn(log.tpp_equipment_left)]);
  }
  pushText("Equipment used", log.equipment_used);
  pushText("Work completed", log.work_completed);
  pushText("Next day plan", log.next_day_plan);
  pushText("Anticipated delays", log.anticipated_delays);
  if (log.all_breakers_on != null) {
    detailRows.push(["All breakers on", yn(log.all_breakers_on)]);
  }
  pushText("Breakers off reason", log.breakers_off_reason);
  pushText("Supply receipts", log.supply_receipts);
  pushText("Store receipts", log.store_receipts);
  if (log.safety_incident === true) {
    detailRows.push(["Safety incident", "Yes"]);
    pushText("Safety notes", log.safety_incident_notes);
  } else if (log.safety_incident === false) {
    detailRows.push(["Safety incident", "No"]);
  }
  pushText("Internal notes", log.internal_notes);

  if (detailRows.length > 0) {
    y = addPageIfNeeded(doc, y, margin, 120);
    y = writeHeading(doc, margin, y, "Additional details");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Topic", "Details"]],
      body: detailRows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [10, 22, 40], textColor: 255 },
      columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: pageW - margin * 2 - 120 } },
    });
    y = lastTableBottom(doc);
  }

  if (photos.length > 0) {
    y = addPageIfNeeded(doc, y, margin, 160);
    y = writeHeading(doc, margin, y, "Photos");
    const gap = 10;
    const colW = (pageW - margin * 2 - gap) / 2;
    const maxThumbW = colW;
    const maxThumbH = 120;
    let rowY = y;
    let col = 0;
    let rowH = 0;

    for (const ph of photos) {
      const raw = await downloadPhoto(ph.file_path);
      if (!raw) continue;
      let jpegBuf: Buffer;
      try {
        jpegBuf = await sharp(raw)
          .rotate()
          .resize({
            width: Math.round(maxThumbW * 2),
            height: Math.round(maxThumbH * 2),
            fit: "inside",
          })
          .jpeg({ quality: 82 })
          .toBuffer();
      } catch {
        continue;
      }

      const meta = await sharp(jpegBuf).metadata();
      const iw = meta.width ?? 1;
      const ih = meta.height ?? 1;
      let dw = maxThumbW;
      let dh = (ih / iw) * dw;
      if (dh > maxThumbH) {
        dh = maxThumbH;
        dw = (iw / ih) * dh;
      }

      const cap = ph.caption?.trim() || ph.original_name;
      let capH = 6;
      if (cap) {
        doc.setFontSize(7);
        capH = doc.splitTextToSize(cap.slice(0, 200), colW).length * 9 + 14;
      }

      if (col === 0) {
        rowY = addPageIfNeeded(doc, rowY, margin, dh + capH + 24);
      }

      const x = margin + col * (colW + gap);
      try {
        const dataUrl = `data:image/jpeg;base64,${jpegBuf.toString("base64")}`;
        doc.addImage(dataUrl, "JPEG", x, rowY, dw, dh);
      } catch {
        /* skip */
      }

      if (cap) {
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        let cy = rowY + dh + 10;
        for (const line of doc.splitTextToSize(cap.slice(0, 200), colW)) {
          doc.text(line, x, cy);
          cy += 9;
        }
        doc.setTextColor(0, 0, 0);
      }

      rowH = Math.max(rowH, dh + capH);
      col += 1;
      if (col >= 2) {
        rowY += rowH + gap;
        col = 0;
        rowH = 0;
      }
    }
    y = rowY + (col > 0 ? rowH : 0) + gap;
  }

  y = addPageIfNeeded(doc, y, margin, 120);
  y = writeHeading(doc, margin, y, "Signature");
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 28;
  doc.setFontSize(9);
  doc.text("Foreman / supervisor signature", margin, y);
  y += 36;
  doc.line(margin, y, pageW - margin, y);
  y += 18;
  doc.setTextColor(100, 100, 100);
  doc.text("Date", margin, y);
  doc.setTextColor(0, 0, 0);

  const footer = `${new Date().toISOString().slice(0, 10)} · Log ID ${log.id}`;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(footer, margin, pageH - 24);
    doc.setTextColor(0, 0, 0);
  }

  const out = doc.output("arraybuffer");
  return new Uint8Array(out);
}
