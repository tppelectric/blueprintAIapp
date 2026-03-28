"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapAssetRow } from "@/lib/inventory-mappers";
import type { AssetRow } from "@/lib/inventory-types";
import { qrUrlForAsset } from "@/lib/inventory-qr";
import { canManageInventoryAdmin } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  aggregateVehicleAlertSeverity,
  vehicleNeedsAttentionFilter,
} from "@/lib/vehicle-alerts";
import type { VehicleAlertSeverity } from "@/lib/vehicle-types";
import { isVehicleAsset, vehicleStatusLabel } from "@/lib/vehicle-types";
import { InventoryVehicleMileageModal } from "@/components/inventory-vehicle-mileage-modal";

function severityStyles(s: VehicleAlertSeverity): string {
  switch (s) {
    case "overdue":
      return "bg-red-500/20 text-red-100 ring-red-400/40";
    case "due_soon":
      return "bg-amber-500/20 text-amber-100 ring-amber-400/40";
    default:
      return "bg-emerald-500/20 text-emerald-100 ring-emerald-400/35";
  }
}

function severityLabel(s: VehicleAlertSeverity): string {
  switch (s) {
    case "overdue":
      return "Attention needed";
    case "due_soon":
      return "Due within 30 days / soon";
    default:
      return "All current";
  }
}

function vehicleTitle(a: AssetRow): string {
  const y = a.vehicle_year != null ? String(a.vehicle_year) : "—";
  const mk = a.vehicle_make?.trim() || "—";
  const md = a.vehicle_model?.trim() || a.name || "Vehicle";
  return `${y} ${mk} ${md}`.replace(/\s+/g, " ").trim();
}

export function InventoryVehiclesListClient() {
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isAdmin = canManageInventoryAdmin(role);

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<AssetRow[]>([]);
  const [filter, setFilter] = useState<"all" | "alerts">("all");
  const [mileageAsset, setMileageAsset] = useState<AssetRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("assets")
        .select("*")
        .eq("asset_type", "vehicle")
        .order("asset_number");
      if (error) throw error;
      setVehicles(
        (data ?? []).map((r) => mapAssetRow(r as Record<string, unknown>)),
      );
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load vehicles.",
        variant: "error",
      });
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "alerts")
      return vehicles.filter(
        (v) => isVehicleAsset(v) && vehicleNeedsAttentionFilter(v),
      );
    return vehicles;
  }, [vehicles, filter]);

  const printQr = async (a: AssetRow) => {
    const url = a.qr_code_url?.trim() || qrUrlForAsset(a.id);
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 });
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) {
        showToast({ message: "Allow pop-ups to print QR.", variant: "error" });
        return;
      }
      w.document.write(
        `<!DOCTYPE html><html><head><title>QR</title></head><body style="text-align:center;font-family:sans-serif;padding:24px"><img src="${dataUrl}" alt="" width="256" height="256"/><p style="margin-top:16px;font-weight:600">${a.asset_number}</p><p style="font-size:11px;word-break:break-all;color:#444">${url}</p><script>window.onload=function(){window.print();}</script></body></html>`,
      );
      w.document.close();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "QR failed.",
        variant: "error",
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-6xl flex-1 py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/inventory"
              className="text-sm text-violet-300 hover:underline"
            >
              ← Inventory
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Fleet vehicles
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Registration, inspection, insurance, oil, and service tracking.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-white/15 p-0.5">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  filter === "all"
                    ? "bg-violet-500/30 text-white"
                    : "text-white/55 hover:text-white"
                }`}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  filter === "alerts"
                    ? "bg-amber-500/25 text-amber-100"
                    : "text-white/55 hover:text-white"
                }`}
                onClick={() => setFilter("alerts")}
              >
                Alerts only
              </button>
            </div>
            {isAdmin ? (
              <Link
                href="/inventory/vehicles/new"
                className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-400"
              >
                Add vehicle
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-white/50">Loading vehicles…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-sm text-white/50">
            {filter === "alerts"
              ? "No vehicles with active alerts."
              : "No vehicles yet."}
            {isAdmin && filter === "all" ? (
              <>
                {" "}
                <Link
                  href="/inventory/vehicles/new"
                  className="text-violet-300 underline"
                >
                  Add the first vehicle
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {filtered.map((v) => {
              const sev = aggregateVehicleAlertSeverity(v);
              return (
                <li
                  key={v.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left shadow-lg shadow-black/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-violet-300/90">
                        {v.asset_number}
                      </p>
                      <h2 className="mt-1 text-base font-semibold text-white">
                        {vehicleTitle(v)}
                      </h2>
                      <p className="mt-1 text-sm text-white/55 tabular-nums">
                        Odometer:{" "}
                        {v.current_mileage != null
                          ? `${v.current_mileage.toLocaleString()} mi`
                          : "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${severityStyles(
                          sev,
                        )}`}
                      >
                        {severityLabel(sev)}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70 ring-1 ring-white/15">
                        {vehicleStatusLabel(v.status)}
                      </span>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs text-white/50">
                    <li>
                      Registration:{" "}
                      <span className="text-white/75">
                        {v.registration_expires ?? "—"}
                      </span>
                    </li>
                    <li>
                      Inspection:{" "}
                      <span className="text-white/75">
                        {v.inspection_expires ?? "—"}
                      </span>
                    </li>
                    <li>
                      Insurance:{" "}
                      <span className="text-white/75">
                        {v.insurance_expires ?? "—"}
                      </span>
                    </li>
                    <li>
                      Oil change:{" "}
                      <span className="text-white/75">
                        {v.last_oil_change_date ?? "—"}
                        {v.last_oil_change_mileage != null
                          ? ` @ ${v.last_oil_change_mileage.toLocaleString()} mi`
                          : ""}
                      </span>
                    </li>
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/inventory/vehicles/${v.id}`}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.06]"
                    >
                      View details
                    </Link>
                    <Link
                      href={`/inventory/vehicles/${v.id}?tab=service`}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.06]"
                    >
                      Log service
                    </Link>
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.06]"
                      onClick={() => setMileageAsset(v)}
                    >
                      Update mileage
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-violet-400/35 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/15"
                      onClick={() => void printQr(v)}
                    >
                      View QR code
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <InventoryVehicleMileageModal
        asset={mileageAsset}
        open={mileageAsset != null}
        onClose={() => setMileageAsset(null)}
        onSaved={() => void load()}
        showToast={showToast}
      />
    </div>
  );
}
