import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { CREW_COLORS } from "@/lib/crew-types";
import { fetchCrewsWithMembers } from "@/lib/crew-service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_COLORS = new Set<string>(CREW_COLORS.map((c) => c.value));

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const crewId = id?.trim() ?? "";

  return withAuth(
    async (_req, { supabase }) => {
      if (!crewId || !UUID_RE.test(crewId)) {
        return NextResponse.json({ error: "Invalid crew id." }, { status: 400 });
      }

      const { crews, error } = await fetchCrewsWithMembers(supabase, {
        crewId,
      });
      if (error) {
        return NextResponse.json({ error }, { status: 500 });
      }
      const crew = crews[0];
      if (!crew) {
        return NextResponse.json({ error: "Crew not found." }, { status: 404 });
      }
      return NextResponse.json({ crew });
    },
    { requireAdmin: true },
  )(request);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const crewId = id?.trim() ?? "";

  return withAuth(
    async (req, { supabase }) => {
      if (!crewId || !UUID_RE.test(crewId)) {
        return NextResponse.json({ error: "Invalid crew id." }, { status: 400 });
      }

      let body: {
        name?: string;
        color?: string;
        lead_user_id?: string | null;
        default_vehicle_id?: string | null;
        notes?: string | null;
        is_active?: boolean;
        add_member_ids?: string[];
        remove_member_ids?: string[];
      };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
      }

      const removeIds = Array.isArray(body.remove_member_ids)
        ? body.remove_member_ids.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (removeIds.length > 0) {
        const { error: delErr } = await supabase
          .from("crew_members")
          .delete()
          .eq("crew_id", crewId)
          .in("user_id", removeIds);
        if (delErr) {
          return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
      }

      const addIds = Array.isArray(body.add_member_ids)
        ? body.add_member_ids.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (addIds.length > 0) {
        const rows = addIds.map((user_id) => ({ crew_id: crewId, user_id }));
        const { error: insErr } = await supabase
          .from("crew_members")
          .upsert(rows, {
            onConflict: "crew_id,user_id",
            ignoreDuplicates: true,
          });
        if (insErr) {
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
      }

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) {
        const n = String(body.name).trim();
        if (!n) {
          return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
        }
        patch.name = n;
      }
      if (body.color !== undefined) {
        const c = String(body.color).trim();
        if (!ALLOWED_COLORS.has(c)) {
          return NextResponse.json({ error: "Invalid color." }, { status: 400 });
        }
        patch.color = c;
      }
      if (body.lead_user_id !== undefined) {
        patch.lead_user_id =
          body.lead_user_id == null || body.lead_user_id === ""
            ? null
            : String(body.lead_user_id);
      }
      if (body.default_vehicle_id !== undefined) {
        patch.default_vehicle_id =
          body.default_vehicle_id == null || body.default_vehicle_id === ""
            ? null
            : String(body.default_vehicle_id);
      }
      if (body.notes !== undefined) {
        patch.notes =
          body.notes == null || String(body.notes).trim() === ""
            ? null
            : String(body.notes).trim();
      }
      if (body.is_active !== undefined) {
        patch.is_active = Boolean(body.is_active);
      }

      const keys = Object.keys(patch).filter((k) => k !== "updated_at");
      if (keys.length > 0) {
        const { error: upErr } = await supabase
          .from("crews")
          .update(patch)
          .eq("id", crewId);
        if (upErr) {
          return NextResponse.json({ error: upErr.message }, { status: 500 });
        }
      }

      const { crews, error: loadErr } = await fetchCrewsWithMembers(supabase, {
        crewId,
      });
      if (loadErr) {
        return NextResponse.json({ error: loadErr }, { status: 500 });
      }
      const crew = crews[0];
      if (!crew) {
        return NextResponse.json({ error: "Crew not found." }, { status: 404 });
      }
      return NextResponse.json({ crew });
    },
    { requireAdmin: true },
  )(request);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const crewId = id?.trim() ?? "";

  return withAuth(
    async (_req, { supabase }) => {
      if (!crewId || !UUID_RE.test(crewId)) {
        return NextResponse.json({ error: "Invalid crew id." }, { status: 400 });
      }

      const { error } = await supabase
        .from("crews")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", crewId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    },
    { requireAdmin: true },
  )(request);
}
