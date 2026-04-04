import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrewRow, CrewWithMembers } from "@/lib/crew-types";
import { userDisplayName } from "@/lib/user-display-name";

type ProfileMini = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

function mapCrewRow(r: Record<string, unknown>): CrewRow {
  return {
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
}

function profileMap(rows: ProfileMini[]): Map<string, ProfileMini> {
  const m = new Map<string, ProfileMini>();
  for (const p of rows) m.set(p.id, p);
  return m;
}

export async function fetchCrewsWithMembers(
  supabase: SupabaseClient,
  options: { activeOnly?: boolean; crewId?: string } = {},
): Promise<{ crews: CrewWithMembers[]; error: string | null }> {
  const { activeOnly = false, crewId } = options;

  let q = supabase.from("crews").select("*").order("name", { ascending: true });
  if (crewId) {
    q = q.eq("id", crewId);
  } else if (activeOnly) {
    q = q.eq("is_active", true);
  }

  const { data: crewRows, error: crewErr } = await q;
  if (crewErr) {
    return { crews: [], error: crewErr.message };
  }

  const crewsRaw = (crewRows ?? []) as Record<string, unknown>[];
  if (crewsRaw.length === 0) {
    return { crews: [], error: null };
  }

  const crewIds = crewsRaw.map((c) => String(c.id));

  const { data: memberRows, error: memErr } = await supabase
    .from("crew_members")
    .select("crew_id, user_id")
    .in("crew_id", crewIds);

  if (memErr) {
    return { crews: [], error: memErr.message };
  }

  const membersList = (memberRows ?? []) as {
    crew_id: string;
    user_id: string;
  }[];

  const userIdSet = new Set<string>();
  for (const m of membersList) userIdSet.add(m.user_id);
  for (const c of crewsRaw) {
    const lid = c.lead_user_id;
    if (lid) userIdSet.add(String(lid));
  }

  const userIds = [...userIdSet];
  let profilesById = new Map<string, ProfileMini>();
  if (userIds.length > 0) {
    const { data: profRows, error: pErr } = await supabase
      .from("user_profiles")
      .select("id,first_name,last_name,full_name,email,role")
      .in("id", userIds);

    if (pErr) {
      return { crews: [], error: pErr.message };
    }
    profilesById = profileMap((profRows ?? []) as ProfileMini[]);
  }

  const vehicleIds = [
    ...new Set(
      crewsRaw
        .map((c) => c.default_vehicle_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const vehicleNameById = new Map<string, string>();
  if (vehicleIds.length > 0) {
    const { data: assets, error: aErr } = await supabase
      .from("assets")
      .select("id,name,asset_number")
      .in("id", vehicleIds);
    if (aErr) {
      return { crews: [], error: aErr.message };
    }
    for (const a of assets ?? []) {
      const row = a as { id: string; name: string | null; asset_number: string | null };
      const label = [row.asset_number, row.name].filter(Boolean).join(" · ") || row.name || "—";
      vehicleNameById.set(row.id, label);
    }
  }

  const crews: CrewWithMembers[] = crewsRaw.map((raw) => {
    const row = mapCrewRow(raw);
    const cm = membersList.filter((m) => m.crew_id === row.id);
    const members = cm.map((m) => {
      const p = profilesById.get(m.user_id);
      return {
        user_id: m.user_id,
        display_name: p
          ? userDisplayName({
              first_name: p.first_name,
              last_name: p.last_name,
              full_name: p.full_name,
              email: p.email,
            })
          : "—",
        role: p?.role ?? null,
      };
    });

    const leadP = row.lead_user_id
      ? profilesById.get(row.lead_user_id)
      : undefined;
    const lead_name = leadP
      ? userDisplayName({
          first_name: leadP.first_name,
          last_name: leadP.last_name,
          full_name: leadP.full_name,
          email: leadP.email,
        })
      : null;

    const vehicle_name = row.default_vehicle_id
      ? vehicleNameById.get(row.default_vehicle_id) ?? null
      : null;

    return {
      ...row,
      members,
      lead_name,
      vehicle_name,
      member_count: members.length,
    };
  });

  return { crews, error: null };
}
