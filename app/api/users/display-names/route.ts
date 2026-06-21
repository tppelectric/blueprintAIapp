import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { verifierShortName } from "@/lib/format-verify-stamp";

const MAX_IDS = 50;

/** Resolve short display names for verifier stamps (first name or email local-part). */
export const POST = withAuth(async (request: NextRequest) => {
  let body: { userIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = body.userIds;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "userIds array required." }, { status: 400 });
  }

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const userIds = [
    ...new Set(
      raw
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id && uuidRe.test(id)),
    ),
  ].slice(0, MAX_IDS);

  if (userIds.length === 0) {
    return NextResponse.json({ names: {} });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,first_name,email")
    .in("id", userIds)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const names: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    names[id] = verifierShortName({
      first_name: row.first_name as string | null,
      email: row.email as string | null,
    });
  }

  return NextResponse.json({ names });
});
