"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { AssetRow } from "@/lib/inventory-types";
import { nextOilChangeMilesRemaining } from "@/lib/vehicle-alerts";

type Props = {
  asset: AssetRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  showToast: (o: { message: string; variant: "success" | "error" }) => void;
};

export function InventoryVehicleMileageModal({
  asset,
  open,
  onClose,
  onSaved,
  showToast,
}: Props) {
  const [mileage, setMileage] = useState("");
  const [asOf, setAsOf] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !asset) return;
    setMileage(
      asset.current_mileage != null ? String(asset.current_mileage) : "",
    );
    setAsOf(new Date().toISOString().slice(0, 10));
  }, [open, asset]);

  const previewMilesLeft = useMemo(() => {
    if (!asset) return null;
    const m = parseInt(mileage.replace(/\D/g, ""), 10);
    if (!Number.isFinite(m)) return null;
    const fake: AssetRow = { ...asset, current_mileage: m };
    return nextOilChangeMilesRemaining(fake);
  }, [asset, mileage]);

  if (!open || !asset) return null;

  const submit = async () => {
    const m = parseInt(mileage.replace(/\D/g, ""), 10);
    if (!Number.isFinite(m) || m < 0) {
      showToast({ message: "Enter a valid odometer reading.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({
          current_mileage: m,
          mileage_updated_at: asOf,
        })
        .eq("id", asset.id);
      if (error) throw error;
      showToast({ message: "Mileage updated.", variant: "success" });
      onSaved();
      onClose();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="mileage-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0c1829] p-5 shadow-xl">
        <h2
          id="mileage-modal-title"
          className="text-lg font-semibold text-white"
        >
          Update mileage
        </h2>
        <p className="mt-1 text-sm text-white/55">
          {asset.asset_number} · {asset.name}
        </p>
        <label className="mt-4 block text-xs text-white/50">
          Current mileage (odometer)
          <input
            type="text"
            inputMode="numeric"
            className="app-input mt-1 w-full text-sm"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder="e.g. 45230"
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Reading date
          <input
            type="date"
            className="app-input mt-1 w-full text-sm"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        {previewMilesLeft != null ? (
          <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            Next oil change in{" "}
            <span className="font-semibold tabular-nums">
              {previewMilesLeft}
            </span>{" "}
            miles
            {previewMilesLeft <= 0 ? " (due now)" : null}
          </p>
        ) : (
          <p className="mt-3 text-xs text-white/45">
            Set a last oil change mileage on the vehicle to estimate miles until
            the next service.
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/[0.06]"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
