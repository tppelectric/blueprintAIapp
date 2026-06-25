import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { completedPunchWorkedMs, hoursFromMs } from "@/lib/time-punch-worked";

export const dynamic = "force-dynamic";

/** Calendar date (YYYY-MM-DD) of a timestamp, server-local. */
function dateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Schedule reconciliation for a date range: Scheduled (schedule_assignments)
 * vs Actual (completed time_punches), per employee per day, with variance.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to (YYYY-MM-DD) are required." },
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

  const fromStart = new Date(`${from}T00:00:00`).toISOString();
  const toExclusive = (() => {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  })();

  const [assignsRes, punchesRes] = await Promise.all([
    admin
      .from("schedule_assignments")
      .select("employee_id,employee_name,job_name,schedule_date")
      .gte("schedule_date", from)
      .lte("schedule_date", to),
    admin
      .from("time_punches")
      .select("employee_id,punch_in_at,punch_out_at,total_lunch_ms,job_name")
      .gte("punch_in_at", fromStart)
      .lt("punch_in_at", toExclusive),
  ]);

  if (assignsRes.error) {
    return NextResponse.json({ error: assignsRes.error.message }, { status: 500 });
  }
  if (punchesRes.error) {
    return NextResponse.json({ error: punchesRes.error.message }, { status: 500 });
  }

  const assigns = assignsRes.data ?? [];
  const punches = punchesRes.data ?? [];

  // Resolve employee names (schedule rows carry a name; punch-only employees need a lookup).
  const nameById = new Map<string, string>();
  const ids = new Set<string>();
  for (const a of assigns) {
    const id = a.employee_id as string | null;
    if (id) {
      ids.add(id);
      const nm = (a.employee_name as string | null)?.trim();
      if (nm) nameById.set(id, nm);
    }
  }
  for (const p of punches) {
    const id = p.employee_id as string | null;
    if (id) ids.add(id);
  }
  if (ids.size) {
    const { data: profs } = await admin
      .from("user_profiles")
      .select("id,first_name,last_name,full_name,email")
      .in("id", [...ids]);
    for (const p of profs ?? []) {
      const f = (p.first_name as string | null)?.trim() ?? "";
      const l = (p.last_name as string | null)?.trim() ?? "";
      const nm =
        f || l
          ? [f, l].filter(Boolean).join(" ")
          : ((p.full_name as string | null)?.trim() ||
            (p.email as string | null)?.trim() ||
            "—");
      nameById.set(p.id as string, nm);
    }
  }

  type Cell = { scheduledJob: string | null; actualMs: number };
  const cells = new Map<string, Cell>();
  const key = (e: string, d: string) => `${e}|${d}`;

  for (const a of assigns) {
    const id = a.employee_id as string | null;
    const date = a.schedule_date as string;
    if (!id || !date) continue;
    const k = key(id, date);
    const c = cells.get(k) ?? { scheduledJob: null, actualMs: 0 };
    c.scheduledJob = (a.job_name as string | null) ?? "Scheduled";
    cells.set(k, c);
  }
  for (const p of punches) {
    const id = p.employee_id as string | null;
    const pin = p.punch_in_at as string | null;
    const pout = p.punch_out_at as string | null;
    if (!id || !pin || !pout) continue; // completed punches only carry hours
    const k = key(id, dateOf(pin));
    const c = cells.get(k) ?? { scheduledJob: null, actualMs: 0 };
    c.actualMs += completedPunchWorkedMs(
      pin,
      pout,
      Number(p.total_lunch_ms) || 0,
    );
    cells.set(k, c);
  }

  const rows = [...cells.entries()]
    .map(([k, c]) => {
      const [employeeId, date] = k.split("|");
      const actualHours = c.actualMs > 0 ? hoursFromMs(c.actualMs) : 0;
      const status =
        c.scheduledJob && actualHours > 0
          ? "matched"
          : c.scheduledJob
            ? "no_show"
            : "unscheduled";
      return {
        employeeId,
        employeeName: nameById.get(employeeId) ?? "—",
        date,
        scheduledJob: c.scheduledJob,
        actualHours,
        status,
      };
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.employeeName.localeCompare(b.employeeName),
    );

  return NextResponse.json({ rows });
}
