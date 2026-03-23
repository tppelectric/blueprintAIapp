/**
 * Normalize stored `file_url` to a storage object path inside the blueprints bucket.
 * Supports legacy full public URLs and plain paths like `uploads/uuid-name.pdf`.
 */
export function normalizeBlueprintStoragePath(stored: string): string {
  const t = stored.trim();
  if (!t) return "";

  if (!/^https?:\/\//i.test(t)) {
    return t.replace(/^\/+/, "");
  }

  try {
    const u = new URL(t);
    const p = u.pathname;

    const buckets = [
      "/storage/v1/object/public/blueprints/",
      "/storage/v1/object/sign/blueprints/",
      "/storage/v1/object/authenticated/blueprints/",
    ];
    for (const marker of buckets) {
      const i = p.indexOf(marker);
      if (i >= 0) {
        const rest = p.slice(i + marker.length).split("?")[0] ?? "";
        return decodeURIComponent(rest);
      }
    }

    // e.g. /storage/v1/object/public/blueprints/uploads/x.pdf (any host layout)
    const m = p.match(/\/blueprints\/(.+)$/i);
    if (m?.[1]) {
      return decodeURIComponent(m[1].split("?")[0] ?? "");
    }
  } catch {
    /* ignore */
  }

  return t.replace(/^\/+/, "");
}

/**
 * True if the path is safe to pass to Storage APIs (no traversal / control chars).
 * Intentionally permissive so real object keys (spaces, parens, Unicode) from
 * legacy rows still work; we only block path injection.
 */
export function isSafeStoragePath(path: string): boolean {
  if (!path || path.length > 800) return false;
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  // NUL / C0 controls (except tab which some paths avoid anyway)
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(path)) {
    return false;
  }
  return true;
}

/**
 * Build a stable object path: `uploads/<uuid>-<slug>.pdf` using only [a-z0-9-]
 * in the slug so paths always pass strict storage rules and signed-URL checks.
 */
export function buildBlueprintUploadObjectPath(originalFileName: string): string {
  const slug = slugPdfStorageBase(originalFileName);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `uploads/${id}-${slug}.pdf`;
}

function slugPdfStorageBase(fileName: string): string {
  const withoutPdf = fileName.replace(/\.pdf$/i, "").trim() || "blueprint";
  const slug = withoutPdf
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "blueprint";
}
