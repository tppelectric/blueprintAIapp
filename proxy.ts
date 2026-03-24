import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-client";

/**
 * Next.js 16 proxy (replaces middleware). Session refresh uses `request.cookies.getAll()`
 * and writes Set-Cookie on the outgoing response via `lib/supabase/proxy-client` — same
 * cookie names the browser client sets after `signInWithPassword`.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
