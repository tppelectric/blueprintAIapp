import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isUserRole, type UserRole } from "@/lib/user-roles";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: {
    email?: string;
    role?: string;
    full_name?: string;
    employee_number?: string;
    show_punch_interface?: boolean;
    can_schedule?: boolean;
    /** true = email a registration invite now; false/omitted = add as pending (no email). */
    sendInvite?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !emailRe.test(email)) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }

  const role: UserRole = isUserRole(body.role) ? body.role : "estimator";
  const full_name = (body.full_name ?? "").trim();

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const origin =
    request.headers.get("origin") ??
    request.headers.get("referer")?.split("/").slice(0, 3).join("/") ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "";

  const redirectTo = origin ? `${origin.replace(/\/$/, "")}/auth/callback` : undefined;

  const sendInvite = body.sendInvite === true;

  let userId: string | undefined;
  if (sendInvite) {
    // Emails a registration invite immediately.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    userId = data.user?.id;
  } else {
    // Add as PENDING — no email sent. email_confirm:true so a later
    // recovery/login link works; createUser never sends an email.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    userId = data.user?.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "User creation did not return an id." },
      { status: 500 },
    );
  }

  const { error: profileErr } = await admin.from("user_profiles").upsert(
    {
      id: userId,
      email,
      full_name,
      role,
      is_active: true,
      employee_number: (body.employee_number ?? "").trim() || null,
      show_punch_interface: body.show_punch_interface === true,
      can_schedule: body.can_schedule === true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileErr) {
    return NextResponse.json(
      {
        error: profileErr.message,
        hint: "User may exist in Auth but profile upsert failed.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, userId, pending: !sendInvite });
}
