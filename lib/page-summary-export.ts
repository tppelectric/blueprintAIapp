import type { PDFDocumentProxy } from "@/lib/pdfjs-worker";

const COMPANY = "TPP Electrical Contractors Inc.";
const FOOTER = "Blueprint AI — Page summary export";

export type PageThumbScanStatusExport =
  | "ok"
  | "warn"
  | "error"
  | "spin"
  | "wait";

export type PageSummaryExportRow = {
  page: number;
  scanStatus: PageThumbScanStatusExport | undefined;
  itemCount: number;
  roomCount: number;
  lastScanned: string;
  scanMode: string;
  thumbDataUrl?: string;
};

function statusLabel(s: PageThumbScanStatusExport | undefined): string {
  switch (s) {
    case "ok":
      return "Scanned";
    case "warn":
      return "Warning";
    case "error":
      return "Error";
    case "spin":
      return "In progress";
    case "wait":
    default:
      return "Unscanned";
  }
}

function statusColorClass(s: PageThumbScanStatusExport | undefined): string {
  switch (s) {
    case "ok":
      return "status-ok";
    case "warn":
      return "status-warn";
    case "error":
      return "status-err";
    case "spin":
      return "status-spin";
    default:
      return "status-wait";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildPageSummaryCsv(rows: PageSummaryExportRow[]): string {
  const headers = [
    "Page",
    "Status",
    "Items",
    "Rooms",
    "Last_Scanned",
    "Scan_Mode",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.page),
        csvCell(statusLabel(r.scanStatus)),
        String(r.itemCount),
        String(r.roomCount),
        csvCell(r.lastScanned),
        csvCell(r.scanMode),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadPageSummaryCsv(
  filename: string,
  rows: PageSummaryExportRow[],
): void {
  const csv = buildPageSummaryCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Render a small JPEG data URL for PDF embedding (browser only). */
export async function renderPageThumbDataUrl(
  pdfDoc: PDFDocumentProxy,
  localPage: number,
  scale = 0.2,
): Promise<string> {
  const page = await pdfDoc.getPage(localPage);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const task = page.render({
    canvasContext: ctx,
    viewport,
  });
  await task.promise;
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function openPageSummaryPdfReport(
  projectName: string,
  rows: PageSummaryExportRow[],
  totals: {
    totalPages: number;
    pagesScanned: number;
    totalItems: number;
    unscannedPages: number;
  },
): void {
  const when = escapeHtml(new Date().toLocaleString());
  const proj = escapeHtml(projectName);

  const rowHtml = rows
    .map((r) => {
      const st = statusLabel(r.scanStatus);
      const cls = statusColorClass(r.scanStatus);
      return `<tr>
<td class="num">${r.page}</td>
<td><span class="pill ${cls}">${escapeHtml(st)}</span></td>
<td class="num">${r.itemCount}</td>
<td class="num">${r.roomCount}</td>
<td class="meta">${escapeHtml(r.lastScanned)}</td>
<td>${escapeHtml(r.scanMode)}</td>
</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${proj} — Page summary</title>
<style>
body{font-family:system-ui,sans-serif;color:#111;margin:20px;line-height:1.4}
.brand{border-bottom:3px solid #E8C84A;padding-bottom:12px;margin-bottom:16px}
.brand h1{font-size:1.25rem;margin:0;color:#0a1628}
.brand p{margin:6px 0 0;font-size:0.85rem;color:#555}
table{width:100%;border-collapse:collapse;font-size:0.8rem}
th,td{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:middle}
th{background:#f4f4f4}
.num{text-align:center}
.meta{font-size:0.75rem;color:#444}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:600;font-size:0.75rem}
.status-ok{background:#d1fae5;color:#065f46}
.status-warn{background:#fef3c7;color:#92400e}
.status-err{background:#fee2e2;color:#991b1b}
.status-spin{background:#e0e7ff;color:#3730a3}
.status-wait{background:#f3f4f6;color:#4b5563}
.totals{margin-top:20px;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px}
.totals h2{font-size:1rem;margin:0 0 8px}
.totals ul{margin:0;padding-left:1.2rem}
footer{margin-top:20px;font-size:0.75rem;color:#666}
</style></head><body>
<div class="brand">
<h1>${escapeHtml(COMPANY)}</h1>
<p><strong>Project:</strong> ${proj}<br/><strong>Exported:</strong> ${when}</p>
</div>
<h2 style="font-size:1rem;margin:0 0 10px">Per-page scan summary</h2>
<table>
<thead><tr><th>Page</th><th>Status</th><th>Items</th><th>Rooms</th><th>Last scanned</th><th>Scan mode</th></tr></thead>
<tbody>${rowHtml}</tbody>
</table>
<div class="totals">
<h2>Summary totals</h2>
<ul>
<li><strong>Total pages:</strong> ${totals.totalPages}</li>
<li><strong>Pages scanned:</strong> ${totals.pagesScanned}</li>
<li><strong>Total items found:</strong> ${totals.totalItems}</li>
<li><strong>Unscanned pages:</strong> ${totals.unscannedPages}</li>
</ul>
</div>
<footer>${escapeHtml(FOOTER)}</footer>
<script>window.onload=function(){window.focus();}</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Pop-up blocked. Allow pop-ups to print or save as PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
