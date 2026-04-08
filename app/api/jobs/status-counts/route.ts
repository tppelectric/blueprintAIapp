import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error." }, { status: 500 });
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !["admin", "super_admin"].includes(profile.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: rows, error: jobsError } = await admin
    .from("jobs")
    .select("need_ready_to_invoice");

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const counts = {
    ready_to_invoice: 0,
    in_progress: 0,
    invoiced: 0,
    paid: 0,
    on_hold: 0,
    needs_update: 0,
  };

  const READY = new Set(["YES, READY TO BE INVOICED"]);
  const IN_PROGRESS = new Set([
    "NEW JOB/JUST STARTED",
    "NO, JOB STILL IN PROGRESS",
    "IN PROGRESS",
    "ESTIMATING",
  ]);
  const INVOICED = new Set([
    "INVOICED/SENT",
    "PARTIAL/PROGRESS PAYMENT RECEIVED",
    "DOCUMENT MADE/NEEDS REVIEW BEFORE SENDING",
  ]);
  const PAID = new Set(["PAID", "BARTERED WORK"]);
  const ON_HOLD = new Set([
    "ON HOLD/WAITING FOR MATERIAL",
    "ON HOLD/WAITING FOR APPROVAL",
  ]);

  for (const row of rows ?? []) {
    const v = (row as { need_ready_to_invoice: string | null }).need_ready_to_invoice;
    if (!v) { counts.needs_update++; continue; }
    const u = v.trim().toUpperCase();
    if (READY.has(u)) counts.ready_to_invoice++;
    else if (IN_PROGRESS.has(u)) counts.in_progress++;
    else if (INVOICED.has(u)) counts.invoiced++;
    else if (PAID.has(u)) counts.paid++;
    else if (ON_HOLD.has(u)) counts.on_hold++;
    else counts.needs_update++;
  }

  return NextResponse.json({ ok: true, counts });
}
