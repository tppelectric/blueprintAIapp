import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: { itemId?: string; whichRoom?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  const whichRoom = body.whichRoom?.trim();
  if (!itemId || !uuidRe.test(itemId)) {
    return NextResponse.json({ error: "Invalid itemId." }, { status: 400 });
  }
  if (!whichRoom) {
    return NextResponse.json({ error: "whichRoom is required." }, { status: 400 });
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

  const { data: updated, error } = await supabase
    .from("electrical_items")
    .update({ which_room: whichRoom, user_edited: true })
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[assign-room]", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}
