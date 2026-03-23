import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  let body: { itemId?: string; choice?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  const choice = body.choice;
  if (!itemId) {
    return NextResponse.json({ error: "itemId required." }, { status: 400 });
  }
  if (choice !== "claude" && choice !== "gpt") {
    return NextResponse.json({ error: "choice must be claude or gpt." }, { status: 400 });
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
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const { data: siblings, error: sibErr } = await supabase
    .from("electrical_items")
    .select("id, quantity, description")
    .eq("project_id", row.project_id)
    .eq("page_number", row.page_number)
    .eq("description", row.description);

  if (sibErr || !siblings?.length) {
    return NextResponse.json({ error: sibErr?.message ?? "No siblings." }, { status: 500 });
  }

  const sumQ = siblings.reduce((s, x) => s + Number(x.quantity), 0);
  const gptRaw = row.gpt_count != null ? Number(row.gpt_count) : null;
  const updated: unknown[] = [];

  for (const s of siblings) {
    let final_count: number;
    if (choice === "claude") {
      final_count = Math.round(Number(s.quantity));
    } else {
      if (gptRaw != null && sumQ > 0) {
        final_count = Math.max(
          0,
          Math.round((gptRaw * Number(s.quantity)) / sumQ),
        );
      } else {
        final_count = Math.round(Number(s.quantity));
      }
    }

    const { data, error } = await supabase
      .from("electrical_items")
      .update({
        final_count,
        verification_status: "confirmed",
        verified_by: "resolve",
      })
      .eq("id", s.id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) updated.push(data);
  }

  return NextResponse.json({ items: updated });
}
