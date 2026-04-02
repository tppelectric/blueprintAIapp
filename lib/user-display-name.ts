/**
 * Prefer first + last name, then legacy `full_name`, then email.
 * Use everywhere we show a person (lists, selects, crew, assignments).
 */
export function userDisplayName(p: {
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
  return (p.email ?? "").trim() || "—";
}

/** Select / dropdown: `"Name (email)"` when the visible name is not already the email. */
export function userAssigneeOptionLabel(p: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  const display = userDisplayName(p);
  const email = (p.email ?? "").trim();
  if (email && display !== email) return `${display} (${email})`;
  return display;
}
