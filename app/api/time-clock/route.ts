import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseUserRole, type UserRole } from "@/lib/user-roles";
import {
  computeDayStats,
  type DayPunchRow,
} from "@/lib/time-clock-day-stats";
import {
  splitRegularOvertime,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";
import {
  parseCoordsBody,
  resolvePunchGpsForJob,
} from "@/lib/time-clock-location-resolve";

type ActivePunchRow = {
  id: string;
  job_id: string | null;
  job_name: string | null;
  punch_in_at: string;
  punch_out_at: string | null;
  notes: string | null;
  on_lunch: boolean;
  lunch_start_at: string | null;
  lunch_end_at: string | null;
  total_lunch_ms: number;
  punch_in_location: Record<string, unknown> | null;
  lunch_start_location: Record<string, unknown> | null;
  gps_override_at: string | null;
  gps_location_flagged: boolean;
  is_manual_entry: boolean;
  manual_entry_by_name: string | null;
  manual_entry_at: string | null;
  manual_entry_note: string | null;
};

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

function toHhMmLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const mi = d.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

export async function GET(request: Request) {
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

  let activeSession: ActivePunchRow | null = null;
  if (showPunchInterface) {
    const { data: open } = await supabase
      .from("time_punches")
      .select(
        "id,job_id,job_name,punch_in_at,punch_out_at,notes,on_lunch,lunch_start_at,lunch_end_at,total_lunch_ms,punch_in_location,lunch_start_location,gps_override_at,gps_location_flagged,is_manual_entry,manual_entry_by,manual_entry_at,manual_entry_note",
      )
      .eq("employee_id", user.id)
      .is("punch_out_at", null)
      .order("punch_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open && !open.punch_out_at) {
      let manualEntryByName: string | null = null;
      const mBy = open.manual_entry_by as string | null | undefined;
      if (mBy) {
        const { data: mp } = await supabase
          .from("user_profiles")
          .select("first_name,last_name,full_name,email")
          .eq("id", mBy)
          .maybeSingle();
        if (mp) {
          manualEntryByName = displayName({
            first_name: mp.first_name as string | null,
            last_name: mp.last_name as string | null,
            full_name: mp.full_name as string | null,
            email: mp.email as string | null,
          });
        }
      }
      activeSession = {
        id: open.id as string,
        job_id: (open.job_id as string | null) ?? null,
        job_name: (open.job_name as string | null) ?? null,
        punch_in_at: open.punch_in_at as string,
        punch_out_at: (open.punch_out_at as string | null) ?? null,
        notes: (open.notes as string | null) ?? null,
        on_lunch: Boolean(open.on_lunch),
        lunch_start_at: (open.lunch_start_at as string | null) ?? null,
        lunch_end_at: (open.lunch_end_at as string | null) ?? null,
        total_lunch_ms: Number(open.total_lunch_ms) || 0,
        punch_in_location:
          (open.punch_in_location as Record<string, unknown> | null) ?? null,
        lunch_start_location:
          (open.lunch_start_location as Record<string, unknown> | null) ?? null,
        gps_override_at: (open.gps_override_at as string | null) ?? null,
        gps_location_flagged: Boolean(open.gps_location_flagged),
        is_manual_entry: Boolean(open.is_manual_entry),
        manual_entry_by_name: manualEntryByName,
        manual_entry_at: (open.manual_entry_at as string | null) ?? null,
        manual_entry_note: (open.manual_entry_note as string | null) ?? null,
      };
    }
  }

  let teamActive: Array<{
    id: string;
    employeeId: string;
    fullName: string;
    jobName: string | null;
    punchInAt: string;
    onLunch: boolean;
    totalLunchMs: number;
    lunchStartAt: string | null;
    punchInLocation: Record<string, unknown> | null;
    lunchStartLocation: Record<string, unknown> | null;
    gpsOverrideAt: string | null;
    isManualEntry: boolean;
    manualEntryByName: string | null;
  }> | null = null;

  if (role === "admin" || role === "super_admin") {
    const { data: punches } = await supabase
      .from("time_punches")
      .select(
        "id,employee_id,job_name,punch_in_at,on_lunch,total_lunch_ms,lunch_start_at,punch_in_location,lunch_start_location,gps_override_at,is_manual_entry,manual_entry_by",
      )
      .is("punch_out_at", null)
      .order("punch_in_at", { ascending: true });

    const ids = [...new Set((punches ?? []).map((s) => s.employee_id))];
    const nameById = new Map<string, string>();
    const manualIds = new Set<string>();
    for (const s of punches ?? []) {
      const mb = s.manual_entry_by as string | null | undefined;
      if (mb) manualIds.add(mb);
    }
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
    const manualNameById = new Map<string, string>();
    if (manualIds.size) {
      const { data: mprofs } = await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,full_name,email")
        .in("id", [...manualIds]);
      for (const p of mprofs ?? []) {
        manualNameById.set(
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
    teamActive = (punches ?? []).map((s) => {
      const mBy = s.manual_entry_by as string | null | undefined;
      return {
        id: s.id as string,
        employeeId: s.employee_id as string,
        fullName: nameById.get(s.employee_id as string) ?? "—",
        jobName: (s.job_name as string | null) ?? null,
        punchInAt: s.punch_in_at as string,
        onLunch: Boolean(s.on_lunch),
        totalLunchMs: Number(s.total_lunch_ms) || 0,
        lunchStartAt: (s.lunch_start_at as string | null) ?? null,
        punchInLocation:
          (s.punch_in_location as Record<string, unknown> | null) ?? null,
        lunchStartLocation:
          (s.lunch_start_location as Record<string, unknown> | null) ?? null,
        gpsOverrideAt: (s.gps_override_at as string | null) ?? null,
        isManualEntry: Boolean(s.is_manual_entry),
        manualEntryByName: mBy ? (manualNameById.get(mBy) ?? "—") : null,
      };
    });
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id,job_name,job_number")
    .order("updated_at", { ascending: false })
    .limit(60);

  let dayPunches: ReturnType<typeof computeDayStats>["punches"] | null = null;
  let dayTotals: {
    grossHours: number;
    totalWorkedHours: number;
    totalLunchMinutes: number;
    netHours: number;
    overtimeHours: number;
    runningTotalHours: number;
  } | null = null;

  const url = new URL(request.url);
  const rangeFrom = url.searchParams.get("from")?.trim();
  const rangeTo = url.searchParams.get("to")?.trim();
  if (showPunchInterface && rangeFrom && rangeTo) {
    const a = new Date(rangeFrom).getTime();
    const b = new Date(rangeTo).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) {
      const { data: dayRows, error: dayErr } = await supabase
        .from("time_punches")
        .select(
          "id,punch_in_at,punch_out_at,job_name,total_lunch_ms,on_lunch,lunch_start_at",
        )
        .eq("employee_id", user.id)
        .gte("punch_in_at", rangeFrom)
        .lt("punch_in_at", rangeTo)
        .order("punch_in_at", { ascending: false });
      if (!dayErr && dayRows) {
        const stats = computeDayStats(dayRows as DayPunchRow[], Date.now());
        dayPunches = stats.punches;
        dayTotals = {
          grossHours: stats.grossHours,
          totalWorkedHours: stats.totalWorkedHours,
          totalLunchMinutes: stats.totalLunchMinutes,
          netHours: stats.netHours,
          overtimeHours: stats.overtimeHours,
          runningTotalHours: stats.runningTotalHours,
        };
      }
    }
  }

  return NextResponse.json({
    role: role satisfies UserRole | null,
    showPunchInterface,
    activeSession,
    weekHours: Math.round(weekHours * 100) / 100,
    teamActive,
    dayPunches,
    dayTotals,
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
    notes?: string | null;
    location?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const coords = parseCoordsBody(body.location);

  const action = body.action?.trim();
  if (
    action !== "punch_in" &&
    action !== "punch_out" &&
    action !== "start_lunch" &&
    action !== "end_lunch" &&
    action !== "save_notes"
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

  const now = new Date().toISOString();
  const nowMs = Date.now();

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
      .from("time_punches")
      .select("id")
      .eq("employee_id", user.id)
      .is("punch_out_at", null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Already punched in." },
        { status: 400 },
      );
    }
    const notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
    const { snapshot: pinLoc, flagged: pinFlag } =
      await resolvePunchGpsForJob(supabase, jobId, coords);
    const { data: ins, error: insErr } = await supabase
      .from("time_punches")
      .insert({
        employee_id: user.id,
        job_id: jobId,
        job_name: (job.job_name as string | null) ?? null,
        punch_in_at: now,
        notes: notes || null,
        on_lunch: false,
        total_lunch_ms: 0,
        updated_at: now,
        punch_in_location: pinLoc,
        gps_location_flagged: pinFlag,
      })
      .select(
        "id,job_id,job_name,punch_in_at,punch_out_at,notes,on_lunch,lunch_start_at,lunch_end_at,total_lunch_ms,punch_in_location,gps_location_flagged",
      )
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, session: ins });
  }

  if (action === "save_notes") {
    const notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
    const { data: open } = await supabase
      .from("time_punches")
      .select("id")
      .eq("employee_id", user.id)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!open) {
      return NextResponse.json({ error: "Not punched in." }, { status: 400 });
    }
    const { error: upErr } = await supabase
      .from("time_punches")
      .update({ notes: notes || null, updated_at: now })
      .eq("id", open.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "start_lunch") {
    const { data: open } = await supabase
      .from("time_punches")
      .select("id,on_lunch,job_id,gps_location_flagged")
      .eq("employee_id", user.id)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!open) {
      return NextResponse.json({ error: "Not punched in." }, { status: 400 });
    }
    if (open.on_lunch) {
      return NextResponse.json({ error: "Already on lunch." }, { status: 400 });
    }
    const jobId = (open.job_id as string | null) ?? null;
    const { snapshot: lsLoc, flagged: lsFlag } =
      await resolvePunchGpsForJob(supabase, jobId, coords);
    const prevFlag = Boolean(open.gps_location_flagged);
    const { error: upErr } = await supabase
      .from("time_punches")
      .update({
        on_lunch: true,
        lunch_start_at: now,
        lunch_end_at: null,
        updated_at: now,
        lunch_start_location: lsLoc,
        gps_location_flagged: prevFlag || lsFlag,
      })
      .eq("id", open.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "end_lunch") {
    const { data: open } = await supabase
      .from("time_punches")
      .select(
        "id,on_lunch,lunch_start_at,total_lunch_ms,job_id,gps_location_flagged",
      )
      .eq("employee_id", user.id)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!open) {
      return NextResponse.json({ error: "Not punched in." }, { status: 400 });
    }
    if (!open.on_lunch || !open.lunch_start_at) {
      return NextResponse.json({ error: "Not on lunch." }, { status: 400 });
    }
    const ls = new Date(open.lunch_start_at as string).getTime();
    const segment = Math.max(0, nowMs - ls);
    const prev = Number(open.total_lunch_ms) || 0;
    const jobId = (open.job_id as string | null) ?? null;
    const { snapshot: leLoc, flagged: leFlag } =
      await resolvePunchGpsForJob(supabase, jobId, coords);
    const prevFlag = Boolean(open.gps_location_flagged);
    const { error: upErr } = await supabase
      .from("time_punches")
      .update({
        on_lunch: false,
        lunch_end_at: now,
        total_lunch_ms: prev + segment,
        lunch_start_at: null,
        updated_at: now,
        lunch_end_location: leLoc,
        gps_location_flagged: prevFlag || leFlag,
      })
      .eq("id", open.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      lastLunchMinutes: Math.round(segment / 60000),
    });
  }

  if (action === "punch_out") {
    const { data: row } = await supabase
      .from("time_punches")
      .select(
        "id,punch_in_at,job_id,job_name,on_lunch,lunch_start_at,total_lunch_ms,gps_location_flagged",
      )
      .eq("employee_id", user.id)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Not punched in." }, { status: 400 });
    }

    let totalLunchMs = Number(row.total_lunch_ms) || 0;
    if (row.on_lunch && row.lunch_start_at) {
      const ls = new Date(row.lunch_start_at as string).getTime();
      totalLunchMs += Math.max(0, nowMs - ls);
    }

    const punchInMs = new Date(row.punch_in_at as string).getTime();
    const grossMs = Math.max(0, nowMs - punchInMs);
    const workedMs = Math.max(0, grossMs - totalLunchMs);
    const totalHours = workedMs / 3600000;
    const { regular, overtime } = splitRegularOvertime(totalHours);
    const lunchMinutes = Math.round(totalLunchMs / 60000);

    const jobIdOut = (row.job_id as string | null) ?? null;
    const { snapshot: poutLoc, flagged: poutFlag } =
      await resolvePunchGpsForJob(supabase, jobIdOut, coords);
    const prevFlag = Boolean(row.gps_location_flagged);

    const { error: upErr } = await supabase
      .from("time_punches")
      .update({
        punch_out_at: now,
        on_lunch: false,
        lunch_start_at: null,
        total_lunch_ms: totalLunchMs,
        updated_at: now,
        approval_status: "pending",
        approved_by: null,
        approved_at: null,
        punch_out_location: poutLoc,
        gps_location_flagged: prevFlag || poutFlag,
      })
      .eq("id", row.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        totalHours: Math.round(totalHours * 100) / 100,
        regularHours: Math.round(regular * 100) / 100,
        overtimeHours: Math.round(overtime * 100) / 100,
        lunchMinutes,
        jobName: (row.job_name as string | null) ?? "—",
        jobId: (row.job_id as string | null) ?? null,
        punchInAt: row.punch_in_at as string,
        punchOutAt: now,
        logDate: formatDateYmd(new Date(nowMs)),
        checkIn: toHhMmLocal(row.punch_in_at as string),
        checkOut: toHhMmLocal(now),
      },
    });
  }

  return NextResponse.json({ error: "Unhandled." }, { status: 500 });
}
