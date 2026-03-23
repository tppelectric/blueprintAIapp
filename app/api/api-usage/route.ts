import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ScanModeId } from "@/lib/scan-modes";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SCAN_TYPES = new Set<ScanModeId>([
  "quick",
  "standard",
  "deep",
  "manual",
]);

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    pageNumber?: number;
    scanType?: string;
    claudeCost?: number;
    openaiCost?: number;
    totalCost?: number;
    pagesAnalyzed?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  const scanType = body.scanType?.trim().toLowerCase();
  if (!scanType || !SCAN_TYPES.has(scanType as ScanModeId)) {
    return NextResponse.json({ error: "Invalid scanType." }, { status: 400 });
  }
  const pageNumber = body.pageNumber;
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return NextResponse.json(
      { error: "pageNumber must be a positive integer." },
      { status: 400 },
    );
  }

  const claudeCost = Number(body.claudeCost ?? 0);
  const openaiCost = Number(body.openaiCost ?? 0);
  const totalCost =
    body.totalCost != null ? Number(body.totalCost) : claudeCost + openaiCost;
  const pagesAnalyzed =
    typeof body.pagesAnalyzed === "number" && body.pagesAnalyzed >= 1
      ? Math.floor(body.pagesAnalyzed)
      : 1;

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Supabase service client is not configured.",
      },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("api_usage")
    .insert({
      project_id: projectId,
      page_number: pageNumber,
      scan_type: scanType,
      claude_cost: claudeCost,
      openai_cost: openaiCost,
      total_cost: totalCost,
      pages_analyzed: pagesAnalyzed,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[api-usage POST]", error.message, error.code);
    return NextResponse.json(
      { error: error.message, hint: "Ensure api_usage table exists (see supabase/api_usage.sql)." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();
  const scope = searchParams.get("scope")?.trim();

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Supabase service client is not configured.",
      },
      { status: 500 },
    );
  }

  if (scope === "month") {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const { data, error } = await supabase
      .from("api_usage")
      .select("total_cost, pages_analyzed, created_at")
      .gte("created_at", start.toISOString());

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = data ?? [];
    const totalCost = rows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
    const pages = rows.reduce((s, r) => s + Number(r.pages_analyzed ?? 1), 0);
    return NextResponse.json({
      totalCost,
      pagesAnalyzed: pages,
      monthLabel: start.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      }),
    });
  }

  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json(
      { error: "Invalid or missing projectId (or use scope=month)." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("api_usage")
    .select("total_cost, pages_analyzed")
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = data ?? [];
  const totalCost = rows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
  const pages = rows.reduce((s, r) => s + Number(r.pages_analyzed ?? 1), 0);

  return NextResponse.json({ totalCost, pagesAnalyzed: pages });
}
