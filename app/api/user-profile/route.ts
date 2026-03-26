import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isUserRole, type UserRole } from "@/lib/user-roles";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Server configuration error (service role).",
      },
      { status: 500 },
    );
  }

  const email = (user.email ?? "").trim();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : "";

  const { data: existing, error: readErr } = await admin
    .from("user_profiles")
    .select(
      "id,email,full_name,role,is_active,show_punch_interface,created_at,updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: readErr.message, hint: "Run supabase/user_profiles_rbac.sql." },
      { status: 500 },
    );
  }

  if (!existing) {
    const insertRow = {
      id: user.id,
      email: email || "unknown@user",
      full_name: fullName,
      role: "estimator" as UserRole,
      is_active: true,
    };
    const { data: created, error: insErr } = await admin
      .from("user_profiles")
      .insert(insertRow)
      .select(
        "id,email,full_name,role,is_active,show_punch_interface,created_at,updated_at",
      )
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    if (
      !created ||
      !isUserRole((created as { role?: string }).role)
    ) {
      return NextResponse.json({ error: "Profile create failed." }, { status: 500 });
    }
    return NextResponse.json({ profile: created });
  }

  if (email && existing.email !== email) {
    const { data: updated, error: upErr } = await admin
      .from("user_profiles")
      .update({ email, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select(
        "id,email,full_name,role,is_active,show_punch_interface,created_at,updated_at",
      )
      .single();
    if (!upErr && updated) {
      return NextResponse.json({ profile: updated });
    }
  }

  return NextResponse.json({ profile: existing });
}
