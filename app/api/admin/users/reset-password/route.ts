import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const origin =
    request.headers.get("origin") ??
    request.headers.get("referer")?.split("/").slice(0, 3).join("/") ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "";
  const redirectTo = origin
    ? `${origin.replace(/\/$/, "")}/auth/callback?next=/reset-password`
    : undefined;

  let body: { userId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required." }, { status: 400 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const { data: profile, error: profErr } = await admin
    .from("user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  const email = (profile?.email as string | undefined)?.trim();
  if (!email) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // generateLink only CREATES a link (no send). resetPasswordForEmail actually
  // SENDS the email via the project's configured email/SMTP. Works for existing
  // users incl. pending ones created via createUser (email_confirm:true).
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
  const { error } = await anon.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not send email." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}
