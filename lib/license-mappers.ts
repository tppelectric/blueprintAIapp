import type {
  CeCourseRow,
  ContinuingEducationRow,
  LicenseHistoryRow,
  LicenseRequirementRow,
  LicenseRow,
  LicenseStatus,
  LicenseStudyMaterialRow,
  LicenseStudyMaterialType,
} from "@/lib/license-types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function dateStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).slice(0, 10);
}

function status(raw: unknown): LicenseStatus {
  const s = String(raw ?? "active").toLowerCase();
  if (
    s === "in_pursuit" ||
    s === "expired" ||
    s === "suspended" ||
    s === "active"
  ) {
    return s;
  }
  return "active";
}

export function mapLicenseRow(r: Record<string, unknown>): LicenseRow {
  const ht = String(r.holder_type ?? "company").toLowerCase();
  return {
    id: String(r.id),
    holder_type: ht === "employee" ? "employee" : "company",
    holder_user_id: r.holder_user_id ? String(r.holder_user_id) : null,
    license_status: status(r.license_status),
    license_name: String(r.license_name ?? "").trim() || "—",
    license_type: String(r.license_type ?? "other"),
    license_type_custom: str(r.license_type_custom),
    license_number: str(r.license_number),
    issuing_authority: str(r.issuing_authority),
    jurisdiction_summary: str(r.jurisdiction_summary),
    state: str(r.state),
    county: str(r.county),
    municipality: str(r.municipality),
    issue_date: dateStr(r.issue_date),
    expiry_date: dateStr(r.expiry_date),
    renewal_fee: r.renewal_fee != null ? num(r.renewal_fee) : null,
    notes: str(r.notes),
    license_pdf_path: str(r.license_pdf_path),
    requires_ce: Boolean(r.requires_ce),
    ce_hours_required:
      r.ce_hours_required != null ? num(r.ce_hours_required) : null,
    ce_hours_completed: num(r.ce_hours_completed, 0),
    ce_period_start: dateStr(r.ce_period_start),
    ce_period_end: dateStr(r.ce_period_end),
    ce_renewal_deadline: dateStr(r.ce_renewal_deadline),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    created_by: r.created_by ? String(r.created_by) : null,
  };
}

export function mapCeCourseRow(r: Record<string, unknown>): CeCourseRow {
  return {
    id: String(r.id),
    license_id: String(r.license_id ?? ""),
    course_name: String(r.course_name ?? ""),
    provider: str(r.provider),
    course_date: dateStr(r.course_date) ?? "",
    hours_earned: num(r.hours_earned, 0),
    cost: r.cost != null ? num(r.cost) : null,
    certificate_path: str(r.certificate_path),
    created_at: String(r.created_at ?? ""),
    created_by: r.created_by ? String(r.created_by) : null,
  };
}

export function mapContinuingEducationRow(
  r: Record<string, unknown>,
): ContinuingEducationRow {
  return {
    id: String(r.id),
    license_id: String(r.license_id ?? ""),
    title: str(r.title),
    period_start: dateStr(r.period_start),
    period_end: dateStr(r.period_end),
    hours_required:
      r.hours_required != null ? num(r.hours_required) : null,
    hours_completed: num(r.hours_completed, 0),
    deadline_date: dateStr(r.deadline_date),
    notes: str(r.notes),
    created_at: String(r.created_at ?? ""),
  };
}

export function mapLicenseRequirementRow(
  r: Record<string, unknown>,
): LicenseRequirementRow {
  return {
    id: String(r.id),
    license_id: String(r.license_id ?? ""),
    requirement_text: String(r.requirement_text ?? ""),
    sort_order: Math.floor(num(r.sort_order, 0)),
    is_completed: Boolean(r.is_completed),
    completed_at: dateStr(r.completed_at),
    notes: str(r.notes),
    created_at: String(r.created_at ?? ""),
  };
}

const MAT_TYPES = new Set<string>([
  "document",
  "video",
  "link",
  "note",
  "book",
  "practice_test",
]);

function matType(raw: unknown): LicenseStudyMaterialType {
  const s = String(raw ?? "link").toLowerCase();
  return MAT_TYPES.has(s) ? (s as LicenseStudyMaterialType) : "link";
}

export function mapLicenseStudyMaterialRow(
  r: Record<string, unknown>,
): LicenseStudyMaterialRow {
  return {
    id: String(r.id),
    license_id: String(r.license_id ?? ""),
    material_type: matType(r.material_type),
    title: String(r.title ?? ""),
    description: str(r.description),
    url: str(r.url),
    file_path: str(r.file_path),
    created_at: String(r.created_at ?? ""),
    created_by: r.created_by ? String(r.created_by) : null,
  };
}

export function mapLicenseHistoryRow(
  r: Record<string, unknown>,
): LicenseHistoryRow {
  const det = r.detail;
  return {
    id: String(r.id),
    license_id: String(r.license_id ?? ""),
    event_type: String(r.event_type ?? "update"),
    summary: String(r.summary ?? ""),
    detail:
      det && typeof det === "object" && !Array.isArray(det)
        ? (det as Record<string, unknown>)
        : null,
    created_by: r.created_by ? String(r.created_by) : null,
    created_at: String(r.created_at ?? ""),
  };
}
