import type {
  InternalRequestDetails,
  InternalRequestPriority,
  InternalRequestRow,
  InternalRequestStatus,
  InternalRequestType,
  InternalRequestStatusEventRow,
  RequestCommentRow,
} from "@/lib/internal-request-types";

const TYPES = new Set<string>([
  "vehicle_maintenance",
  "vehicle_request",
  "tool_repair",
  "material_order",
  "tool_request",
  "document_request",
  "license_request",
  "expense_reimbursement",
  "safety_incident",
  "hr_admin",
  "app_support",
  "other",
]);

const PRIOS = new Set<string>(["low", "normal", "urgent", "emergency"]);

const STATUSES = new Set<string>([
  "new",
  "in_review",
  "approved",
  "in_progress",
  "waiting",
  "completed",
  "declined",
  "cancelled",
]);

function parseDetails(raw: unknown): InternalRequestDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as InternalRequestDetails;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

export function mapInternalRequestRow(
  r: Record<string, unknown>,
): InternalRequestRow {
  const rt = String(r.request_type ?? "other");
  const pr = String(r.priority ?? "normal");
  const st = String(r.status ?? "new");
  return {
    id: String(r.id),
    request_number: String(r.request_number ?? ""),
    submitted_by: r.submitted_by ? String(r.submitted_by) : null,
    assigned_to: r.assigned_to ? String(r.assigned_to) : null,
    request_type: (TYPES.has(rt) ? rt : "other") as InternalRequestType,
    title: String(r.title ?? ""),
    description: r.description == null ? null : String(r.description),
    priority: (PRIOS.has(pr) ? pr : "normal") as InternalRequestPriority,
    status: (STATUSES.has(st) ? st : "new") as InternalRequestStatus,
    job_id: r.job_id ? String(r.job_id) : null,
    asset_id: r.asset_id ? String(r.asset_id) : null,
    photos: strArr(r.photos),
    amount: r.amount != null ? Number(r.amount) : null,
    quantity: r.quantity != null ? Number(r.quantity) : null,
    item_description:
      r.item_description == null ? null : String(r.item_description),
    date_needed:
      r.date_needed == null
        ? null
        : String(r.date_needed).slice(0, 10),
    admin_notes: r.admin_notes == null ? null : String(r.admin_notes),
    resolution_notes:
      r.resolution_notes == null ? null : String(r.resolution_notes),
    resolved_at: r.resolved_at == null ? null : String(r.resolved_at),
    details: parseDetails(r.details),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export function mapRequestCommentRow(
  r: Record<string, unknown>,
): RequestCommentRow {
  return {
    id: String(r.id),
    request_id: String(r.request_id ?? ""),
    author_id: r.author_id ? String(r.author_id) : null,
    comment: String(r.comment ?? ""),
    is_internal: Boolean(r.is_internal),
    created_at: String(r.created_at ?? ""),
  };
}

export function mapStatusEventRow(
  r: Record<string, unknown>,
): InternalRequestStatusEventRow {
  return {
    id: String(r.id),
    request_id: String(r.request_id ?? ""),
    status: String(r.status ?? ""),
    created_at: String(r.created_at ?? ""),
    created_by: r.created_by ? String(r.created_by) : null,
  };
}
