"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapLocationRow } from "@/lib/inventory-mappers";
import type { AssetLocationRow } from "@/lib/inventory-types";
import { qrUrlForAsset } from "@/lib/inventory-qr";
import { createBrowserClient } from "@/lib/supabase/client";
import { canManageInventoryAdmin } from "@/lib/user-roles";

type Draft = {
  asset_number: string;
  name: string;
  description: string;
  location_id: string;
  status: string;
  purchase_date: string;
  purchase_price: string;
  vehicle_year: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  license_plate: string;
  vin: string;
  ezpass_id: string;
  insurance_provider: string;
  insurance_policy_number: string;
  registration_expires: string;
  inspection_expires: string;
  insurance_expires: string;
  current_mileage: string;
  last_oil_change_date: string;
  last_oil_change_mileage: string;
  oil_change_interval_miles: string;
  next_oil_change_due_date: string;
  next_service_date: string;
  next_service_notes: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  asset_number: "",
  name: "",
  description: "",
  location_id: "",
  status: "available",
  purchase_date: "",
  purchase_price: "",
  vehicle_year: "",
  vehicle_make: "",
  vehicle_model: "",
  vehicle_color: "",
  license_plate: "",
  vin: "",
  ezpass_id: "",
  insurance_provider: "",
  insurance_policy_number: "",
  registration_expires: "",
  inspection_expires: "",
  insurance_expires: "",
  current_mileage: "",
  last_oil_change_date: "",
  last_oil_change_mileage: "",
  oil_change_interval_miles: "5000",
  next_oil_change_due_date: "",
  next_service_date: "",
  next_service_notes: "",
  notes: "",
});

function optDate(s: string): string | null {
  const t = s.trim();
  return t ? t.slice(0, 10) : null;
}

function optNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function optInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function InventoryVehicleAddClient() {
  const { showToast } = useAppToast();
  const { role, loading: roleLoading } = useUserRole();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [locations, setLocations] = useState<AssetLocationRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadLocs = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("asset_locations")
        .select("*")
        .order("name");
      if (error) throw error;
      setLocations(
        (data ?? []).map((r) => mapLocationRow(r as Record<string, unknown>)),
      );
    } catch {
      setLocations([]);
    }
  }, []);

  useEffect(() => {
    void loadLocs();
  }, [loadLocs]);

  const submit = async () => {
    const num = draft.asset_number.trim();
    if (!num) {
      showToast({ message: "TPP asset number is required.", variant: "error" });
      return;
    }
    const interval = optInt(draft.oil_change_interval_miles) ?? 5000;
    const autoName =
      draft.name.trim() ||
      [
        draft.vehicle_year.trim(),
        draft.vehicle_make.trim(),
        draft.vehicle_model.trim(),
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      num;

    setBusy(true);
    try {
      const sb = createBrowserClient();
      const row: Record<string, unknown> = {
        asset_number: num,
        name: autoName,
        asset_type: "vehicle",
        description: draft.description.trim() || null,
        location_id: draft.location_id.trim() || null,
        status: draft.status,
        purchase_date: optDate(draft.purchase_date),
        purchase_price: optNum(draft.purchase_price),
        serial_number: draft.vin.trim() || null,
        notes: draft.notes.trim() || null,
        vehicle_year: optInt(draft.vehicle_year),
        vehicle_make: draft.vehicle_make.trim() || null,
        vehicle_model: draft.vehicle_model.trim() || null,
        vehicle_color: draft.vehicle_color.trim() || null,
        license_plate: draft.license_plate.trim() || null,
        vin: draft.vin.trim() || null,
        ezpass_id: draft.ezpass_id.trim() || null,
        insurance_provider: draft.insurance_provider.trim() || null,
        insurance_policy_number: draft.insurance_policy_number.trim() || null,
        registration_expires: optDate(draft.registration_expires),
        inspection_expires: optDate(draft.inspection_expires),
        insurance_expires: optDate(draft.insurance_expires),
        current_mileage: optInt(draft.current_mileage),
        last_oil_change_date: optDate(draft.last_oil_change_date),
        last_oil_change_mileage: optInt(draft.last_oil_change_mileage),
        oil_change_interval_miles: interval,
        next_oil_change_due_date: optDate(draft.next_oil_change_due_date),
        next_service_date: optDate(draft.next_service_date),
        next_service_notes: draft.next_service_notes.trim() || null,
      };

      const { data: created, error } = await sb
        .from("assets")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      const newId = (created as { id?: string } | null)?.id;
      if (newId) {
        await sb
          .from("assets")
          .update({ qr_code_url: qrUrlForAsset(newId) })
          .eq("id", newId);
      }
      showToast({ message: "Vehicle added.", variant: "success" });
      if (newId) router.push(`/inventory/vehicles/${newId}`);
      else router.push("/inventory/vehicles");
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const f =
    (k: keyof Draft) =>
    (
      e: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  if (roleLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="inventory" showTppSubtitle />
        <main className="app-page-shell flex-1 py-10 text-sm text-white/50">
          Loading…
        </main>
      </div>
    );
  }

  if (!canManageInventoryAdmin(role)) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="inventory" showTppSubtitle />
        <main className="app-page-shell flex-1 py-10">
          <p className="text-white/80">Admin access required.</p>
          <Link
            href="/inventory/vehicles"
            className="mt-4 inline-block text-violet-300 hover:underline"
          >
            ← Fleet vehicles
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-3xl flex-1 py-8 md:py-10">
        <Link
          href="/inventory/vehicles"
          className="text-sm text-violet-300 hover:underline"
        >
          ← Fleet vehicles
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Add vehicle</h1>
        <p className="mt-1 text-sm text-white/55">
          TPP asset number (e.g. TPP-V001), compliance dates, and identifiers.
        </p>

        <div className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <section>
            <h2 className="text-sm font-semibold text-violet-200">Identity</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/50">
                TPP asset # *
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.asset_number}
                  onChange={f("asset_number")}
                  placeholder="TPP-V001"
                />
              </label>
              <label className="text-xs text-white/50">
                Display name (optional)
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.name}
                  onChange={f("name")}
                  placeholder="Defaults from Y/M/M"
                />
              </label>
              <label className="text-xs text-white/50 sm:col-span-2">
                Location
                <select
                  className="app-input mt-1 w-full text-sm"
                  value={draft.location_id}
                  onChange={f("location_id")}
                >
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-white/50">
                Status
                <select
                  className="app-input mt-1 w-full text-sm"
                  value={draft.status}
                  onChange={f("status")}
                >
                  <option value="available">Available</option>
                  <option value="checked_out">In use</option>
                  <option value="in_repair">Maintenance</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-violet-200">Vehicle</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/50">
                Year
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.vehicle_year}
                  onChange={f("vehicle_year")}
                  inputMode="numeric"
                />
              </label>
              <label className="text-xs text-white/50">
                Make
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.vehicle_make}
                  onChange={f("vehicle_make")}
                />
              </label>
              <label className="text-xs text-white/50">
                Model
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.vehicle_model}
                  onChange={f("vehicle_model")}
                />
              </label>
              <label className="text-xs text-white/50">
                Color
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.vehicle_color}
                  onChange={f("vehicle_color")}
                />
              </label>
              <label className="text-xs text-white/50">
                License plate
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.license_plate}
                  onChange={f("license_plate")}
                />
              </label>
              <label className="text-xs text-white/50">
                VIN
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.vin}
                  onChange={f("vin")}
                />
              </label>
              <label className="text-xs text-white/50">
                E-ZPass ID
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.ezpass_id}
                  onChange={f("ezpass_id")}
                />
              </label>
              <label className="text-xs text-white/50">
                Current mileage
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.current_mileage}
                  onChange={f("current_mileage")}
                  inputMode="numeric"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-violet-200">Insurance</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/50">
                Provider
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.insurance_provider}
                  onChange={f("insurance_provider")}
                />
              </label>
              <label className="text-xs text-white/50">
                Policy #
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.insurance_policy_number}
                  onChange={f("insurance_policy_number")}
                />
              </label>
              <label className="text-xs text-white/50">
                Insurance expires
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={draft.insurance_expires}
                  onChange={f("insurance_expires")}
                />
              </label>
              <label className="text-xs text-white/50">
                Registration expires
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={draft.registration_expires}
                  onChange={f("registration_expires")}
                />
              </label>
              <label className="text-xs text-white/50">
                Inspection expires
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={draft.inspection_expires}
                  onChange={f("inspection_expires")}
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-violet-200">
              Oil & service
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/50">
                Oil interval (miles)
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.oil_change_interval_miles}
                  onChange={f("oil_change_interval_miles")}
                  inputMode="numeric"
                />
              </label>
              <label className="text-xs text-white/50">
                Last oil change date
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={draft.last_oil_change_date}
                  onChange={f("last_oil_change_date")}
                />
              </label>
              <label className="text-xs text-white/50">
                Last oil @ mileage
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.last_oil_change_mileage}
                  onChange={f("last_oil_change_mileage")}
                  inputMode="numeric"
                />
              </label>
              <label className="text-xs text-white/50">
                Next oil due (date)
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={draft.next_oil_change_due_date}
                  onChange={f("next_oil_change_due_date")}
                />
              </label>
              <label className="text-xs text-white/50">
                Next service date
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={draft.next_service_date}
                  onChange={f("next_service_date")}
                />
              </label>
              <label className="text-xs text-white/50 sm:col-span-2">
                Next service notes
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={draft.next_service_notes}
                  onChange={f("next_service_notes")}
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-violet-200">Other</h2>
            <label className="mt-3 block text-xs text-white/50">
              Purchase date
              <input
                type="date"
                className="app-input mt-1 w-full text-sm"
                value={draft.purchase_date}
                onChange={f("purchase_date")}
              />
            </label>
            <label className="mt-3 block text-xs text-white/50">
              Purchase price
              <input
                className="app-input mt-1 w-full text-sm"
                value={draft.purchase_price}
                onChange={f("purchase_price")}
                inputMode="decimal"
              />
            </label>
            <label className="mt-3 block text-xs text-white/50">
              Description
              <textarea
                className="app-input mt-1 min-h-[72px] w-full text-sm"
                value={draft.description}
                onChange={f("description")}
              />
            </label>
            <label className="mt-3 block text-xs text-white/50">
              Notes
              <textarea
                className="app-input mt-1 min-h-[72px] w-full text-sm"
                value={draft.notes}
                onChange={f("notes")}
              />
            </label>
          </section>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Link
              href="/inventory/vehicles"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/[0.06]"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : "Save vehicle"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
