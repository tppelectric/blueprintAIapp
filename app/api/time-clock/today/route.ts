import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseUserRole } from "@/lib/user-roles";
import { formatWorkedHrsMins, workedMsFromPunch } from "@/lib/time-punch-worked";

function displayName(p: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  const f = (p.first_name ?? "").trim();
  const l = (p.last_name ?? "").trim();
  if (f || l) return [f, l].filter(Boolean).join(" ");
  return (p.full_name ?? "").trim() || (p.email ?? "").trim() || "—";
}

function canViewOpenPunches(role: ReturnType<typeof parseUserRole>): boolean {
  return (
    role === "super_admin" || role === "admin" || role === "office_manager"
  );
}

/** Open punches right now (for Today's Punches tab). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: pErr } = await supabase
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !profile?.is_active) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const role = parseUserRole(profile.role as string | undefined);
  if (!canViewOpenPunches(role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: punches, error } = await supabase
    .from("time_punches")
    .select(
      "id,employee_id,job_name,punch_in_at,on_lunch,lunch_start_at,total_lunch_ms",
    )
    .is("punch_out_at", null)
    .order("punch_in_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = [...new Set((punches ?? []).map((p) => p.employee_id))];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from("user_profiles")
      .select("id,first_name,last_name,full_name,email")
      .in("id", ids);
    for (const p of profs ?? []) {
      nameById.set(
        p.id as string,
        displayName({
          first_name: p.first_name as string | null,
          last_name: p.last_name as string | null,
          full_name: p.full_name as string | null,
          email: p.email as string | null,
        }),
      );
    }
  }

  const now = Date.now();
  const rows = (punches ?? []).map((p) => {
    const punchInAt = p.punch_in_at as string;
    const onLunch = Boolean(p.on_lunch);
    const lunchStartAt = (p.lunch_start_at as string | null) ?? null;
    const totalLunchMs = Number(p.total_lunch_ms) || 0;
    const workedMs = workedMsFromPunch(
      {
        punch_in_at: punchInAt,
        on_lunch: onLunch,
        lunch_start_at: lunchStartAt,
        total_lunch_ms: totalLunchMs,
      },
      now,
    );
    return {
      id: p.id as string,
      employeeId: p.employee_id as string,
      employeeName: nameById.get(p.employee_id as string) ?? "—",
      jobName: (p.job_name as string | null) ?? "—",
      punchInAt,
      punchInLabel: new Date(punchInAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      hoursSoFarLabel: formatWorkedHrsMins(workedMs),
      status: onLunch ? ("lunch" as const) : ("working" as const),
    };
  });

  return NextResponse.json({ punches: rows });
}
