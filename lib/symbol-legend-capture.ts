import type { PDFDocumentProxy } from "@/lib/pdfjs-worker";

/** Visible “selection” on the blueprint (CSS px box), maps to DB bbox percents. */
export function normBbox60Centered(
  nx: number,
  ny: number,
  overlayCssWidth: number,
  overlayCssHeight: number,
): { nx: number; ny: number; nw: number; nh: number } {
  const nw = Math.min(1, 60 / Math.max(1, overlayCssWidth));
  const nh = Math.min(1, 60 / Math.max(1, overlayCssHeight));
  let nnx = nx - nw / 2;
  let nny = ny - nh / 2;
  nnx = Math.max(0, Math.min(1 - nw, nnx));
  nny = Math.max(0, Math.min(1 - nh, nny));
  return { nx: nnx, ny: nny, nw, nh };
}

const CAPTURE_CSS = 60;
const RENDER_MULT = 3;
const OUT_PX = CAPTURE_CSS * RENDER_MULT;

/**
 * Renders the page at MAIN_BASE_SCALE × viewerZoom × 3, then crops OUT_PX×OUT_PX
 * centered on (nx, ny) in normalized coordinates (0–1 on full page).
 */
export async function capturePdfLegendClickPngBase64(
  doc: PDFDocumentProxy,
  localPage: number,
  viewerZoom: number,
  mainBaseScale: number,
  nx: number,
  ny: number,
): Promise<string> {
  const page = await doc.getPage(localPage);
  const scale = mainBaseScale * viewerZoom * RENDER_MULT;
  const viewport = page.getViewport({ scale });
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");
  const task = page.render({ canvasContext: ctx, viewport });
  await task.promise;

  const cx = nx * w;
  const cy = ny * h;
  const half = OUT_PX / 2;
  let sx = Math.round(cx - half);
  let sy = Math.round(cy - half);
  sx = Math.max(0, Math.min(w - OUT_PX, sx));
  sy = Math.max(0, Math.min(h - OUT_PX, sy));

  const out = document.createElement("canvas");
  out.width = OUT_PX;
  out.height = OUT_PX;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Could not create output canvas.");
  octx.drawImage(canvas, sx, sy, OUT_PX, OUT_PX, 0, 0, OUT_PX, OUT_PX);
  return out.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
