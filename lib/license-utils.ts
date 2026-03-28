import type { LicenseRow, LicenseStatus } from "@/lib/license-types";

export type ExpiryColorTier =
  | "expired"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "none";

const DAY_MS = 86_400_000;

export function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from today (UTC) until expiry; negative if expired. */
export function daysUntilExpiryUtc(expiryIso: string | null): number | null {
  if (!expiryIso || expiryIso.length < 10) return null;
  const [y, m, d] = expiryIso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const exp = Date.UTC(y, m - 1, d);
  const today = utcDayStart(new Date());
  return Math.round((exp - today) / DAY_MS);
}

/**
 * Green ≥60d, Yellow 30–59, Orange 7–29, Red <7 (not expired), expired = expired.
 */
export function expiryColorTier(
  expiryIso: string | null,
  status: LicenseStatus,
): ExpiryColorTier {
  if (status === "in_pursuit") return "none";
  const days = daysUntilExpiryUtc(expiryIso);
  if (days === null) return "none";
  if (days < 0 || status === "expired") return "expired";
  if (days < 7) return "red";
  if (days < 30) return "orange";
  if (days < 60) return "yellow";
  return "green";
}

export function expiryTierClasses(tier: ExpiryColorTier): string {
  switch (tier) {
    case "expired":
    case "red":
      return "text-red-200 ring-red-400/40 bg-red-500/15";
    case "orange":
      return "text-orange-100 ring-orange-400/35 bg-orange-500/15";
    case "yellow":
      return "text-amber-100 ring-amber-400/35 bg-amber-500/15";
    case "green":
      return "text-emerald-100 ring-emerald-400/35 bg-emerald-500/15";
    default:
      return "text-sky-100 ring-sky-400/30 bg-sky-500/15";
  }
}

export function isLicenseExpired(l: LicenseRow): boolean {
  if (l.license_status === "expired") return true;
  const d = daysUntilExpiryUtc(l.expiry_date);
  return d != null && d < 0;
}

/** Dashboard stat: active = not in_pursuit, not expired by date. */
export function isStatActive(l: LicenseRow): boolean {
  if (l.license_status === "in_pursuit") return false;
  if (l.license_status === "expired") return false;
  const d = daysUntilExpiryUtc(l.expiry_date);
  if (d != null && d < 0) return false;
  return l.license_status === "active" || l.license_status === "suspended";
}

/** Expiring within 30 days, still active. */
export function isStatExpiringSoon(l: LicenseRow): boolean {
  if (!isStatActive(l)) return false;
  const d = daysUntilExpiryUtc(l.expiry_date);
  return d != null && d >= 0 && d <= 30;
}

export function isStatExpired(l: LicenseRow): boolean {
  return isLicenseExpired(l);
}

export function isStatInPursuit(l: LicenseRow): boolean {
  return l.license_status === "in_pursuit";
}

export function daysUntilDateUtc(iso: string | null): number | null {
  return daysUntilExpiryUtc(iso);
}

/** CE renewal deadline within `withinDays` and hours short. */
export function ceNeedsAttentionWithin(
  l: LicenseRow,
  withinDays: number,
): boolean {
  if (!l.requires_ce) return false;
  const req = Number(l.ce_hours_required ?? 0);
  const done = Number(l.ce_hours_completed ?? 0);
  if (req <= 0 || done >= req) return false;
  const deadline = l.ce_renewal_deadline;
  const d = daysUntilDateUtc(deadline);
  if (d == null) return false;
  return d >= 0 && d <= withinDays;
}

export function licenseTypeLabel(
  type: string,
  custom: string | null,
): string {
  const found = [
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
    { value: "other", label: "Other" },
  ].find((x) => x.value === type);
  if (type === "other" && custom?.trim()) return custom.trim();
  return found?.label ?? type;
}
