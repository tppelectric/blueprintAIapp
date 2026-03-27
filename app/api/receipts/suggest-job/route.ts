import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Suggest a job for a new receipt: open punch today → job_id + job label.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("show_punch_interface")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.show_punch_interface) {
    return NextResponse.json({ suggested: null });
  }

  const { data: open } = await supabase
    .from("time_punches")
    .select("id, job_id, job_name, punch_in_at, punch_out_at")
    .eq("employee_id", user.id)
    .is("punch_out_at", null)
    .order("punch_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open?.job_id) {
    return NextResponse.json({
      suggested: open?.job_name
        ? { jobId: null as string | null, jobName: open.job_name as string }
        : null,
    });
  }

  const jobId = open.job_id as string;
  let jobName = (open.job_name as string | null)?.trim() || "";

  if (!jobName) {
    const { data: j } = await supabase
      .from("jobs")
      .select("job_name, job_number")
      .eq("id", jobId)
      .maybeSingle();
    if (j) {
      const num = String(j.job_number ?? "").trim();
      const nm = String(j.job_name ?? "").trim();
      jobName = num && nm ? `${num} · ${nm}` : num || nm || jobId;
    }
  }

  return NextResponse.json({
    suggested: {
      jobId,
      jobName: jobName || "Current job",
    },
  });
}
