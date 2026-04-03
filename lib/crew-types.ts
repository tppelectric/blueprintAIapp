export const CREW_COLORS = [
  { label: "Sky", value: "#38bdf8" },
  { label: "Emerald", value: "#34d399" },
  { label: "Violet", value: "#a78bfa" },
  { label: "Coral", value: "#fb7185" },
  { label: "Amber", value: "#fb923c" },
  { label: "Teal", value: "#2dd4bf" },
  { label: "Indigo", value: "#818cf8" },
  { label: "Rose", value: "#f472b6" },
] as const;

export type CrewRow = {
  id: string;
  name: string;
  color: string;
  lead_user_id: string | null;
  default_vehicle_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrewMemberRow = {
  id: string;
  crew_id: string;
  user_id: string;
  joined_at: string;
};

export type CrewWithMembers = CrewRow & {
  members: {
    user_id: string;
    display_name: string;
    role: string | null;
  }[];
  lead_name: string | null;
  vehicle_name: string | null;
  member_count: number;
};
