import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { canScheduleAssignments, parseUserRole } from "@/lib/user-roles";

/**
 * Active users for the schedule assign picker. Gated to schedulers
 * (super_admin / office_manager / can_schedule) because user_profiles RLS is
 * select-own-only — the list must come from the service role after a role check.
 */
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
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const { data: me } = await admin
    .from("user_profiles")
    .select("role,is_active,can_schedule")
    .eq("id", user.id)
    .maybeSingle();

  const role = parseUserRole(me?.role as string | undefined);
  const canSchedule = canScheduleAssignments(
    role,
    me?.can_schedule as boolean | undefined,
  );
  if (!me?.is_active || !canSchedule) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("user_profiles")
    .select("id,email,full_name,first_name,last_name")
    .eq("is_active", true)
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
