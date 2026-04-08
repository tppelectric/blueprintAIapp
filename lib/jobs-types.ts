export const JOB_TYPES = [
  "Electrical",
  "Low Voltage",
  "WiFi",
  "Smart Home",
  "Mixed",
  "Other",
] as const;

export const JOB_STATUSES = [
  "YES, READY TO BE INVOICED",
  "NO, JOB STILL IN PROGRESS",
  "IN PROGRESS",
  "INVOICED/SENT",
  "PAID",
  "BARTERED WORK",
  "ON HOLD/WAITING FOR MATERIAL",
  "ON HOLD/WAITING FOR APPROVAL",
  "ESTIMATING",
  "NEW JOB/JUST STARTED",
  "DOCUMENT MADE/NEEDS REVIEW BEFORE SENDING",
  "PARTIAL/PROGRESS PAYMENT RECEIVED",
  "JOB CLOSED/NOT PROCEEDING",
  "PLEASE CLOSE JOB",
  "PLEASE DELETE ENTIRE JOB",
  "NO ACTION NEEDED AT THIS TIME",
] as const;

export type JobAttachmentType =
  | "blueprint_project"
  | "wifi_calculation"
  | "av_calculation"
  | "smarthome_calculation"
  | "electrical_calculation"
  | "load_calculation"
  | "nec_checklist"
  | "project_breakdown"
  | "takeoff"
  | "plan_scan_import";

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
  /** Present when customer row is linked from JobTread sync. */
  jobtread_id?: string | null;
};

export type JobRow = {
  id: string;
  customer_id: string | null;
  /** Field tech access: job visible when this matches their auth user id. */
  assigned_user_id?: string | null;
  job_name: string;
  job_number: string;
  job_type: string;
  status: string;
  need_ready_to_invoice?: string | null;
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
  assigned_user_id?: string | null;
  assigned_crew_id?: string | null;
  job_name: string;
  job_number: string;
  status: string;
  need_ready_to_invoice?: string | null;
  job_type: string;
  updated_at: string;
  created_at?: string;
  customer_id?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  description?: string | null;
  notes?: string | null;
  customers?: Pick<CustomerRow, "company_name" | "contact_name"> | null;
};

/** Server-loaded shape: `job_assignments` joined to `user_profiles`. */
export type JobCrewProfile = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
};

export type JobCrewAssignmentRow = {
  user_id: string;
  assigned_at: string;
  notes: string | null;
  /** PostgREST may return one object or a single-element array depending on FK shape. */
  user_profiles: JobCrewProfile | JobCrewProfile[] | null;
};

export type JobAttachmentRow = {
  id: string;
  job_id: string | null;
  attachment_type: string;
  attachment_id: string;
  label: string | null;
  created_at: string;
  blueprint_project_id?: string | null;
  tool_slug?: string | null;
  import_summary?: unknown;
  imported_at?: string | null;
};
