/**
 * Browser-only: load a PDF from memory and rasterize pages for Wi‑Fi heat map UI.
 * Uses pdf.js in-process only (no uploads, no app API routes).
 *
 * Important: PDF.js may transfer the document ArrayBuffer to a worker, which
 * **detaches** that buffer. We always pass a fresh copy from slice() so the
 * caller’s original buffer (e.g. React state) stays valid for re-opens.
 */
import {
  getPdfjs,
  PDFJS_NPM_CDN_BASE,
  type PDFDocumentProxy,
} from "@/lib/pdfjs-worker";

export const WIFI_PDF_LOAD_ERROR = "Could not load PDF — please try again";

function renderPageFailedMessage(pageNumber: number): string {
  return `Could not render page ${pageNumber}`;
}

/**
 * Read file as ArrayBuffer in the browser (no fetch / no server).
 */
export function readPdfFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (r instanceof ArrayBuffer) resolve(r);
      else reject(new Error(WIFI_PDF_LOAD_ERROR));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error(WIFI_PDF_LOAD_ERROR));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function loadPdfDocumentFromArrayBuffer(
  data: ArrayBuffer,
): Promise<{
  numPages: number;
  renderPageToDataUrl: (pageNumber: number, maxWidthPx: number) => Promise<string>;
  destroy: () => void;
}> {
  if (typeof document === "undefined") {
    throw new Error("PDF preview requires a browser.");
  }

  const pdfjs = await getPdfjs();

  // Copy so worker transfer does not detach the caller’s buffer.
  const binaryCopy = data.slice(0);

  let pdf: PDFDocumentProxy;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(binaryCopy),
      cMapUrl: `${PDFJS_NPM_CDN_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_NPM_CDN_BASE}standard_fonts/`,
      disableRange: true,
      disableStream: true,
    });
    pdf = await loadingTask.promise;
  } catch {
    throw new Error(WIFI_PDF_LOAD_ERROR);
  }

  const numPages = pdf.numPages;

  async function renderPageToDataUrl(
    pageNumber: number,
    maxWidthPx: number,
  ): Promise<string> {
    if (pageNumber < 1 || pageNumber > numPages) {
      throw new Error(renderPageFailedMessage(pageNumber));
    }
    try {
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
      if (!ctx) throw new Error(renderPageFailedMessage(pageNumber));
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL("image/png");
    } catch {
      throw new Error(renderPageFailedMessage(pageNumber));
    }
  }

  return {
    numPages,
    renderPageToDataUrl,
    destroy: () => {
      void pdf.destroy();
    },
  };
}
