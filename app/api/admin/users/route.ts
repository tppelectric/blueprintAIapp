import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isUserRole, type UserRole } from "@/lib/user-roles";

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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

  const { data, error } = await admin
    .from("user_profiles")
    .select(
      "id,email,full_name,role,is_active,created_at,updated_at",
    )
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: { userId?: string; role?: string; is_active?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required." }, { status: 400 });
  }

  if (userId === auth.userId && body.is_active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.role !== undefined) {
    if (!isUserRole(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (userId === auth.userId && body.role !== "super_admin") {
      return NextResponse.json(
        { error: "You cannot remove your own Super Admin role." },
        { status: 400 },
      );
    }
    patch.role = body.role as UserRole;
  }

  if (body.is_active !== undefined) {
    patch.is_active = Boolean(body.is_active);
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json(
      { error: "No changes (role or is_active)." },
      { status: 400 },
    );
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

  const { data, error } = await admin
    .from("user_profiles")
    .update(patch)
    .eq("id", userId)
    .select(
      "id,email,full_name,role,is_active,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ user: data });
}
