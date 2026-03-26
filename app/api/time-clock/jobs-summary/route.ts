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

function jobKey(id: string | null, name: string | null): {
  key: string;
  label: string;
} {
  const label = (name ?? "").trim() || "—";
  return { key: id ?? `__noname__:${label}`, label };
}

export async function GET(request: Request) {
  const auth = await requireCompanyAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();

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

  const nowMs = Date.now();

  const { data: inRange, error: e1 } = await admin
    .from("time_punches")
    .select(
      "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,total_lunch_ms,on_lunch,lunch_start_at",
    )
    .gte("punch_in_at", from)
    .lt("punch_in_at", to);

  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  const { data: openRows, error: e2 } = await admin
    .from("time_punches")
    .select(
      "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,total_lunch_ms,on_lunch,lunch_start_at",
    )
    .is("punch_out_at", null);

  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  const hoursMap = new Map<
    string,
    { jobId: string | null; jobName: string; hours: number }
  >();

  for (const r of (inRange ?? []) as PunchRow[]) {
    const { key, label } = jobKey(r.job_id, r.job_name);
    const h = workedHoursForRow(r, nowMs);
    const prev = hoursMap.get(key);
    if (prev) {
      prev.hours = Math.round((prev.hours + h) * 100) / 100;
    } else {
      hoursMap.set(key, {
        jobId: r.job_id,
        jobName: label,
        hours: Math.round(h * 100) / 100,
      });
    }
  }

  const onSiteMap = new Map<
    string,
    { jobId: string | null; jobName: string; workers: Set<string> }
  >();

  for (const r of (openRows ?? []) as PunchRow[]) {
    const { key, label } = jobKey(r.job_id, r.job_name);
    let bucket = onSiteMap.get(key);
    if (!bucket) {
      bucket = { jobId: r.job_id, jobName: label, workers: new Set() };
      onSiteMap.set(key, bucket);
    }
    bucket.workers.add(r.employee_id);
  }

  const allIds = new Set<string>();
  for (const r of (openRows ?? []) as PunchRow[]) {
    allIds.add(r.employee_id);
  }

  const nameById = new Map<string, string>();
  if (allIds.size) {
    const { data: profs } = await admin
      .from("user_profiles")
      .select("id,first_name,last_name,full_name,email")
      .in("id", [...allIds]);
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

  const keys = new Set([...hoursMap.keys(), ...onSiteMap.keys()]);
  const jobs = [...keys].map((key) => {
    const h = hoursMap.get(key);
    const o = onSiteMap.get(key);
    const workerIds = o ? [...o.workers] : [];
    return {
      jobId: h?.jobId ?? o?.jobId ?? null,
      jobName: h?.jobName ?? o?.jobName ?? "—",
      hoursInRange: h?.hours ?? 0,
      currentlyOnSite: workerIds.map((id) => ({
        employeeId: id,
        name: nameById.get(id) ?? "—",
      })),
    };
  });

  jobs.sort((x, y) => y.hoursInRange - x.hoursInRange);

  return NextResponse.json({ jobs });
}
