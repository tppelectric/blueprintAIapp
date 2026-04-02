/**
 * Browser-only PDF.js loader using the **legacy** build (pdfjs-dist 4.x) for
 * compatibility with workers that do not support newer JS APIs used by 5.x.
 *
 * Dynamic `import()` keeps PDF.js out of Node/SSR bundles.
 */
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

export type { PDFDocumentProxy, PDFPageProxy, RenderTask };

/** Must match `package.json` pdfjs-dist version and worker CDN below. */
export const PDFJS_DIST_VERSION = "4.10.38";

const WORKER_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_DIST_VERSION}/pdf.worker.min.mjs`;

/**
 * npm package layout (cmaps / standard_fonts). Used with getDocument() so PDF.js
 * does not hit app-relative URLs (which return HTML and break loading).
 */
export const PDFJS_NPM_CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_DIST_VERSION}/`;

type PdfjsLegacyModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsModulePromise: Promise<PdfjsLegacyModule> | null = null;

export async function getPdfjs(): Promise<PdfjsLegacyModule> {
  if (typeof window === "undefined") {
    throw new Error("PDF.js can only run in the browser.");
  }

  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then(
      (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        return pdfjs;
      },
    );
  }

  return pdfjsModulePromise;
}
