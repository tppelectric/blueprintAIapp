import type { AssetRow } from "@/lib/inventory-types";
import {
  type VehicleAlertSeverity,
  isVehicleAsset,
} from "@/lib/vehicle-types";

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Days from today (UTC) to date string YYYY-MM-DD; negative = past. */
export function daysFromTodayUtc(isoDate: string | null): number | null {
  if (!isoDate || isoDate.length < 10) return null;
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = startOfUtcDay(now);
  return Math.round((target - today) / 86_400_000);
}

export function severityForDate(
  isoDate: string | null,
  soonDays = 30,
): VehicleAlertSeverity {
  const days = daysFromTodayUtc(isoDate);
  if (days === null) return "ok";
  if (days < 0) return "overdue";
  if (days <= soonDays) return "due_soon";
  return "ok";
}

function maxSeverity(
  a: VehicleAlertSeverity,
  b: VehicleAlertSeverity,
): VehicleAlertSeverity {
  const rank = { overdue: 3, due_soon: 2, ok: 1 };
  return rank[a] >= rank[b] ? a : b;
}

/** Oil change: date-based due, else mileage-based vs interval. */
export function oilChangeSeverity(a: AssetRow): VehicleAlertSeverity {
  const dateSev = severityForDate(a.next_oil_change_due_date);
  if (dateSev !== "ok") return dateSev;

  const cur = a.current_mileage;
  const last = a.last_oil_change_mileage;
  const interval = a.oil_change_interval_miles ?? 5000;
  if (cur == null) return "ok";
  if (last == null) {
    if (cur > 500) return "due_soon";
    return "ok";
  }
  const nextAt = last + interval;
  const milesLeft = nextAt - cur;
  if (milesLeft <= 0) return "overdue";
  const warnMiles = Math.max(300, Math.floor(interval * 0.08));
  if (milesLeft <= warnMiles) return "due_soon";
  return "ok";
}

export function nextOilChangeMilesRemaining(a: AssetRow): number | null {
  const last = a.last_oil_change_mileage;
  const cur = a.current_mileage;
  const interval = a.oil_change_interval_miles ?? 5000;
  if (last == null || cur == null) return null;
  return last + interval - cur;
}

export function aggregateVehicleAlertSeverity(a: AssetRow): VehicleAlertSeverity {
  if (!isVehicleAsset(a)) return "ok";
  let s: VehicleAlertSeverity = "ok";
  s = maxSeverity(s, severityForDate(a.registration_expires));
  s = maxSeverity(s, severityForDate(a.inspection_expires));
  s = maxSeverity(s, severityForDate(a.insurance_expires));
  s = maxSeverity(s, oilChangeSeverity(a));
  s = maxSeverity(s, severityForDate(a.next_service_date));
  return s;
}

export function vehicleHasAlert(a: AssetRow): boolean {
  if (!isVehicleAsset(a)) return false;
  return aggregateVehicleAlertSeverity(a) !== "ok";
}

export function vehicleNeedsAttentionFilter(a: AssetRow): boolean {
  return isVehicleAsset(a) && vehicleHasAlert(a);
}

export function countFleetNeedingAttention(vehicles: AssetRow[]): number {
  return vehicles.filter((v) => vehicleNeedsAttentionFilter(v)).length;
}
