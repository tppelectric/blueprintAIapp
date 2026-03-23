import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Estimator accepts the line item — locks final_count to Claude quantity. */
export async function POST(request: Request) {
  let body: { itemId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return NextResponse.json({ error: "itemId required." }, { status: 400 });
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
    .select("id, quantity")
    .eq("id", itemId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const final_count = Math.round(Number(row.quantity));

  const { data, error } = await supabase
    .from("electrical_items")
    .update({
      final_count,
      verification_status: "confirmed",
      verified_by: "accept",
    })
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
