import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const STATUS_KEYS = [
  "lead",
  "active",
  "quoted",
  "on_hold",
  "completed",
  "complete",
  "cancelled",
] as const;

type StatusKey = (typeof STATUS_KEYS)[number];

function emptyCounts(): Record<StatusKey, number> {
  return {
    lead: 0,
    active: 0,
    quoted: 0,
    on_hold: 0,
    completed: 0,
    complete: 0,
    cancelled: 0,
  };
}

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
      {
        error:
          e instanceof Error
            ? e.message
            : "Server configuration error (service role).",
      },
      { status: 500 },
    );
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile?.is_active ||
    !["admin", "super_admin"].includes(profile.role ?? "")
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: rows, error: jobsError } = await admin
    .from("jobs")
    .select("status");

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const counts = emptyCounts();
  for (const row of rows ?? []) {
    const s = (row as { status: string | null }).status;
    if (!s) continue;
    const key = s.toLowerCase().replace(/\s+/g, "_") as StatusKey;
    if (key in counts) {
      counts[key] += 1;
    }
  }

  return NextResponse.json({ ok: true, counts });
}
