/** Row from `public.licenses`. */
export type LicenseRow = {
  id: string;
  holder_type: "company" | "employee";
  holder_user_id: string | null;
  license_status: LicenseStatus;
  license_name: string;
  license_type: string;
  license_type_custom: string | null;
  license_number: string | null;
  issuing_authority: string | null;
  jurisdiction_summary: string | null;
  state: string | null;
  county: string | null;
  municipality: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_fee: number | null;
  notes: string | null;
  license_pdf_path: string | null;
  requires_ce: boolean;
  ce_hours_required: number | null;
  ce_hours_completed: number;
  ce_period_start: string | null;
  ce_period_end: string | null;
  ce_renewal_deadline: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type LicenseStatus = "active" | "in_pursuit" | "expired" | "suspended";

export type CeCourseRow = {
  id: string;
  license_id: string;
  course_name: string;
  provider: string | null;
  course_date: string;
  hours_earned: number;
  cost: number | null;
  certificate_path: string | null;
  created_at: string;
  created_by: string | null;
};

export type ContinuingEducationRow = {
  id: string;
  license_id: string;
  title: string | null;
  period_start: string | null;
  period_end: string | null;
  hours_required: number | null;
  hours_completed: number;
  deadline_date: string | null;
  notes: string | null;
  created_at: string;
};

export type LicenseRequirementRow = {
  id: string;
  license_id: string;
  requirement_text: string;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type LicenseStudyMaterialType =
  | "document"
  | "video"
  | "link"
  | "note"
  | "book"
  | "practice_test";

export type LicenseStudyMaterialRow = {
  id: string;
  license_id: string;
  material_type: LicenseStudyMaterialType;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  created_at: string;
  created_by: string | null;
};

export type LicenseHistoryRow = {
  id: string;
  license_id: string;
  event_type: string;
  summary: string;
  detail: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

export const LICENSE_TYPE_OPTIONS = [
  { value: "electrical_contractor", label: "Electrical Contractor" },
  { value: "master_electrician", label: "Master Electrician" },
  { value: "journeyman", label: "Journeyman" },
  { value: "low_voltage", label: "Low Voltage" },
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "general_contractor", label: "General Contractor" },
  { value: "home_improvement", label: "Home Improvement" },
  { value: "business_license", label: "Business License" },
  { value: "osha_10", label: "OSHA 10" },
  { value: "osha_30", label: "OSHA 30" },
  { value: "first_aid_cpr", label: "First Aid/CPR" },
  { value: "manufacturer_cert", label: "Manufacturer Cert" },
  { value: "other", label: "Other (custom)" },
] as const;

export type LicenseTypeValue = (typeof LICENSE_TYPE_OPTIONS)[number]["value"];
