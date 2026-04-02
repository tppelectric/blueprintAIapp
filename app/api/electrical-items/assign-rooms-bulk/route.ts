import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ITEMS = 200;

export const POST = withAuth(async (request: NextRequest, _ctx) => {
  let body: { itemIds?: string[]; whichRoom?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const rawIds = body.itemIds;
  const whichRoom = body.whichRoom?.trim();
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: "itemIds must be a non-empty array." },
      { status: 400 },
    );
  }
  if (rawIds.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `At most ${MAX_ITEMS} items per request.` },
      { status: 400 },
    );
  }
  if (!whichRoom) {
    return NextResponse.json({ error: "whichRoom is required." }, { status: 400 });
  }

  const itemIds = [...new Set(rawIds.map((id) => String(id ?? "").trim()))].filter(
    (id) => uuidRe.test(id),
  );
  if (itemIds.length === 0) {
    return NextResponse.json({ error: "No valid item UUIDs." }, { status: 400 });
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
    .in("id", itemIds)
    .select();

  if (error) {
    console.error("[assign-rooms-bulk]", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: updated ?? [] });
});
