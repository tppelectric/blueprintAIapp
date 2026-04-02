import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";

const CATEGORIES = new Set(["fixture", "panel", "wiring", "plan_note"]);

export const POST = withAuth(async (request: NextRequest, _ctx) => {
  let body: {
    itemId?: string;
    description?: string;
    category?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  const description = body.description?.trim();
  const category = body.category?.toLowerCase().trim();

  if (!itemId) {
    return NextResponse.json({ error: "itemId required." }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "description required." }, { status: 400 });
  }
  if (!category || !CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
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

  const { data: row, error: fetchErr } = await supabase
    .from("electrical_items")
    .select("id, project_id, page_number, description, category")
    .eq("id", itemId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const origDesc = String(row.description ?? "");
  const origCat = String(row.category ?? "");

  if (origDesc === description && origCat === category) {
    const { data: unchanged } = await supabase
      .from("electrical_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();
    return NextResponse.json({ item: unchanged });
  }

  const { error: logErr } = await supabase.from("symbol_corrections").insert({
    original_description: origDesc,
    corrected_description: description,
    original_category: origCat,
    corrected_category: category,
    project_id: row.project_id,
    page_number: row.page_number,
  });

  if (logErr) {
    return NextResponse.json(
      { error: logErr.message, hint: "Ensure symbol_corrections table exists." },
      { status: 500 },
    );
  }

  const { data: updated, error: updErr } = await supabase
    .from("electrical_items")
    .update({
      description,
      category,
      user_edited: true,
    })
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ item: updated });
});
