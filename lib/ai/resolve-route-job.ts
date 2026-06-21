import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatJobTagLabel,
  jobTagStorageId,
  type JobPickerRow,
} from "@/lib/ai/job-tag";

const JOB_PICKER_SELECT =
  "id,jobtread_id,job_name,job_number,status,job_type,address,city,state,zip,customers(company_name,contact_name)";

export type ResolvedRouteJob = {
  storageId: string;
  label: string;
  jobsUuid: string;
  row: JobPickerRow;
};

export function parseJobRoute(
  pathname: string,
):
  | { kind: "job"; jobUuid: string }
  | { kind: "project"; projectUuid: string }
  | null {
  const parts = pathname.split("/").filter(Boolean);
  if (
    pathname.startsWith("/jobs/") &&
    pathname !== "/jobs/daily-logs" &&
    !pathname.startsWith("/jobs/daily-logs/")
  ) {
    const id = parts[1];
    if (id) return { kind: "job", jobUuid: id };
  }
  if (pathname.startsWith("/project/")) {
    const id = parts[1];
    if (id) return { kind: "project", projectUuid: id };
  }
  return null;
}

export function isJobPagePathname(pathname: string): boolean {
  return parseJobRoute(pathname) !== null;
}

function toResolved(job: JobPickerRow): ResolvedRouteJob {
  return {
    storageId: jobTagStorageId(job),
    label: formatJobTagLabel(job),
    jobsUuid: job.id,
    row: job,
  };
}

async function resolveProjectJobId(
  sb: SupabaseClient,
  projectUuid: string,
): Promise<string | null> {
  const { data: byColumn } = await sb
    .from("job_attachments")
    .select("job_id")
    .eq("blueprint_project_id", projectUuid)
    .not("job_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byColumn?.job_id) return byColumn.job_id as string;

  const { data: byAttachment } = await sb
    .from("job_attachments")
    .select("job_id")
    .eq("attachment_type", "blueprint_project")
    .eq("attachment_id", projectUuid)
    .not("job_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byAttachment?.job_id ? (byAttachment.job_id as string) : null;
}

export async function resolveJobForAutoTag(
  sb: SupabaseClient,
  pathname: string,
): Promise<ResolvedRouteJob | null> {
  const route = parseJobRoute(pathname);
  if (!route) return null;

  if (route.kind === "job") {
    const { data } = await sb
      .from("jobs")
      .select(JOB_PICKER_SELECT)
      .eq("id", route.jobUuid)
      .maybeSingle();
    return data ? toResolved(data as JobPickerRow) : null;
  }

  const jobId = await resolveProjectJobId(sb, route.projectUuid);
  if (!jobId) return null;

  const { data: job } = await sb
    .from("jobs")
    .select(JOB_PICKER_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  return job ? toResolved(job as JobPickerRow) : null;
}
