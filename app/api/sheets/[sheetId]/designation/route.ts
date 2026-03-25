import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { TRADE_SLUGS, type TradeDesignationSlug } from "@/lib/sheet-trade-designation";

const ALLOWED = new Set<string>(TRADE_SLUGS);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ sheetId: string }> },
) {
  const { sheetId } = await ctx.params;
  if (!sheetId?.trim()) {
    return NextResponse.json({ error: "sheetId required." }, { status: 400 });
  }

  let body: { pageIndex?: number; trade_designation?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const pageIndex = body.pageIndex;
  if (
    typeof pageIndex !== "number" ||
    !Number.isFinite(pageIndex) ||
    pageIndex < 1
  ) {
    return NextResponse.json(
      { error: "pageIndex must be a positive integer." },
      { status: 400 },
    );
  }

  const designation = body.trade_designation;
  if (
    designation != null &&
    (typeof designation !== "string" || !ALLOWED.has(designation))
  ) {
    return NextResponse.json(
      { error: "Invalid trade_designation slug." },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase not configured." },
      { status: 500 },
    );
  }

  const { data: sheet, error: fetchErr } = await supabase
    .from("sheets")
    .select("id, trade_designation")
    .eq("id", sheetId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!sheet) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }

  const cur =
    (sheet.trade_designation as Record<string, string> | null) ?? {};
  const next: Record<string, string> = { ...cur };
  const key = String(pageIndex);
  if (designation === null || designation === "") {
    delete next[key];
  } else {
    next[key] = designation as TradeDesignationSlug;
  }

  const { error: upErr } = await supabase
    .from("sheets")
    .update({ trade_designation: next })
    .eq("id", sheetId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, trade_designation: next });
}
