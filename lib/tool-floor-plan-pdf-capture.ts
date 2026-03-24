"use client";

/**
 * Rasterize one PDF page from an in-memory buffer for vision API scans.
 */
import { renderPdfPageToPngBase64 } from "@/lib/pdf-page-image";
import { getPdfjs, PDFJS_NPM_CDN_BASE } from "@/lib/pdfjs-worker";

export async function capturePdfPageBase64FromArrayBuffer(
  data: ArrayBuffer,
  pageNumber: number,
): Promise<{ base64: string; mediaType: "image/png" | "image/jpeg" }> {
  const pdfjs = await getPdfjs();
  const copy = data.slice(0);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(copy),
    cMapUrl: `${PDFJS_NPM_CDN_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_NPM_CDN_BASE}standard_fonts/`,
    disableRange: true,
    disableStream: true,
  });
  const pdf = await loadingTask.promise;
  try {
    return await renderPdfPageToPngBase64(pdf, pageNumber, {
      targetLongEdgeCssPx: 2400,
    });
  } finally {
    await pdf.destroy();
  }
}
