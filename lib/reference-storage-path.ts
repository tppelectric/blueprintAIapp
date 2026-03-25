const BUCKET = "reference-docs";

/**
 * Safe object key under reference-docs (no traversal).
 */
export function isSafeReferenceStoragePath(path: string): boolean {
  if (!path || path.length > 800) return false;
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(path)) {
    return false;
  }
  return true;
}

export function buildReferenceDocObjectPath(originalFileName: string): string {
  const slug = slugPdfStorageBase(originalFileName);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `docs/${id}-${slug}.pdf`;
}

function slugPdfStorageBase(fileName: string): string {
  const withoutPdf = fileName.replace(/\.pdf$/i, "").trim() || "reference";
  const slug = withoutPdf
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "reference";
}

export const REFERENCE_DOCS_BUCKET = BUCKET;
