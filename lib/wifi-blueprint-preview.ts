/**
 * Browser-only: load a PDF from memory and rasterize pages for Wi‑Fi heat map UI.
 * Does not upload to storage.
 */
import { getPdfjs } from "@/lib/pdfjs-worker";

export async function loadPdfDocumentFromArrayBuffer(
  data: ArrayBuffer,
): Promise<{
  numPages: number;
  renderPageToDataUrl: (pageNumber: number, maxWidthPx: number) => Promise<string>;
}> {
  if (typeof document === "undefined") {
    throw new Error("PDF preview requires a browser.");
  }
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const numPages = pdf.numPages;

  async function renderPageToDataUrl(
    pageNumber: number,
    maxWidthPx: number,
  ): Promise<string> {
    if (pageNumber < 1 || pageNumber > numPages) {
      throw new Error(`Invalid page ${pageNumber}`);
    }
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(
      4,
      Math.max(0.15, maxWidthPx / Math.max(1, base.width)),
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get canvas context.");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  }

  return { numPages, renderPageToDataUrl };
}
