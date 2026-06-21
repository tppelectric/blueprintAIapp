/**
 * After sign-in or OAuth, where to send the user.
 * Empty `/`, `/projects`, and unsafe paths → Home (`/`); `/project/[id]` kept.
 * Dashboard remains reachable from the nav, just not the default landing.
 */
export function resolvePostLoginRedirect(
  nextParam: string | null | undefined,
): string {
  const raw = nextParam?.trim();
  if (!raw || raw === "/" || raw === "/projects") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\") || raw.includes(":")) return "/";
  if (raw.startsWith("/project/")) return raw;
  return raw;
}
