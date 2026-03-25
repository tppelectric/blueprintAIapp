import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Records a plan-scan import in `job_attachments` (requires `scan_library_system.sql`).
 */
export async function recordPlanScanImport(params: {
  blueprintProjectId: string;
  toolSlug: string;
  importSummary: Record<string, unknown>;
  jobId?: string | null;
}): Promise<void> {
  try {
    const sb = createBrowserClient();
    const attachmentId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `import-${Date.now()}`;
    const { error } = await sb.from("job_attachments").insert({
      job_id: params.jobId ?? null,
      attachment_type: "plan_scan_import",
      attachment_id: attachmentId,
      label: `Import: ${params.toolSlug}`,
      blueprint_project_id: params.blueprintProjectId,
      tool_slug: params.toolSlug,
      import_summary: params.importSummary,
    } as Record<string, unknown>);
    if (error) console.warn("[plan-scan-import]", error.message);
  } catch (e) {
    console.warn("[plan-scan-import]", e);
  }
}
