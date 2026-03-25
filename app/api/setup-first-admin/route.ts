import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !emailRe.test(email)) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: existing, error: listErr } = await supabase.auth.admin.listUsers(
      { page: 1, perPage: 1 },
    );
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }
    if ((existing?.users?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "Initial setup is already complete." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const uid = data.user?.id;
    if (uid) {
      const { error: pe } = await supabase.from("user_profiles").upsert(
        {
          id: uid,
          email,
          full_name: "",
          role: "super_admin",
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (pe) {
        return NextResponse.json(
          {
            error: pe.message,
            hint: "User was created but user_profiles upsert failed. Run supabase/user_profiles_rbac.sql.",
          },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({ ok: true, userId: uid });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
