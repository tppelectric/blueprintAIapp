import type { LicenseRow } from "@/lib/license-types";
import {
  ceNeedsAttentionWithin,
  daysUntilExpiryUtc,
  isStatActive,
  isStatExpiringSoon,
  isStatInPursuit,
} from "@/lib/license-utils";

/** Licenses expiring within 30 days (active, not yet expired). */
export function countExpiringWithin30Days(rows: LicenseRow[]): number {
  return rows.filter((l) => isStatExpiringSoon(l)).length;
}

/** CE incomplete and renewal deadline within `withinDays`. */
export function countCeAttentionWithin(
  rows: LicenseRow[],
  withinDays: number,
): number {
  return rows.filter((l) => ceNeedsAttentionWithin(l, withinDays)).length;
}

export function countInPursuit(rows: LicenseRow[]): number {
  return rows.filter((l) => isStatInPursuit(l)).length;
}

/**
 * Unique licenses that should surface on the nav badge:
 * expiring within 30d, CE due within 45d, in pursuit, or expired / past expiry while still "active".
 */
export function licenseNavAlertCount(rows: LicenseRow[]): number {
  const ids = new Set<string>();
  for (const l of rows) {
    if (isStatExpiringSoon(l)) ids.add(l.id);
  }
  for (const l of rows) {
    if (ceNeedsAttentionWithin(l, 45)) ids.add(l.id);
  }
  for (const l of rows) {
    if (isStatInPursuit(l)) ids.add(l.id);
  }
  for (const l of rows) {
    const d = daysUntilExpiryUtc(l.expiry_date);
    const past = d != null && d < 0;
    const markedExpired = l.license_status === "expired";
    if (markedExpired || (past && isStatActive(l))) ids.add(l.id);
  }
  return ids.size;
}
