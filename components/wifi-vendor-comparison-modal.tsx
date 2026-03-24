"use client";

import { useMemo } from "react";
import {
  computeWifiPlan,
  isMeshVendor,
  WIFI_VENDOR_COMPARE_ORDER,
  type VendorChoice,
  type WifiAnalyzerInputs,
} from "@/lib/wifi-analyzer-engine";
import { vendorDisplayName } from "@/lib/wifi-field-documents";
import {
  VENDOR_COMPARISON_FOOTNOTES,
  VENDOR_COMPARISON_META,
} from "@/lib/wifi-vendor-catalog";

type Props = {
  open: boolean;
  onClose: () => void;
  inputs: WifiAnalyzerInputs;
  currentVendor: VendorChoice;
  /** Sets vendor and recomputes results using overridden vendor (same other inputs). */
  onSelectVendorAndRecalc: (v: VendorChoice) => void;
};

function apColumnLabel(v: VendorChoice, indoor: number, outdoor: number): string {
  const n = indoor + outdoor;
  if (n <= 0) return "—";
  if (isMeshVendor(v)) {
    return outdoor > 0 ? `${n} nodes (${indoor} in + ${outdoor} out)` : `${n} nodes`;
  }
  return outdoor > 0
    ? `${n} APs (${indoor} in + ${outdoor} out)`
    : `${n} APs`;
}

export function WifiVendorComparisonModal({
  open,
  onClose,
  inputs,
  currentVendor,
  onSelectVendorAndRecalc,
}: Props) {
  const rows = useMemo(() => {
    return WIFI_VENDOR_COMPARE_ORDER.map((v) => {
      try {
        const r = computeWifiPlan({ ...inputs, vendor: v });
        return { v, r, error: null as string | null };
      } catch (e) {
        return {
          v,
          r: null,
          error: e instanceof Error ? e.message : "Error",
        };
      }
    });
  }, [inputs]);

  const headerStats = useMemo(() => {
    try {
      const r = computeWifiPlan(inputs);
      return {
        rooms: r.totalRooms,
        sqft: r.buildingUsedSqFt,
        devices: r.totalDevices,
      };
    } catch {
      return null;
    }
  }, [inputs]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wifi-vendor-compare-title"
    >
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#0a1628] shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2
            id="wifi-vendor-compare-title"
            className="text-base font-semibold text-[#E8C84A]"
          >
            Vendor comparison for your project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-white/70 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <p className="border-b border-white/5 px-4 py-2 text-xs text-white/55">
          Based on {headerStats?.rooms ?? "—"} rooms ·{" "}
          {headerStats?.sqft?.toLocaleString() ?? "—"} sq ft (planning) ·{" "}
          {headerStats?.devices?.toLocaleString() ?? "—"} devices
        </p>
        <div className="max-h-[55vh] overflow-auto px-2 py-3 sm:px-4">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs text-white/88">
            <thead>
              <tr className="border-b border-white/15 text-[10px] uppercase tracking-wide text-white/55">
                <th className="py-2 pr-2">Vendor</th>
                <th className="py-2 pr-2">APs / nodes</th>
                <th className="py-2 pr-2">Est. materials</th>
                <th className="py-2 pr-2">Coverage</th>
                <th className="py-2 pr-2">Best for</th>
                <th className="py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ v, r, error }) => {
                const meta = VENDOR_COMPARISON_META[v] ?? {
                  stars: "—",
                  bestFor: "—",
                };
                return (
                  <tr
                    key={v}
                    className={`border-b border-white/8 ${
                      v === currentVendor ? "bg-[#E8C84A]/10" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium text-white">
                      {vendorDisplayName(v)}
                    </td>
                    <td className="py-2 pr-2">
                      {error || !r
                        ? "—"
                        : apColumnLabel(v, r.indoorAps, r.outdoorAps)}
                    </td>
                    <td className="py-2 pr-2 text-[#E8C84A]">
                      {error || !r ? "—" : r.hardwareCostEstimateLabel}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {meta.stars}
                    </td>
                    <td className="py-2 pr-2 text-white/70">{meta.bestFor}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        disabled={Boolean(error) || !r}
                        onClick={() => onSelectVendorAndRecalc(v)}
                        className="rounded border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-2 py-1 text-[11px] font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:opacity-40"
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-white/10 px-4 py-3 text-[11px] text-white/55">
          {VENDOR_COMPARISON_FOOTNOTES.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
