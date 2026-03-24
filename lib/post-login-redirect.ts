/**
 * After sign-in or OAuth, where to send the user.
 * Homepage (`/`) and empty `next` → dashboard; otherwise same path if safe.
 */
export function resolvePostLoginRedirect(
  nextParam: string | null | undefined,
): string {
  const raw = nextParam?.trim();
  if (!raw || raw === "/") return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.includes("\\") || raw.includes(":")) return "/dashboard";
  return raw;
}
