"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AssetRow } from "@/lib/inventory-types";
import {
  countFleetNeedingAttention,
  countVehicleInspectionAttentionWithin,
  countVehicleOilChangeOverdue,
  countVehicleRegistrationAttentionWithin,
} from "@/lib/vehicle-alerts";
import { isVehicleAsset } from "@/lib/vehicle-types";

type Props = {
  assets: AssetRow[];
  loading: boolean;
};

export function InventoryVehicleAlertsCard({ assets, loading }: Props) {
  const { total, alerts, reg, insp, oil } = useMemo(() => {
    const vehicles = assets.filter(isVehicleAsset);
    return {
      total: vehicles.length,
      alerts: countFleetNeedingAttention(vehicles),
      reg: countVehicleRegistrationAttentionWithin(vehicles, 30),
      insp: countVehicleInspectionAttentionWithin(vehicles, 30),
      oil: countVehicleOilChangeOverdue(vehicles),
    };
  }, [assets]);

  if (loading || total === 0) return null;

  const hasIssueLine = reg > 0 || insp > 0 || oil > 0;

  return (
    <Link
      href="/inventory/vehicles"
      className={`mt-6 block rounded-xl border px-4 py-3 text-left transition-colors ${
        alerts > 0
          ? "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/15"
          : "border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/15"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Fleet alerts</p>
          <p className="mt-0.5 text-xs text-white/60">
            {total} vehicle{total === 1 ? "" : "s"} in fleet
            {alerts > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-amber-200">
                  {alerts} with compliance or service flags
                </span>
              </>
            ) : (
              <span className="text-emerald-200"> · No date/mileage flags</span>
            )}
          </p>
          {hasIssueLine ? (
            <ul className="mt-2 space-y-0.5 text-[11px] text-white/75">
              {reg > 0 ? (
                <li>
                  <span className="font-medium text-amber-200/95">
                    Registration
                  </span>{" "}
                  expiring or expired (30-day window): {reg}
                </li>
              ) : null}
              {insp > 0 ? (
                <li>
                  <span className="font-medium text-amber-200/95">
                    Inspection
                  </span>{" "}
                  expiring or expired (30-day window): {insp}
                </li>
              ) : null}
              {oil > 0 ? (
                <li>
                  <span className="font-medium text-orange-200/95">
                    Oil change
                  </span>{" "}
                  overdue (date or miles): {oil}
                </li>
              ) : null}
              <li className="text-white/50">
                Open NHTSA recalls are checked on each vehicle page.
              </li>
            </ul>
          ) : null}
        </div>
        <span className="shrink-0 text-sm font-medium text-violet-200">
          Fleet →
        </span>
      </div>
    </Link>
  );
}
