/** RFC-style UUID v1–v8 (loose match for route validation). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  if (value == null) return false;
  return UUID_RE.test(String(value).trim());
}
