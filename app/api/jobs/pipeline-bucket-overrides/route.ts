import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { PipelineCountBucket } from "@/lib/pipeline-bucket-config";
import { PIPELINE_BUCKET_OPTIONS } from "@/lib/pipeline-bucket-config";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<PipelineCountBucket>(
  PIPELINE_BUCKET_OPTIONS.map((o) => o.id),
);

type AdminGate =
  | { admin: ReturnType<typeof createServiceRoleClient>; userId: string }
  | { error: NextResponse };

async function requireSuperAdminApi(request: NextRequest): Promise<AdminGate> {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return {
      error: NextResponse.json(
        { error: e instanceof Error ? e.message : "Server error." },
        { status: 500 },
      ),
    };
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || profile.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  return { admin, userId: user.id };
}

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdminApi(request);
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  const { data, error } = await admin
    .from("pipeline_bucket_overrides")
    .select("id, need_ready_to_invoice_value, bucket, created_at")
    .order("need_ready_to_invoice_value", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, overrides: data ?? [] });
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdminApi(request);
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const assignments = (body as { assignments?: unknown }).assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json(
      { error: "assignments must be a non-empty array." },
      { status: 400 },
    );
  }

  const rows: {
    need_ready_to_invoice_value: string;
    bucket: PipelineCountBucket;
  }[] = [];

  for (const item of assignments) {
    const rec = item as {
      need_ready_to_invoice_value?: unknown;
      bucket?: unknown;
    };
    const value = String(rec.need_ready_to_invoice_value ?? "").trim();
    const bucket = rec.bucket as PipelineCountBucket;
    if (!value || !ALLOWED.has(bucket)) {
      return NextResponse.json(
        { error: "Each assignment needs a value and valid bucket." },
        { status: 400 },
      );
    }
    rows.push({ need_ready_to_invoice_value: value, bucket });
  }

  const { error } = await admin.from("pipeline_bucket_overrides").upsert(rows, {
    onConflict: "need_ready_to_invoice_value",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.length });
}
