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

  const { data: profileRows, error } = await admin
    .from("user_profiles")
    .select(
      "id,email,full_name,first_name,last_name,employee_number,role,is_active,show_punch_interface,created_at,updated_at",
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lastSignInById = new Map<string, string | null>();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data: pageData, error: listErr } =
      await admin.auth.admin.listUsers({ page, perPage });
    if (listErr) {
      return NextResponse.json(
        { error: listErr.message ?? "Could not list auth users." },
        { status: 502 },
      );
    }
    const batch = pageData?.users ?? [];
    for (const u of batch) {
      lastSignInById.set(
        u.id,
        typeof u.last_sign_in_at === "string" ? u.last_sign_in_at : null,
      );
    }
    if (batch.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }

  type Row = (typeof profileRows)[number];
  const merged = (profileRows ?? []).map((row: Row) => ({
    ...row,
    last_sign_in_at: lastSignInById.get(row.id) ?? null,
  }));

  merged.sort((a, b) => {
    const ta = a.last_sign_in_at
      ? new Date(a.last_sign_in_at).getTime()
      : null;
    const tb = b.last_sign_in_at
      ? new Date(b.last_sign_in_at).getTime()
      : null;
    if (ta === null && tb === null) {
      return (a.email ?? "").localeCompare(b.email ?? "");
    }
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });

  return NextResponse.json({ users: merged });
}

export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: {
    userId?: string;
    role?: string;
    is_active?: boolean;
    show_punch_interface?: boolean;
    first_name?: string;
    last_name?: string;
    employee_number?: string;
  };
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

  if (body.show_punch_interface !== undefined) {
    patch.show_punch_interface = Boolean(body.show_punch_interface);
  }

  const trimStr = (v: string | undefined) =>
    v === undefined ? undefined : String(v).trim();

  if (body.first_name !== undefined) {
    patch.first_name = trimStr(body.first_name) ?? "";
  }
  if (body.last_name !== undefined) {
    patch.last_name = trimStr(body.last_name) ?? "";
  }
  if (body.employee_number !== undefined) {
    patch.employee_number = trimStr(body.employee_number) ?? "";
  }

  if (
    body.first_name !== undefined &&
    body.last_name !== undefined
  ) {
    const f = trimStr(body.first_name) ?? "";
    const l = trimStr(body.last_name) ?? "";
    patch.full_name = [f, l].filter(Boolean).join(" ").trim();
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json(
      {
        error:
          "No changes (role, account status, time clock access, or name fields).",
      },
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
      "id,email,full_name,first_name,last_name,employee_number,role,is_active,show_punch_interface,created_at,updated_at",
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
