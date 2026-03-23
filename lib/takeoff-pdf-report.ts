import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import {
  displayWhichRoom,
  itemMatchesDetectedRoom,
  normalizeRoomLabel,
} from "@/lib/room-item-match";
import {
  exportEffectiveQty,
  exportPlanNoteText,
  prepareTakeoffRows,
  roomSqFt,
  type TakeoffExportInclude,
  type TakeoffExportProjectInput,
  type TakeoffOrganizeBy,
} from "@/lib/scan-export";

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function lastTableY(doc: jsPDF): number {
  const t = (doc as DocWithTable).lastAutoTable;
  return typeof t?.finalY === "number" ? t.finalY : 100;
}

const BRAND = "TPP Electric";
const FOOTER_LINE = "TPP Electric | blueprint-a-iapp.vercel.app";
const FOOTER_DISCLAIMER = "AI counts are estimates — verify against plans";
const PREPARED_BY = "Prepared by Blueprint AI";

function pctConf(c: number): string {
  return `${Math.round(Math.min(100, Math.max(0, Number(c) * 100)))}%`;
}

function necHighlightParts(text: string): { text: string; isNec: boolean }[] {
  const parts: { text: string; isNec: boolean }[] = [];
  const re = /NEC\s+\d{3}\.\d+[A-Za-z]?(?:\([A-Za-z0-9]+\))?/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ text: text.slice(last, m.index), isNec: false });
    }
    parts.push({ text: m[0], isNec: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), isNec: false });
  return parts.length ? parts : [{ text, isNec: false }];
}

function applyFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const margin = 40;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(FOOTER_LINE, margin, h - 28, { maxWidth: w - margin * 2 });
    doc.text(`Page ${i} of ${pageCount}`, w - margin - 72, h - 18);
    doc.setFontSize(6.5);
    doc.text(FOOTER_DISCLAIMER, margin, h - 14, { maxWidth: w - margin * 2 });
    doc.setTextColor(0, 0, 0);
  }
}

export function buildTakeoffPdf(
  input: TakeoffExportProjectInput,
  organizeBy: TakeoffOrganizeBy,
  include: TakeoffExportInclude,
): jsPDF {
  const { items, rooms: rawRooms, pageIndex } = prepareTakeoffRows(
    input,
    organizeBy,
  );
  const rooms = [...rawRooms].sort((a, b) => {
    if (a.page_number !== b.page_number) return a.page_number - b.page_number;
    return a.room_name.localeCompare(b.room_name);
  });

  const qty = (i: ElectricalItemRow) =>
    exportEffectiveQty(i, input.manualCounts, input.manualMode);

  const byCat = (cat: string) =>
    items.filter((i) => i.category === cat).reduce((s, i) => s + qty(i), 0);

  const wiringLf = items
    .filter((i) => i.category === "wiring")
    .reduce((s, i) => {
      const u = (i.unit ?? "").toUpperCase();
      const q = qty(i);
      if (u === "LF") return s + q;
      return s;
    }, 0);

  const lowConf = items.filter((i) => Number(i.confidence) < 0.7);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;

  // —— Cover ——
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(BRAND, pageW / 2, 120, { align: "center" });
  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text("Electrical Takeoff Report", pageW / 2, 158, { align: "center" });
  doc.setFontSize(11);
  doc.text(`Project: ${input.projectName}`, margin, 210);
  doc.text(`Date analyzed: ${input.analyzedAt.toLocaleString()}`, margin, 232);
  doc.text(`Total pages scanned: ${input.totalPagesScanned}`, margin, 254);
  doc.setFont("helvetica", "italic");
  doc.text(PREPARED_BY, margin, 286);
  doc.setFont("helvetica", "normal");

  // —— Executive summary ——
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Executive summary", margin, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const roomsWithSq = rooms.filter(
    (r) => roomSqFt(r) || (r.sq_ft != null && Number(r.sq_ft) > 0),
  );
  doc.text(
    `Total rooms detected: ${rooms.length} (${roomsWithSq.length} with sq ft data)`,
    margin,
    74,
  );

  autoTable(doc, {
    startY: 88,
    head: [["Category", "Count / measure"]],
    body: [
      ["Fixtures", String(byCat("fixture"))],
      ["Panels", String(byCat("panel"))],
      ["Wiring (LF subtotal)", `${Math.round(wiringLf)} LF`],
      ["Plan notes (lines)", String(byCat("plan_note"))],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 35, 60] },
  });

  let y = lastTableY(doc) + 16;
  doc.text("NEC compliance status", margin, y);
  y += 14;
  doc.setFontSize(9);
  if (lowConf.length > 0) {
    doc.text(
      `Review recommended: ${lowConf.length} line(s) below 70% AI confidence — verify in the field.`,
      margin,
      y,
      { maxWidth: pageW - margin * 2 },
    );
  } else {
    doc.text(
      "No low-confidence flags in this export scope (all items ≥ 70% confidence).",
      margin,
      y,
      { maxWidth: pageW - margin * 2 },
    );
  }
  y += 28;
  doc.setFontSize(10);
  const matCost = input.estimatedMaterialCost;
  doc.text(
    typeof matCost === "number" && Number.isFinite(matCost) && matCost > 0
      ? `Total estimated material cost: $${matCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "Total estimated material cost: Not available in this export",
    margin,
    y,
    { maxWidth: pageW - margin * 2 },
  );

  // —— Room-by-room ——
  let anyRoomPage = false;
  for (const r of rooms) {
    const inRoom = items.filter(
      (i) =>
        i.page_number === r.page_number &&
        itemMatchesDetectedRoom(i, r) &&
        normalizeRoomLabel(displayWhichRoom(i)) !== "UNASSIGNED",
    );
    if (inRoom.length === 0) continue;
    anyRoomPage = true;

    doc.addPage();
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    const sq = roomSqFt(r);
    doc.text(
      `${r.room_name}${sq ? ` — ${sq} sq ft` : ""}`,
      margin,
      52,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const meta = pageIndex.get(r.page_number);
    const sheetLine = meta
      ? `Sheet ${meta.sheetNumber} (${meta.sheetName}) · Page ${r.page_number}`
      : `Page ${r.page_number}`;
    doc.text(sheetLine, margin, 68);

    const body: string[][] = [];
    for (const i of inRoom) {
      body.push([
        i.description ?? "",
        (i.specification ?? "").slice(0, 80),
        String(qty(i)),
        include.confidence ? pctConf(Number(i.confidence)) : "—",
      ]);
    }

    autoTable(doc, {
      startY: 82,
      head: [["Description", "Specification", "Qty", "Confidence"]],
      body,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 35, 60] },
      columnStyles: {
        0: { cellWidth: 160 },
        1: { cellWidth: 180 },
        2: { cellWidth: 40, halign: "right" },
        3: { cellWidth: 52, halign: "right" },
      },
    });

    const sub = inRoom.reduce((s, i) => s + qty(i), 0);
    const fy = lastTableY(doc) + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Room subtotal: ${sub}`, margin, fy);
    doc.setFont("helvetica", "normal");
  }

  if (!anyRoomPage) {
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Room-by-room breakdown", margin, 52);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      "No items grouped by detected room in this export scope (or rooms not matched).",
      margin,
      74,
      { maxWidth: pageW - margin * 2 },
    );
  }

  // —— Plan notes ——
  const planNotes = include.planNotes
    ? items.filter((i) => i.category === "plan_note")
    : [];
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Plan notes", margin, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (planNotes.length === 0) {
    doc.text("No plan notes in export scope.", margin, 74);
  } else {
    const byPage = new Map<number, ElectricalItemRow[]>();
    for (const n of planNotes) {
      const g = byPage.get(n.page_number) ?? [];
      g.push(n);
      byPage.set(n.page_number, g);
    }
    const sortedPages = [...byPage.keys()].sort((a, b) => a - b);
    let ny = 70;
    for (const pg of sortedPages) {
      const list = byPage.get(pg) ?? [];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Page ${pg}`, margin, ny);
      ny += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const n of list) {
        const raw = exportPlanNoteText(n);
        const parts = necHighlightParts(raw);
        let x = margin;
        const lineStartY = ny;
        for (const p of parts) {
          if (p.isNec) doc.setTextColor(0, 90, 140);
          else doc.setTextColor(0, 0, 0);
          const w = doc.getTextWidth(p.text);
          if (x + w > pageW - margin && x > margin) {
            ny += 12;
            x = margin;
          }
          doc.text(p.text, x, ny);
          x += w;
        }
        doc.setTextColor(0, 0, 0);
        ny = Math.max(ny, lineStartY) + 16;
        if (ny > doc.internal.pageSize.getHeight() - 80) {
          doc.addPage();
          ny = 52;
        }
      }
      ny += 8;
    }
  }

  applyFooters(doc);
  return doc;
}

export function downloadTakeoffPdfReport(
  input: TakeoffExportProjectInput,
  organizeBy: TakeoffOrganizeBy,
  include: TakeoffExportInclude,
  opts?: { filename?: string },
): void {
  const doc = buildTakeoffPdf(input, organizeBy, include);
  const name =
    opts?.filename ??
    `takeoff-${input.projectName.replace(/[^\w\- ]+/g, "").trim() || "project"}.pdf`;
  doc.save(name);
}
