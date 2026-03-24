export const JOB_TYPES = [
  "Electrical",
  "Low Voltage",
  "WiFi",
  "Smart Home",
  "Mixed",
  "Other",
] as const;

export const JOB_STATUSES = [
  "Lead",
  "Quoted",
  "Active",
  "Complete",
  "On Hold",
  "Cancelled",
] as const;

export type JobAttachmentType =
  | "blueprint_project"
  | "wifi_calculation"
  | "load_calculation"
  | "nec_checklist"
  | "project_breakdown"
  | "takeoff";

export type CustomerRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
};

export type JobRow = {
  id: string;
  customer_id: string | null;
  job_name: string;
  job_number: string;
  job_type: string;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: CustomerRow | null;
};

/** Supabase list/join shape (subset of columns + nested customer). */
export type JobListRow = {
  id: string;
  job_name: string;
  job_number: string;
  status: string;
  job_type: string;
  updated_at: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  customers?: Pick<CustomerRow, "company_name" | "contact_name"> | null;
};

export type JobAttachmentRow = {
  id: string;
  job_id: string;
  attachment_type: string;
  attachment_id: string;
  label: string | null;
  created_at: string;
};
