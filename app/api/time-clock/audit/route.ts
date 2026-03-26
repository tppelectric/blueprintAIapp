import { NextResponse } from "next/server";
import {
  completedPunchWorkedMs,
  hoursFromMs,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";
import { requireCompanyAdmin } from "@/lib/require-company-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

type PunchRow = {
  id: string;
  employee_id: string;
  job_id: string | null;
  job_name: string | null;
  punch_in_at: string;
  punch_out_at: string | null;
  total_lunch_ms: number;
  on_lunch: boolean;
  lunch_start_at: string | null;
  notes: string | null;
  approval_status: string | null;
  approved_at: string | null;
  approved_by: string | null;
  discrepancy_flag: boolean;
  discrepancy_note: string | null;
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

function csvCell(v: string | number | boolean | null | undefined): string {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "boolean"
        ? v
          ? "true"
          : "false"
        : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function workedHoursForRow(r: PunchRow, nowMs: number): number {
  if (r.punch_out_at) {
    const ms = completedPunchWorkedMs(
      r.punch_in_at,
      r.punch_out_at,
      Number(r.total_lunch_ms) || 0,
    );
    return hoursFromMs(ms);
  }
  const ms = workedMsFromPunch(
    {
      punch_in_at: r.punch_in_at,
      on_lunch: r.on_lunch,
      lunch_start_at: r.lunch_start_at,
      total_lunch_ms: Number(r.total_lunch_ms) || 0,
    },
    nowMs,
  );
  return hoursFromMs(ms);
}

function lunchMinutesRow(r: PunchRow, nowMs: number): number {
  let ms = Math.max(0, Number(r.total_lunch_ms) || 0);
  if (!r.punch_out_at && r.on_lunch && r.lunch_start_at) {
    const ls = new Date(r.lunch_start_at).getTime();
    if (!Number.isNaN(ls)) ms += Math.max(0, nowMs - ls);
  }
  return Math.round(ms / 60000);
}

export async function GET(request: Request) {
  const auth = await requireCompanyAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  const employeeId = url.searchParams.get("employeeId")?.trim() || null;
  const format = url.searchParams.get("format")?.trim().toLowerCase();

  if (!from || !to) {
    return NextResponse.json(
      { error: "Query params from and to (ISO) are required." },
      { status: 400 },
    );
  }
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 },
    );
  }

  let q = admin
    .from("time_punches")
    .select(
      "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,total_lunch_ms,on_lunch,lunch_start_at,notes,approval_status,approved_at,approved_by,discrepancy_flag,discrepancy_note",
    )
    .gte("punch_in_at", from)
    .lt("punch_in_at", to)
    .order("punch_in_at", { ascending: false });

  if (employeeId) {
    q = q.eq("employee_id", employeeId);
  }

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as PunchRow[];
  const ids = [...new Set(list.map((r) => r.employee_id))];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin
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

  const nowMs = Date.now();
  const enriched = list.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: nameById.get(r.employee_id) ?? "—",
    jobId: r.job_id,
    jobName: (r.job_name ?? "").trim() || "—",
    punchInAt: r.punch_in_at,
    punchOutAt: r.punch_out_at,
    workedHours: Math.round(workedHoursForRow(r, nowMs) * 100) / 100,
    lunchMinutes: lunchMinutesRow(r, nowMs),
    approvalStatus: r.approval_status,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    discrepancyFlag: Boolean(r.discrepancy_flag),
    discrepancyNote: r.discrepancy_note,
    isOpen: !r.punch_out_at,
    notes: r.notes,
  }));

  if (format === "csv") {
    const header = [
      "employee_name",
      "employee_id",
      "job",
      "punch_in",
      "punch_out",
      "worked_hours",
      "lunch_minutes",
      "approval_status",
      "discrepancy_flag",
      "discrepancy_note",
      "notes",
    ];
    const lines = [
      header.join(","),
      ...enriched.map((e) =>
        [
          csvCell(e.employeeName),
          csvCell(e.employeeId),
          csvCell(e.jobName),
          csvCell(e.punchInAt),
          csvCell(e.punchOutAt ?? ""),
          csvCell(e.workedHours),
          csvCell(e.lunchMinutes),
          csvCell(e.approvalStatus ?? ""),
          csvCell(e.discrepancyFlag),
          csvCell(e.discrepancyNote ?? ""),
          csvCell(e.notes ?? ""),
        ].join(","),
      ),
    ];
    return new NextResponse(lines.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="time-punches-${from.slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ punches: enriched });
}

export async function PATCH(request: Request) {
  const auth = await requireCompanyAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: {
    punchId?: string;
    approvalStatus?: "pending" | "approved" | "rejected";
    discrepancyFlag?: boolean;
    discrepancyNote?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const punchId = body.punchId?.trim();
  if (!punchId) {
    return NextResponse.json({ error: "punchId required." }, { status: 400 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 },
    );
  }

  const { data: row, error: fetchErr } = await admin
    .from("time_punches")
    .select("id,punch_out_at")
    .eq("id", punchId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Punch not found." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.approvalStatus !== undefined) {
    if (!row.punch_out_at) {
      return NextResponse.json(
        { error: "Cannot set approval on an open punch." },
        { status: 400 },
      );
    }
    if (
      body.approvalStatus !== "pending" &&
      body.approvalStatus !== "approved" &&
      body.approvalStatus !== "rejected"
    ) {
      return NextResponse.json({ error: "Invalid approvalStatus." }, { status: 400 });
    }
    patch.approval_status = body.approvalStatus;
    if (body.approvalStatus === "approved") {
      patch.approved_by = auth.userId;
      patch.approved_at = new Date().toISOString();
    } else {
      patch.approved_by = null;
      patch.approved_at = null;
    }
  }

  if (body.discrepancyFlag !== undefined) {
    patch.discrepancy_flag = Boolean(body.discrepancyFlag);
  }
  if (body.discrepancyNote !== undefined) {
    const n =
      typeof body.discrepancyNote === "string"
        ? body.discrepancyNote.trim().slice(0, 2000)
        : "";
    patch.discrepancy_note = n || null;
  }

  const { error: upErr } = await admin
    .from("time_punches")
    .update(patch)
    .eq("id", punchId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
