export function formatEmployeeName(p: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  const f = (p.first_name ?? "").trim();
  const l = (p.last_name ?? "").trim();
  if (f || l) return [f, l].filter(Boolean).join(" ");
  const fn = (p.full_name ?? "").trim();
  if (fn) return fn;
  return (p.email ?? "").trim() || "Employee";
}
