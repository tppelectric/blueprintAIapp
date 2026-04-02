import { JobDetailClient } from "./job-detail-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobCrewAssignmentRow } from "@/lib/jobs-types";

async function loadJobCrewAssignments(
  jobId: string,
): Promise<JobCrewAssignmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_assignments")
    .select(
      "user_id, assigned_at, notes, user_profiles!job_assignments_user_id_fkey ( full_name, first_name, last_name, email, role )",
    )
    .eq("job_id", jobId)
    .order("assigned_at", { ascending: true });

  if (error) {
    console.error("[job detail] job_assignments", error.message);
    return [];
  }

  return (data ?? []) as JobCrewAssignmentRow[];
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const crewAssignments = await loadJobCrewAssignments(id);
  return (
    <JobDetailClient jobId={id} initialCrewAssignments={crewAssignments} />
  );
}
