export type VerificationStatus =
  | "pending"
  | "confirmed"
  | "review_needed"
  | "conflict"
  | "manual";

export type ElectricalItemRow = {
  id: string;
  project_id: string;
  page_number: number;
  category: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  confidence: number;
  /** Room/area label from blueprint; UNASSIGNED if unknown */
  which_room?: string | null;
  raw_note: string | null;
  created_at?: string;
  gpt_count: number | null;
  final_count: number | null;
  verification_status: VerificationStatus | string | null;
  verified_by: string | null;
  user_edited?: boolean;
};
