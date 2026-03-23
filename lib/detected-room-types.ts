export type DetectedRoomRow = {
  id: string;
  project_id: string;
  page_number: number;
  room_name: string;
  room_type: string;
  width_ft: number | null;
  length_ft: number | null;
  sq_ft: number | null;
  confidence: number;
  created_at?: string;
};
