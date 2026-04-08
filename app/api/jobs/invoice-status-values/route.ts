import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
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

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: rows, error: jobsError } = await admin
    .from("jobs")
    .select("need_ready_to_invoice");

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const set = new Set<string>();
  for (const row of rows ?? []) {
    const v = (row as { need_ready_to_invoice: string | null })
      .need_ready_to_invoice;
    if (v != null && String(v).trim()) {
      set.add(String(v).trim());
    }
  }

  const values = [...set].sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ ok: true, values });
}
