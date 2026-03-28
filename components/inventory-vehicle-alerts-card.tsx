"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AssetRow } from "@/lib/inventory-types";
import { countFleetNeedingAttention } from "@/lib/vehicle-alerts";
import { isVehicleAsset } from "@/lib/vehicle-types";

type Props = {
  assets: AssetRow[];
  loading: boolean;
};

export function InventoryVehicleAlertsCard({ assets, loading }: Props) {
  const { total, alerts } = useMemo(() => {
    const vehicles = assets.filter(isVehicleAsset);
    return {
      total: vehicles.length,
      alerts: countFleetNeedingAttention(vehicles),
    };
  }, [assets]);

  if (loading || total === 0) return null;

  return (
    <Link
      href="/inventory/vehicles"
      className={`mt-6 block rounded-xl border px-4 py-3 text-left transition-colors ${
        alerts > 0
          ? "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/15"
          : "border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/15"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Fleet vehicles</p>
          <p className="mt-0.5 text-xs text-white/60">
            {total} vehicle{total === 1 ? "" : "s"} registered
            {alerts > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-amber-200">
                  {alerts} need attention
                </span>
              </>
            ) : (
              <span className="text-emerald-200"> · All compliance current</span>
            )}
          </p>
        </div>
        <span className="text-sm font-medium text-violet-200">
          Manage fleet →
        </span>
      </div>
    </Link>
  );
}
