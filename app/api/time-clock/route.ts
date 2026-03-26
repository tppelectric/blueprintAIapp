import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseUserRole, type UserRole } from "@/lib/user-roles";

type ActiveSessionRow = {
  id: string;
  job_id: string | null;
  job_name: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  on_lunch: boolean;
};

function startOfWeekLocal(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekLocal(d: Date): Date {
  const s = startOfWeekLocal(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
    .select("role,show_punch_interface,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !profile) {
    return NextResponse.json(
      { error: pErr?.message ?? "Profile not found." },
      { status: 500 },
    );
  }

  const role = parseUserRole(profile.role as string | undefined);
  const showPunchInterface = Boolean(profile.show_punch_interface);

  const weekStart = startOfWeekLocal(new Date());
  const weekEnd = endOfWeekLocal(new Date());
  const weekStartStr = formatDateYmd(weekStart);
  const weekEndStr = formatDateYmd(weekEnd);

  const { data: weekRows } = await supabase
    .from("timesheets")
    .select("hours_worked")
    .eq("employee_id", user.id)
    .gte("log_date", weekStartStr)
    .lte("log_date", weekEndStr);

  let weekHours = 0;
  for (const r of weekRows ?? []) {
    const h = r.hours_worked;
    if (typeof h === "number" && !Number.isNaN(h)) weekHours += h;
    else if (typeof h === "string" && h.trim()) {
      const n = Number(h);
      if (!Number.isNaN(n)) weekHours += n;
    }
  }

  let activeSession: ActiveSessionRow | null = null;
  if (showPunchInterface) {
    const { data: open } = await supabase
      .from("time_clock_sessions")
      .select("id,job_id,job_name,clock_in_at,clock_out_at,on_lunch")
      .eq("employee_id", user.id)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open && !open.clock_out_at) {
      activeSession = open as ActiveSessionRow;
    }
  }

  let teamActive: Array<{
    id: string;
    employeeId: string;
    fullName: string;
    jobName: string | null;
    clockInAt: string;
    onLunch: boolean;
  }> | null = null;

  if (role === "admin" || role === "super_admin") {
    const { data: sessions } = await supabase
      .from("time_clock_sessions")
      .select("id,employee_id,job_name,clock_in_at,on_lunch")
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: true });

    const ids = [...new Set((sessions ?? []).map((s) => s.employee_id))];
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("user_profiles")
        .select("id,full_name,email")
        .in("id", ids);
      for (const p of profs ?? []) {
        const nm =
          (p.full_name as string)?.trim() ||
          (p.email as string)?.trim() ||
          "—";
        nameById.set(p.id as string, nm);
      }
    }
    teamActive = (sessions ?? []).map((s) => ({
      id: s.id as string,
      employeeId: s.employee_id as string,
      fullName: nameById.get(s.employee_id as string) ?? "—",
      jobName: (s.job_name as string | null) ?? null,
      clockInAt: s.clock_in_at as string,
      onLunch: Boolean(s.on_lunch),
    }));
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id,job_name,job_number")
    .order("updated_at", { ascending: false })
    .limit(60);

  return NextResponse.json({
    role: role satisfies UserRole | null,
    showPunchInterface,
    activeSession,
    weekHours: Math.round(weekHours * 100) / 100,
    teamActive,
    jobs: (jobs ?? []).map((j) => ({
      id: j.id as string,
      job_name: (j.job_name as string | null) ?? "",
      job_number: (j.job_number as string | null) ?? "",
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    action?: string;
    jobId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body.action?.trim();
  if (
    action !== "punch_in" &&
    action !== "punch_out" &&
    action !== "lunch_toggle"
  ) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const { data: profile, error: pErr } = await supabase
    .from("user_profiles")
    .select("show_punch_interface,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !profile?.is_active || !profile.show_punch_interface) {
    return NextResponse.json(
      { error: "Time clock access is not enabled for your account." },
      { status: 403 },
    );
  }

  if (action === "punch_in") {
    const jobId = body.jobId?.trim() || null;
    if (!jobId) {
      return NextResponse.json(
        { error: "jobId required for punch in." },
        { status: 400 },
      );
    }
    const { data: job, error: jErr } = await supabase
      .from("jobs")
      .select("id,job_name")
      .eq("id", jobId)
      .maybeSingle();
    if (jErr || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 400 });
    }
    const { data: existing } = await supabase
      .from("time_clock_sessions")
      .select("id")
      .eq("employee_id", user.id)
      .is("clock_out_at", null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Already clocked in." },
        { status: 400 },
      );
    }
    const { data: ins, error: insErr } = await supabase
      .from("time_clock_sessions")
      .insert({
        employee_id: user.id,
        job_id: jobId,
        job_name: (job.job_name as string | null) ?? null,
        clock_in_at: new Date().toISOString(),
        on_lunch: false,
        updated_at: new Date().toISOString(),
      })
      .select("id,job_id,job_name,clock_in_at,clock_out_at,on_lunch")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, session: ins });
  }

  if (action === "punch_out") {
    const { data: open } = await supabase
      .from("time_clock_sessions")
      .select("id")
      .eq("employee_id", user.id)
      .is("clock_out_at", null)
      .maybeSingle();
    if (!open) {
      return NextResponse.json({ error: "Not clocked in." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("time_clock_sessions")
      .update({
        clock_out_at: now,
        on_lunch: false,
        lunch_started_at: null,
        updated_at: now,
      })
      .eq("id", open.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  /* lunch_toggle */
  const { data: open } = await supabase
    .from("time_clock_sessions")
    .select("id,on_lunch")
    .eq("employee_id", user.id)
    .is("clock_out_at", null)
    .maybeSingle();
  if (!open) {
    return NextResponse.json({ error: "Not clocked in." }, { status: 400 });
  }
  const nextLunch = !open.on_lunch;
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("time_clock_sessions")
    .update({
      on_lunch: nextLunch,
      lunch_started_at: nextLunch ? now : null,
      updated_at: now,
    })
    .eq("id", open.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, onLunch: nextLunch });
}
