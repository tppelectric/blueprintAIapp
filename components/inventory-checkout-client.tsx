"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapAssetRow } from "@/lib/inventory-mappers";
import type { AssetRow } from "@/lib/inventory-types";
import { insertInventoryTransaction } from "@/lib/inventory-tx";
import { formatEmployeeName } from "@/lib/inventory-employee";
import { createBrowserClient } from "@/lib/supabase/client";

export function InventoryCheckoutClient() {
  const { showToast } = useAppToast();
  const { profile } = useUserRole();
  const userId = profile?.id ?? null;
  const employeeName = formatEmployeeName(profile ?? {});

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [checkinLoc, setCheckinLoc] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!userId) {
      setAssets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const [{ data: rows, error }, { data: locs }] = await Promise.all([
        sb
          .from("assets")
          .select("*")
          .eq("assigned_to", userId)
          .eq("status", "checked_out")
          .order("asset_number"),
        sb.from("asset_locations").select("id,name").order("name"),
      ]);
      if (error) throw error;
      setAssets((rows ?? []).map((r) => mapAssetRow(r as Record<string, unknown>)));
      setLocations(locs ?? []);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const checkInOne = async (a: AssetRow) => {
    if (!userId) return;
    const locId = checkinLoc[a.id]?.trim() || null;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({
          status: "available",
          assigned_to: null,
          assigned_to_name: null,
          location_id: locId,
        })
        .eq("id", a.id);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        asset_id: a.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: "checkin",
        to_location_id: locId,
      });
      showToast({ message: `Checked in: ${a.name}`, variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Check-in failed.",
        variant: "error",
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-lg flex-1 px-4 py-8">
        <Link
          href="/inventory"
          className="text-sm text-violet-300 hover:underline"
        >
          ← Inventory
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-white">
          My checkouts
        </h1>
        <p className="mt-2 text-base text-white/65">
          Tools and equipment currently assigned to you. Check in when you
          return them.
        </p>

        {!userId ? (
          <p className="mt-8 text-white/55">Sign in to see your checkouts.</p>
        ) : loading ? (
          <p className="mt-8 text-white/50">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/60">
            Nothing checked out. Scan a QR on the job site or use{" "}
            <Link href="/inventory/scan" className="text-violet-300 underline">
              Scan
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {assets.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-violet-500/25 bg-white/[0.04] p-4"
              >
                <p className="text-lg font-semibold text-white">{a.name}</p>
                <p className="font-mono text-sm text-violet-300">
                  {a.asset_number}
                </p>
                <label className="mt-3 block text-sm text-white/55">
                  Return to location
                  <select
                    className="app-input mt-1 w-full text-base"
                    value={checkinLoc[a.id] ?? ""}
                    onChange={(e) =>
                      setCheckinLoc((m) => ({
                        ...m,
                        [a.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">— Same / choose —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary mt-4 min-h-12 w-full py-3 text-base font-bold"
                  onClick={() => void checkInOne(a)}
                >
                  Check in
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
