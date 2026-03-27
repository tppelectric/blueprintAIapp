import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseUserRole } from "@/lib/user-roles";
import {
  parseCoordsBody,
  resolvePunchGpsForJob,
} from "@/lib/time-clock-location-resolve";
import { splitRegularOvertime } from "@/lib/time-punch-worked";

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

async function requireManager(supabase: Awaited<
  ReturnType<typeof createSupabaseServerClient>
>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { user: null as null, role: null as ReturnType<typeof parseUserRole> };
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    return { user: null as null, role: null as ReturnType<typeof parseUserRole> };
  }
  const role = parseUserRole(profile.role as string | undefined);
  if (role !== "admin" && role !== "super_admin") {
    return { user: null as null, role: null as ReturnType<typeof parseUserRole> };
  }
  return { user, role };
}

async function insertAudit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  row: {
    time_punch_id: string;
    actor_id: string;
    action: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await supabase.from("time_punch_audit_log").insert({
    time_punch_id: row.time_punch_id,
    actor_id: row.actor_id,
    action: row.action,
    reason: row.reason ?? null,
    metadata: row.metadata ?? {},
  });
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { user, role } = await requireManager(supabase);
  if (!user || !role) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  if (!userId || !from || !to) {
    return NextResponse.json(
      { error: "userId, from, and to (ISO range) are required." },
      { status: 400 },
    );
  }

  const { data: rows, error } = await supabase
    .from("time_punches")
    .select(
      "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,on_lunch,lunch_start_at,lunch_end_at,total_lunch_ms,punch_in_location,punch_out_location,lunch_start_location,lunch_end_location,gps_location_flagged,gps_override_at,gps_override_reason,is_manual_entry,manual_entry_by,manual_entry_at,manual_entry_note",
    )
    .eq("employee_id", userId)
    .gte("punch_in_at", from)
    .lt("punch_in_at", to)
    .order("punch_in_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const manualIds = new Set<string>();
  for (const r of rows ?? []) {
    const mb = r.manual_entry_by as string | null | undefined;
    if (mb) manualIds.add(mb);
  }
  const manualNameById = new Map<string, string>();
  if (manualIds.size) {
    const { data: profs } = await supabase
      .from("user_profiles")
      .select("id,first_name,last_name,full_name,email")
      .in("id", [...manualIds]);
    for (const p of profs ?? []) {
      const f = (p.first_name ?? "").trim();
      const l = (p.last_name ?? "").trim();
      const name =
        f || l
          ? [f, l].filter(Boolean).join(" ")
          : (p.full_name ?? "").trim() || (p.email ?? "").trim() || "—";
      manualNameById.set(p.id as string, name);
    }
  }

  const punches = (rows ?? []).map((r) => {
    const mBy = r.manual_entry_by as string | null | undefined;
    return {
      id: r.id as string,
      employee_id: r.employee_id as string,
      job_id: (r.job_id as string | null) ?? null,
      job_name: (r.job_name as string | null) ?? null,
      punch_in_at: r.punch_in_at as string,
      punch_out_at: (r.punch_out_at as string | null) ?? null,
      on_lunch: Boolean(r.on_lunch),
      lunch_start_at: (r.lunch_start_at as string | null) ?? null,
      lunch_end_at: (r.lunch_end_at as string | null) ?? null,
      total_lunch_ms: Number(r.total_lunch_ms) || 0,
      punch_in_location: r.punch_in_location,
      punch_out_location: r.punch_out_location,
      lunch_start_location: r.lunch_start_location,
      lunch_end_location: r.lunch_end_location,
      gps_location_flagged: Boolean(r.gps_location_flagged),
      gps_override_at: (r.gps_override_at as string | null) ?? null,
      gps_override_reason: (r.gps_override_reason as string | null) ?? null,
      is_manual_entry: Boolean(r.is_manual_entry),
      manual_entry_by_name: mBy ? (manualNameById.get(mBy) ?? "—") : null,
      manual_entry_at: (r.manual_entry_at as string | null) ?? null,
      manual_entry_note: (r.manual_entry_note as string | null) ?? null,
    };
  });

  return NextResponse.json({ punches });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { user, role } = await requireManager(supabase);
  if (!user || !role) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  const now = new Date().toISOString();
  const nowMs = Date.now();

  if (action === "gps_override") {
    const punchId = String(body.punchId ?? "").trim();
    const reason = String(body.reason ?? "").trim().slice(0, 2000);
    if (!punchId || !reason) {
      return NextResponse.json(
        { error: "punchId and reason are required." },
        { status: 400 },
      );
    }
    const { error: upErr } = await supabase
      .from("time_punches")
      .update({
        gps_override_at: now,
        gps_override_by: user.id,
        gps_override_reason: reason,
        gps_location_flagged: false,
        updated_at: now,
      })
      .eq("id", punchId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    await insertAudit(supabase, {
      time_punch_id: punchId,
      actor_id: user.id,
      action: "gps_override",
      reason,
      metadata: {},
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "edit_punch_times") {
    const punchId = String(body.punchId ?? "").trim();
    const note = String(body.note ?? "").trim().slice(0, 4000);
    if (!punchId || !note) {
      return NextResponse.json(
        { error: "punchId and note (required for audit) are required." },
        { status: 400 },
      );
    }

    const { data: before, error: bErr } = await supabase
      .from("time_punches")
      .select(
        "id,punch_in_at,punch_out_at,on_lunch,lunch_start_at,lunch_end_at,total_lunch_ms",
      )
      .eq("id", punchId)
      .maybeSingle();
    if (bErr || !before) {
      return NextResponse.json({ error: "Punch not found." }, { status: 404 });
    }

    const patch: Record<string, unknown> = { updated_at: now };
    if (typeof body.punch_in_at === "string" && body.punch_in_at.trim()) {
      const t = new Date(body.punch_in_at.trim()).getTime();
      if (!Number.isNaN(t)) patch.punch_in_at = new Date(t).toISOString();
    }
    if (body.punch_out_at === null) {
      patch.punch_out_at = null;
    } else if (typeof body.punch_out_at === "string" && body.punch_out_at.trim()) {
      const t = new Date(body.punch_out_at.trim()).getTime();
      if (!Number.isNaN(t)) patch.punch_out_at = new Date(t).toISOString();
    }
    if (typeof body.on_lunch === "boolean") patch.on_lunch = body.on_lunch;
    if (body.lunch_start_at === null) {
      patch.lunch_start_at = null;
    } else if (
      typeof body.lunch_start_at === "string" &&
      body.lunch_start_at.trim()
    ) {
      const t = new Date(body.lunch_start_at.trim()).getTime();
      if (!Number.isNaN(t)) patch.lunch_start_at = new Date(t).toISOString();
    }
    if (body.lunch_end_at === null) {
      patch.lunch_end_at = null;
    } else if (
      typeof body.lunch_end_at === "string" &&
      body.lunch_end_at.trim()
    ) {
      const t = new Date(body.lunch_end_at.trim()).getTime();
      if (!Number.isNaN(t)) patch.lunch_end_at = new Date(t).toISOString();
    }
    if (body.total_lunch_ms != null) {
      const n = Number(body.total_lunch_ms);
      if (Number.isFinite(n) && n >= 0) patch.total_lunch_ms = Math.round(n);
    }

    const { error: upErr } = await supabase
      .from("time_punches")
      .update(patch)
      .eq("id", punchId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: after } = await supabase
      .from("time_punches")
      .select(
        "id,punch_in_at,punch_out_at,on_lunch,lunch_start_at,lunch_end_at,total_lunch_ms",
      )
      .eq("id", punchId)
      .maybeSingle();

    await insertAudit(supabase, {
      time_punch_id: punchId,
      actor_id: user.id,
      action: "edit_punch_times",
      reason: note,
      metadata: { before, after },
    });
    return NextResponse.json({ ok: true });
  }

  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can perform manual punches." },
      { status: 403 },
    );
  }

  const coords = parseCoordsBody(body.location);

  if (action === "manual_punch_in") {
    const employeeId = String(body.employeeId ?? "").trim();
    const jobId = String(body.jobId ?? "").trim();
    const noteRaw =
      typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    if (!noteRaw) {
      return NextResponse.json(
        { error: "note is required for manual punches." },
        { status: 400 },
      );
    }
    const atIso =
      typeof body.punchInAt === "string" && body.punchInAt.trim()
        ? new Date(body.punchInAt.trim()).toISOString()
        : now;
    if (!employeeId || !jobId) {
      return NextResponse.json(
        { error: "employeeId and jobId are required." },
        { status: 400 },
      );
    }
    const { data: existing } = await supabase
      .from("time_punches")
      .select("id")
      .eq("employee_id", employeeId)
      .is("punch_out_at", null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Employee already has an open punch." },
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
    const { snapshot: pinLoc, flagged: pinFlag } =
      await resolvePunchGpsForJob(supabase, jobId, coords);
    const { data: ins, error: insErr } = await supabase
      .from("time_punches")
      .insert({
        employee_id: employeeId,
        job_id: jobId,
        job_name: (job.job_name as string | null) ?? null,
        punch_in_at: atIso,
        notes: noteRaw || null,
        on_lunch: false,
        total_lunch_ms: 0,
        updated_at: now,
        punch_in_location: pinLoc,
        gps_location_flagged: pinFlag,
        is_manual_entry: true,
        manual_entry_by: user.id,
        manual_entry_at: now,
        manual_entry_note: noteRaw || null,
      })
      .select("id")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    const newId = ins!.id as string;
    await insertAudit(supabase, {
      time_punch_id: newId,
      actor_id: user.id,
      action: "manual_punch_in",
      reason: noteRaw || null,
      metadata: { employeeId, jobId, punch_in_at: atIso },
    });
    return NextResponse.json({ ok: true, punchId: newId });
  }

  if (action === "manual_start_lunch") {
    const employeeId = String(body.employeeId ?? "").trim();
    const noteRaw =
      typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    if (!noteRaw) {
      return NextResponse.json(
        { error: "note is required for manual lunch actions." },
        { status: 400 },
      );
    }
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId required." }, { status: 400 });
    }
    const { data: open } = await supabase
      .from("time_punches")
      .select("id,on_lunch,job_id,gps_location_flagged")
      .eq("employee_id", employeeId)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!open) {
      return NextResponse.json({ error: "No open punch." }, { status: 400 });
    }
    if (open.on_lunch) {
      return NextResponse.json({ error: "Already on lunch." }, { status: 400 });
    }
    const atIso =
      typeof body.at === "string" && body.at.trim()
        ? new Date(body.at.trim()).toISOString()
        : now;
    const jid = (open.job_id as string | null) ?? null;
    const { snapshot: lsLoc, flagged: lsFlag } =
      await resolvePunchGpsForJob(supabase, jid, coords);
    const prevFlag = Boolean(open.gps_location_flagged);
    const { error: upErr } = await supabase
      .from("time_punches")
      .update({
        on_lunch: true,
        lunch_start_at: atIso,
        lunch_end_at: null,
        updated_at: now,
        lunch_start_location: lsLoc,
        gps_location_flagged: prevFlag || lsFlag,
      })
      .eq("id", open.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    await insertAudit(supabase, {
      time_punch_id: open.id as string,
      actor_id: user.id,
      action: "manual_start_lunch",
      reason: noteRaw,
      metadata: { employeeId, lunch_start_at: atIso },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "manual_end_lunch") {
    const employeeId = String(body.employeeId ?? "").trim();
    const noteRaw =
      typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    if (!noteRaw) {
      return NextResponse.json(
        { error: "note is required for manual lunch actions." },
        { status: 400 },
      );
    }
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId required." }, { status: 400 });
    }
    const { data: open } = await supabase
      .from("time_punches")
      .select(
        "id,on_lunch,lunch_start_at,total_lunch_ms,job_id,gps_location_flagged",
      )
      .eq("employee_id", employeeId)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!open || !open.on_lunch || !open.lunch_start_at) {
      return NextResponse.json({ error: "Not on lunch." }, { status: 400 });
    }
    const atIso =
      typeof body.at === "string" && body.at.trim()
        ? new Date(body.at.trim()).toISOString()
        : now;
    const atMs = new Date(atIso).getTime();
    const ls = new Date(open.lunch_start_at as string).getTime();
    const segment = Math.max(0, atMs - ls);
    const prev = Number(open.total_lunch_ms) || 0;
    const jid = (open.job_id as string | null) ?? null;
    const { snapshot: leLoc, flagged: leFlag } =
      await resolvePunchGpsForJob(supabase, jid, coords);
    const prevFlag = Boolean(open.gps_location_flagged);
    const { error: upErr } = await supabase
      .from("time_punches")
      .update({
        on_lunch: false,
        lunch_end_at: atIso,
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
    await insertAudit(supabase, {
      time_punch_id: open.id as string,
      actor_id: user.id,
      action: "manual_end_lunch",
      reason: noteRaw,
      metadata: { employeeId, lunch_end_at: atIso },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "manual_punch_out") {
    const employeeId = String(body.employeeId ?? "").trim();
    const noteRaw =
      typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    if (!noteRaw) {
      return NextResponse.json(
        { error: "note is required for manual punches." },
        { status: 400 },
      );
    }
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId required." }, { status: 400 });
    }
    const { data: row } = await supabase
      .from("time_punches")
      .select(
        "id,punch_in_at,job_id,job_name,on_lunch,lunch_start_at,total_lunch_ms,gps_location_flagged",
      )
      .eq("employee_id", employeeId)
      .is("punch_out_at", null)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "No open punch." }, { status: 400 });
    }
    const atIso =
      typeof body.punchOutAt === "string" && body.punchOutAt.trim()
        ? new Date(body.punchOutAt.trim()).toISOString()
        : now;
    const outMs = new Date(atIso).getTime();

    let totalLunchMs = Number(row.total_lunch_ms) || 0;
    if (row.on_lunch && row.lunch_start_at) {
      const ls = new Date(row.lunch_start_at as string).getTime();
      totalLunchMs += Math.max(0, outMs - ls);
    }

    const punchInMs = new Date(row.punch_in_at as string).getTime();
    const grossMs = Math.max(0, outMs - punchInMs);
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
        punch_out_at: atIso,
        on_lunch: false,
        lunch_start_at: null,
        total_lunch_ms: totalLunchMs,
        updated_at: now,
        approval_status: "pending",
        approved_by: null,
        approved_at: null,
        punch_out_location: poutLoc,
        gps_location_flagged: prevFlag || poutFlag,
        is_manual_entry: true,
        manual_entry_by: user.id,
        manual_entry_at: now,
        manual_entry_note: noteRaw || null,
      })
      .eq("id", row.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    await insertAudit(supabase, {
      time_punch_id: row.id as string,
      actor_id: user.id,
      action: "manual_punch_out",
      reason: noteRaw || null,
      metadata: { employeeId, punch_out_at: atIso },
    });

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
        punchOutAt: atIso,
        logDate: formatDateYmd(new Date(outMs)),
        checkIn: toHhMmLocal(row.punch_in_at as string),
        checkOut: toHhMmLocal(atIso),
      },
    });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
