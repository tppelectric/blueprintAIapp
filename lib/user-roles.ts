export type UserRole =
  | "super_admin"
  | "admin"
  | "estimator"
  | "field_tech"
  | "office_manager";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  estimator: "Estimator",
  field_tech: "Field Tech",
  office_manager: "Office Manager",
};

export function isUserRole(v: string | null | undefined): v is UserRole {
  return (
    v === "super_admin" ||
    v === "admin" ||
    v === "estimator" ||
    v === "field_tech" ||
    v === "office_manager"
  );
}

export function parseUserRole(v: string | null | undefined): UserRole | null {
  return isUserRole(v) ? v : null;
}

export function canManageUsers(role: UserRole | null): boolean {
  return role === "super_admin";
}

/** Company integrations (e.g. JobTread) on Settings. */
export function canManageIntegrations(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

/** Upload/delete company reference PDFs (Reference Library). */
export function canManageReferenceDocuments(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

export function canSeeApiCosts(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

/** Pricing, markup %, customer sell price, profit, margin. */
export function canSeeMarkupAndProfit(role: UserRole | null): boolean {
  return (
    role === "super_admin" ||
    role === "admin" ||
    role === "estimator"
  );
}

/** Project breakdown / analyzer financial sections. */
export function canAccessFinancialTools(role: UserRole | null): boolean {
  return canSeeMarkupAndProfit(role);
}

export function canDeleteJobs(role: UserRole | null): boolean {
  return role !== null && role !== "field_tech";
}

export function canCreateOrEditJobs(role: UserRole | null): boolean {
  return role !== "field_tech" && role !== null;
}

export function canRemoveJobAttachments(role: UserRole | null): boolean {
  return role !== "field_tech" && role !== null;
}

export function canAssignJobs(role: UserRole | null): boolean {
  return (
    role === "super_admin" ||
    role === "admin" ||
    role === "estimator" ||
    role === "office_manager"
  );
}

/** Approve timesheets, time off, edit payroll rows. */
/** Edit/delete any receipt; full receipts admin UI. */
export function canManageReceiptsAdmin(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

export function canManageTeamTime(role: UserRole | null): boolean {
  return (
    role === "super_admin" || role === "admin" || role === "office_manager"
  );
}

/** Live team punch dashboard (`/team-clock`). */
export function canViewTeamClock(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

const FINANCIAL_TOOL_HREFS = new Set([
  "/tools/wifi-analyzer",
  "/tools/av-analyzer",
  "/tools/smarthome-analyzer",
  "/tools/electrical-analyzer",
  "/tools/project-breakdown",
]);

export function isFinancialToolHref(href: string): boolean {
  return FINANCIAL_TOOL_HREFS.has(href);
}
