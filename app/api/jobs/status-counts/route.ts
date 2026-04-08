import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  bucketForValue,
  normalizeInvoiceStatus,
  PIPELINE_BUCKET_OPTIONS,
  type PipelineCountBucket,
} from "@/lib/pipeline-bucket-config";

export const dynamic = "force-dynamic";

const VALID_BUCKETS = new Set<PipelineCountBucket>(
  PIPELINE_BUCKET_OPTIONS.map((o) => o.id),
);

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !["admin", "super_admin"].includes(profile.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const overrideNormToBucket = new Map<string, PipelineCountBucket>();

  const { data: overrideRows, error: overrideError } = await admin
    .from("pipeline_bucket_overrides")
    .select("need_ready_to_invoice_value, bucket");

  if (overrideError) {
    console.error("[status-counts] pipeline_bucket_overrides:", overrideError.message);
  } else {
    for (const r of overrideRows ?? []) {
      const row = r as {
        need_ready_to_invoice_value: string;
        bucket: string;
      };
      const v = row.need_ready_to_invoice_value?.trim();
      if (!v) continue;
      const b = row.bucket as PipelineCountBucket;
      if (!VALID_BUCKETS.has(b)) continue;
      overrideNormToBucket.set(normalizeInvoiceStatus(v), b);
    }
  }

  const { data: rows, error: jobsError } = await admin
    .from("jobs")
    .select("need_ready_to_invoice");

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const counts: Record<PipelineCountBucket, number> = {
    ready_to_invoice: 0,
    in_progress: 0,
    invoiced: 0,
    paid: 0,
    on_hold: 0,
    needs_update: 0,
  };

  for (const row of rows ?? []) {
    const v = (row as { need_ready_to_invoice: string | null })
      .need_ready_to_invoice;
    const bucket = bucketForValue(v, overrideNormToBucket);
    counts[bucket] += 1;
  }

  return NextResponse.json({ ok: true, counts });
}
