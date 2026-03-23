import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const ROOM_TYPES = new Set([
  "living_room",
  "bedroom",
  "kitchen",
  "bathroom",
  "garage",
  "dining_room",
  "hallway",
  "laundry",
  "outdoor",
  "basement",
  "office",
  "utility",
  "other",
]);

export async function POST(request: Request) {
  let body: {
    roomId?: string;
    room_name?: string;
    room_type?: string;
    width_ft?: number | null;
    length_ft?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const roomId = body.roomId?.trim();
  if (!roomId) {
    return NextResponse.json({ error: "roomId required." }, { status: 400 });
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

  const patch: Record<string, unknown> = {};
  if (typeof body.room_name === "string") {
    const n = body.room_name.trim();
    if (!n) {
      return NextResponse.json(
        { error: "room_name cannot be empty." },
        { status: 400 },
      );
    }
    patch.room_name = n;
  }
  if (typeof body.room_type === "string") {
    let rt = body.room_type.toLowerCase().trim();
    if (!ROOM_TYPES.has(rt)) rt = "other";
    patch.room_type = rt;
  }
  if (body.width_ft !== undefined) {
    const w = body.width_ft;
    patch.width_ft =
      w === null || w === undefined
        ? null
        : Number.isFinite(Number(w)) && Number(w) >= 0
          ? Number(w)
          : null;
  }
  if (body.length_ft !== undefined) {
    const len = body.length_ft;
    patch.length_ft =
      len === null || len === undefined
        ? null
        : Number.isFinite(Number(len)) && Number(len) >= 0
          ? Number(len)
          : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400 },
    );
  }

  const w =
    patch.width_ft !== undefined
      ? (patch.width_ft as number | null)
      : undefined;
  const len =
    patch.length_ft !== undefined
      ? (patch.length_ft as number | null)
      : undefined;

  if (w !== undefined || len !== undefined) {
    const { data: existing } = await supabase
      .from("detected_rooms")
      .select("width_ft, length_ft")
      .eq("id", roomId)
      .maybeSingle();

    const nextW =
      w !== undefined ? w : existing?.width_ft != null ? Number(existing.width_ft) : null;
    const nextL =
      len !== undefined
        ? len
        : existing?.length_ft != null
          ? Number(existing.length_ft)
          : null;

    if (
      nextW != null &&
      nextL != null &&
      nextW > 0 &&
      nextL > 0
    ) {
      patch.sq_ft = Math.round(nextW * nextL * 100) / 100;
    }
  }

  const { data, error } = await supabase
    .from("detected_rooms")
    .update(patch)
    .eq("id", roomId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({ room: data });
}
