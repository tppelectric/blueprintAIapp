import type { PDFDocumentProxy, PDFPageProxy } from "@/lib/pdfjs-worker";

/**
 * Target max decoded image bytes before Claude (5 MB API cap, safety margin).
 * Adjust in one place if provider limits change.
 */
export const MAX_IMAGE_BYTES = 4718592; // 4.5 MiB

/** Target length (CSS px) of the longer page edge after PDF scale — before DPR. */
const DEFAULT_TARGET_LONG_EDGE_CSS_PX = 2048;
const MIN_PDF_SCALE = 0.08;
const MAX_PDF_SCALE = 14;
/** When reducing size, never go below this viewport scale (readability). */
const MIN_VIEWPORT_SCALE = 0.5;
const SCALE_REDUCE_FACTOR = 0.88;
/** Use full device pixel ratio for sharp symbols; cap to avoid extreme memory use. */
const MAX_DPR = 2;
/** Browser / canvas practical limit per dimension. */
const MAX_CANVAS_EDGE_PX = 4096;

const JPEG_QUALITY_INITIAL = 0.85;
const JPEG_QUALITY_MIN = 0.5;
const JPEG_QUALITY_STEP = 0.07;

export type RenderPdfPageOptions = {
  /** Lower values shrink PNG payload (e.g. legend batch upload). Default 4096. */
  targetLongEdgeCssPx?: number;
};

export type RenderPdfPageImage = {
  base64: string;
  mediaType: "image/png" | "image/jpeg";
};

function decodedBase64ByteLength(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

async function rasterizeToCanvas(
  page: PDFPageProxy,
  pdfScale: number,
  _pageNumber: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: pdfScale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Could not get a 2D canvas context.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const rawDpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  let dpr = Math.min(MAX_DPR, Math.max(1, rawDpr));

  const cssW = viewport.width;
  const cssH = viewport.height;
  let pixelW = Math.floor(cssW * dpr);
  let pixelH = Math.floor(cssH * dpr);
  const maxEdge = Math.max(pixelW, pixelH);
  if (maxEdge > MAX_CANVAS_EDGE_PX) {
    const shrink = MAX_CANVAS_EDGE_PX / maxEdge;
    dpr *= shrink;
    pixelW = Math.floor(cssW * dpr);
    pixelH = Math.floor(cssH * dpr);
  }

  canvas.width = pixelW;
  canvas.height = pixelH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const renderTask = page.render({ canvasContext: ctx, viewport });
  await renderTask.promise;

  return canvas;
}

/**
 * Renders a PDF page to base64 image for vision APIs.
 * Keeps decoded payload under {@link MAX_IMAGE_BYTES} by lowering PDF scale (min 0.5),
 * then JPEG (quality 0.85 → 0.5) if needed.
 */
export async function renderPdfPageToPngBase64(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  options?: RenderPdfPageOptions,
): Promise<RenderPdfPageImage> {
  if (typeof document === "undefined") {
    throw new Error("PDF capture must run in the browser.");
  }

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error(`Invalid pageNumber for capture: ${String(pageNumber)}`);
  }
  const maxPage = pdfDoc.numPages;
  if (pageNumber > maxPage) {
    throw new Error(
      `pageNumber ${pageNumber} is out of range (document has ${maxPage} pages).`,
    );
  }

  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const targetLong =
    options?.targetLongEdgeCssPx ?? DEFAULT_TARGET_LONG_EDGE_CSS_PX;
  const longEdge = Math.max(baseViewport.width, baseViewport.height);

  let initialPdfScale = targetLong / longEdge;
  initialPdfScale = Math.min(
    MAX_PDF_SCALE,
    Math.max(MIN_PDF_SCALE, initialPdfScale),
  );

  let scale = initialPdfScale;
  let lastCanvas: HTMLCanvasElement | null = null;

  for (;;) {
    const canvas = await rasterizeToCanvas(page, scale, pageNumber);
    lastCanvas = canvas;

    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      throw new Error("Could not encode page image.");
    }
    const bytes = decodedBase64ByteLength(base64);
    if (bytes <= MAX_IMAGE_BYTES) {
      return { base64, mediaType: "image/png" };
    }

    if (scale <= MIN_VIEWPORT_SCALE + 1e-9) {
      break;
    }
    const reduced = scale * SCALE_REDUCE_FACTOR;
    const nextScale =
      reduced < MIN_VIEWPORT_SCALE ? MIN_VIEWPORT_SCALE : reduced;
    if (nextScale >= scale - 1e-9) {
      break;
    }
    scale = nextScale;
  }

  if (!lastCanvas) {
    throw new Error("Could not rasterize page for image encoding.");
  }

  let q = JPEG_QUALITY_INITIAL;
  while (q >= JPEG_QUALITY_MIN - 1e-9) {
    const dataUrl = lastCanvas.toDataURL("image/jpeg", q);
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      throw new Error("Could not encode page as JPEG.");
    }
    const bytes = decodedBase64ByteLength(base64);
    if (bytes <= MAX_IMAGE_BYTES) {
      return { base64, mediaType: "image/jpeg" };
    }
    q -= JPEG_QUALITY_STEP;
  }

  throw new Error(
    "Blueprint page image is still too large after scaling and JPEG compression. Try a lower default resolution or a smaller PDF.",
  );
}
