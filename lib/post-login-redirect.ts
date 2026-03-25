/**
 * After sign-in or OAuth, where to send the user.
 * Empty `/`, `/projects`, and unsafe paths → dashboard; `/project/[id]` kept.
 */
export function resolvePostLoginRedirect(
  nextParam: string | null | undefined,
): string {
  const raw = nextParam?.trim();
  if (!raw || raw === "/" || raw === "/projects") return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.includes("\\") || raw.includes(":")) return "/dashboard";
  if (raw.startsWith("/project/")) return raw;
  return raw;
}
