export type InternalRequestType =
  | "vehicle_maintenance"
  | "vehicle_request"
  | "tool_repair"
  | "material_order"
  | "tool_request"
  | "document_request"
  | "license_request"
  | "expense_reimbursement"
  | "safety_incident"
  | "hr_admin"
  | "app_support"
  | "other";

export type InternalRequestPriority = "low" | "normal" | "urgent" | "emergency";

export type InternalRequestStatus =
  | "new"
  | "in_review"
  | "approved"
  | "in_progress"
  | "waiting"
  | "completed"
  | "declined"
  | "cancelled";

/** Type-specific fields stored in `details` JSONB. */
export type InternalRequestDetails = {
  vehicle_issue_noticed?: string;
  vehicle_safe_to_drive?: boolean;
  tool_still_usable?: boolean;
  material_preferred_vendor?: string;
  document_for_who?: string;
  document_requirements?: string;
  safety_when?: string;
  safety_where?: string;
  safety_what?: string;
  safety_injured?: boolean;
  safety_injury_details?: string;
  safety_medical_attention?: boolean;
  safety_witnesses?: string;
  safety_osha_recordable?: boolean;
  additional_notes?: string;
};

export type InternalRequestRow = {
  id: string;
  request_number: string;
  submitted_by: string | null;
  assigned_to: string | null;
  request_type: InternalRequestType;
  title: string;
  description: string | null;
  priority: InternalRequestPriority;
  status: InternalRequestStatus;
  job_id: string | null;
  asset_id: string | null;
  photos: string[];
  amount: number | null;
  quantity: number | null;
  item_description: string | null;
  date_needed: string | null;
  admin_notes: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  details: InternalRequestDetails;
  created_at: string;
  updated_at: string;
};

export type RequestCommentRow = {
  id: string;
  request_id: string;
  author_id: string | null;
  comment: string;
  is_internal: boolean;
  created_at: string;
};

export type InternalRequestStatusEventRow = {
  id: string;
  request_id: string;
  status: string;
  created_at: string;
  created_by: string | null;
};

export const REQUEST_TYPE_OPTIONS: {
  value: InternalRequestType;
  label: string;
  icon: string;
  step1Label: string;
}[] = [
  {
    value: "vehicle_maintenance",
    label: "Vehicle issue",
    icon: "🚛",
    step1Label: "Vehicle Issue",
  },
  {
    value: "tool_repair",
    label: "Tool repair",
    icon: "🔧",
    step1Label: "Tool Repair",
  },
  {
    value: "material_order",
    label: "Material order",
    icon: "📦",
    step1Label: "Material Order",
  },
  {
    value: "tool_request",
    label: "Need equipment",
    icon: "🔍",
    step1Label: "Need Equipment",
  },
  {
    value: "document_request",
    label: "Document needed",
    icon: "📄",
    step1Label: "Document Needed",
  },
  {
    value: "license_request",
    label: "Certification request",
    icon: "🪪",
    step1Label: "Certification Request",
  },
  {
    value: "expense_reimbursement",
    label: "Expense reimbursement",
    icon: "💰",
    step1Label: "Expense Reimbursement",
  },
  {
    value: "safety_incident",
    label: "Safety report",
    icon: "⚠️",
    step1Label: "Safety Report",
  },
  {
    value: "hr_admin",
    label: "HR / Admin",
    icon: "👷",
    step1Label: "HR/Admin",
  },
  {
    value: "app_support",
    label: "App issue",
    icon: "💻",
    step1Label: "App Issue",
  },
  {
    value: "other",
    label: "Other",
    icon: "📝",
    step1Label: "Other",
  },
];
