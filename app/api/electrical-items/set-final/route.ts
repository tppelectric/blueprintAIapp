import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  humanVerifyPatch,
  normalizeElectricalItemRow,
} from "@/lib/electrical-verify";

export const POST = withAuth(async (request: NextRequest, { user }) => {
  let body: { itemId?: string; finalCount?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  const finalCount = body.finalCount;
  if (!itemId) {
    return NextResponse.json({ error: "itemId required." }, { status: 400 });
  }
  if (
    typeof finalCount !== "number" ||
    !Number.isFinite(finalCount) ||
    finalCount < 0 ||
    !Number.isInteger(finalCount)
  ) {
    return NextResponse.json(
      { error: "finalCount must be a non-negative integer." },
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

  const { data: row, error: fetchErr } = await supabase
    .from("electrical_items")
    .select("id, instance_locations, origin_source")
    .eq("id", itemId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const normalized = normalizeElectricalItemRow(row as Record<string, unknown>);

  const { data, error } = await supabase
    .from("electrical_items")
    .update({
      final_count: finalCount,
      verification_status: "confirmed",
      verified_by: "override",
      ...humanVerifyPatch(user.id, "edited", {
        stampInstances: normalized.instance_locations,
        origin_source: normalized.origin_source ?? "ai",
      }),
    })
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({
    item: data
      ? normalizeElectricalItemRow(data as Record<string, unknown>)
      : null,
  });
});
