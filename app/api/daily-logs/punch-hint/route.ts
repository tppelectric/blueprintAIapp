import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function localDayBoundsIso(dateYmd: string): { from: string; to: string } | null {
  const p = dateYmd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = p;
  const start = new Date(y!, m! - 1, d!, 0, 0, 0, 0);
  const end = new Date(y!, m! - 1, d! + 1, 0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

function toHhMm(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local wall time for HTML time input / daily_logs.check_in. */
function isoToLocalTimeDb(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const h = t.getHours();
  const m = t.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Completed punch for the signed-in user on a calendar day (local). */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateYmd = url.searchParams.get("date")?.trim() ?? "";
  const bounds = localDayBoundsIso(dateYmd);
  if (!bounds) {
    return NextResponse.json(
      { error: "Query ?date=YYYY-MM-DD required." },
      { status: 400 },
    );
  }

  const { data: row, error } = await supabase
    .from("time_punches")
    .select("id,job_id,job_name,punch_in_at,punch_out_at")
    .eq("employee_id", user.id)
    .not("punch_out_at", "is", null)
    .gte("punch_in_at", bounds.from)
    .lt("punch_in_at", bounds.to)
    .order("punch_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!row?.punch_out_at) {
    return NextResponse.json({ found: false });
  }

  const pin = row.punch_in_at as string;
  const pout = row.punch_out_at as string;
  return NextResponse.json({
    found: true,
    punchId: row.id as string,
    jobId: (row.job_id as string | null) ?? null,
    jobName: (row.job_name as string | null)?.trim() || "—",
    punchInAt: pin,
    punchOutAt: pout,
    checkInLabel: toHhMm(pin),
    checkOutLabel: toHhMm(pout),
    checkInDb: isoToLocalTimeDb(pin),
    checkOutDb: isoToLocalTimeDb(pout),
  });
}
