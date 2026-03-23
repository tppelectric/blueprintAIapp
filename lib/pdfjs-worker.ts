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
const PDFJS_DIST_VERSION = "4.4.168";

const WORKER_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_DIST_VERSION}/pdf.worker.min.mjs`;

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
