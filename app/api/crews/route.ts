import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { CREW_COLORS, type CrewRow } from "@/lib/crew-types";
import { fetchCrewsWithMembers } from "@/lib/crew-service";

const ALLOWED_COLORS = new Set<string>(CREW_COLORS.map((c) => c.value));

export const GET = withAuth(
  async (_request, { supabase }) => {
    const { crews, error } = await fetchCrewsWithMembers(supabase, {
      activeOnly: true,
    });
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ crews });
  },
  { requireAdmin: true },
);

export const POST = withAuth(
  async (request, { supabase }) => {
    let body: {
      name?: string;
      color?: string;
      lead_user_id?: string | null;
      default_vehicle_id?: string | null;
      notes?: string | null;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const color = (body.color ?? "").trim();
    if (!color || !ALLOWED_COLORS.has(color)) {
      return NextResponse.json({ error: "Invalid color." }, { status: 400 });
    }

    const lead_user_id =
      body.lead_user_id == null || body.lead_user_id === ""
        ? null
        : String(body.lead_user_id).trim();
    const default_vehicle_id =
      body.default_vehicle_id == null || body.default_vehicle_id === ""
        ? null
        : String(body.default_vehicle_id).trim();
    const notes =
      body.notes == null
        ? null
        : String(body.notes).trim() === ""
          ? null
          : String(body.notes).trim();

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("crews")
      .insert({
        name,
        color,
        lead_user_id,
        default_vehicle_id,
        notes,
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select(
        "id,name,color,lead_user_id,default_vehicle_id,notes,is_active,created_at,updated_at",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const r = data as Record<string, unknown>;
    const crew: CrewRow = {
      id: String(r.id),
      name: String(r.name ?? ""),
      color: String(r.color ?? ""),
      lead_user_id: r.lead_user_id ? String(r.lead_user_id) : null,
      default_vehicle_id: r.default_vehicle_id
        ? String(r.default_vehicle_id)
        : null,
      notes: r.notes == null ? null : String(r.notes),
      is_active: Boolean(r.is_active),
      created_at: String(r.created_at ?? ""),
      updated_at: String(r.updated_at ?? ""),
    };

    return NextResponse.json({ crew });
  },
  { requireAdmin: true },
);
