"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { formatEmployeeName } from "@/lib/inventory-employee";
import { mapAssetRow, mapLocationRow } from "@/lib/inventory-mappers";
import type {
  AssetLocationRow,
  AssetRow,
  InventoryAssetStatus,
} from "@/lib/inventory-types";
import { createBrowserClient } from "@/lib/supabase/client";

type ProfileLite = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

function statusBadgeClass(s: InventoryAssetStatus): string {
  switch (s) {
    case "available":
      return "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30";
    case "checked_out":
      return "bg-amber-500/20 text-amber-100 ring-amber-400/35";
    case "in_repair":
      return "bg-orange-500/20 text-orange-100 ring-orange-400/35";
    case "retired":
      return "bg-white/10 text-white/50 ring-white/15";
    default:
      return "bg-white/10 text-white/70";
  }
}

function statusLabel(s: InventoryAssetStatus): string {
  switch (s) {
    case "checked_out":
      return "Checked Out";
    case "in_repair":
      return "In Repair";
    default:
      return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

export function InventoryToolsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [locById, setLocById] = useState<Map<string, AssetLocationRow>>(
    new Map(),
  );
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<"" | InventoryAssetStatus>("");
  const [locF, setLocF] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();

      const { data: rawAssets, error: ae } = await sb
        .from("assets")
        .select("*")
        .in("asset_type", ["tool", "equipment"])
        .order("asset_number", { ascending: true });

      if (ae) throw ae;
      const rows = (rawAssets ?? []).map((r) =>
        mapAssetRow(r as Record<string, unknown>),
      );
      setAssets(rows);

      const { data: locs, error: le } = await sb
        .from("asset_locations")
        .select("id,name,location_type,description,address,qr_code_url,created_at");
      if (!le && locs) {
        const m = new Map<string, AssetLocationRow>();
        for (const l of locs) {
          const row = mapLocationRow(l as Record<string, unknown>);
          m.set(row.id, row);
        }
        setLocById(m);
      } else {
        setLocById(new Map());
      }

      const uids = [
        ...new Set(
          rows
            .map((a) => a.assigned_to)
            .filter((x): x is string => Boolean(x?.trim())),
        ),
      ];
      const pmap: Record<string, ProfileLite> = {};
      if (uids.length) {
        try {
          const { data: profs, error: pe } = await sb
            .from("user_profiles")
            .select("id,first_name,last_name,full_name,email")
            .in("id", uids);
          if (!pe && profs) {
            for (const p of profs) {
              const pl = p as ProfileLite;
              pmap[pl.id] = pl;
            }
          }
        } catch {
          /* ignore */
        }
      }
      setProfiles(pmap);
    } catch {
      setAssets([]);
      setLocById(new Map());
      setProfiles({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusF && a.status !== statusF) return false;
      if (locF) {
        if (locF === "__unassigned__") {
          if (a.location_id) return false;
        } else if (a.location_id !== locF) {
          return false;
        }
      }
      if (!q) return true;
      const name = a.name.toLowerCase();
      const num = a.asset_number.toLowerCase();
      return name.includes(q) || num.includes(q);
    });
  }, [assets, search, statusF, locF]);

  const locationOptions = useMemo(() => {
    return [...locById.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [locById]);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-6xl flex-1 py-8 md:py-10">
        <Link
          href="/inventory"
          className="text-sm text-violet-300 hover:underline"
        >
          ← Inventory
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-white md:text-3xl">
          Tool Inventory
        </h1>
        <p className="mt-1 text-sm text-white/55">
          {loading ? "…" : `${assets.length} tools and equipment`}
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-xs text-white/50">
            Search
            <input
              className="app-input mt-1 block w-48 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or asset #"
            />
          </label>
          <label className="text-xs text-white/50">
            Status
            <select
              className="app-input mt-1 block min-w-[10rem] text-sm"
              value={statusF}
              onChange={(e) =>
                setStatusF(e.target.value as "" | InventoryAssetStatus)
              }
            >
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="checked_out">Checked out</option>
              <option value="in_repair">In repair</option>
              <option value="retired">Retired</option>
            </select>
          </label>
          <label className="text-xs text-white/50">
            Location
            <select
              className="app-input mt-1 block min-w-[12rem] text-sm"
              value={locF}
              onChange={(e) => setLocF(e.target.value)}
            >
              <option value="">All locations</option>
              <option value="__unassigned__">Unassigned</option>
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04]">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <th key={i} className="px-3 py-3">
                      <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((r) => (
                  <tr key={r} className="border-b border-white/5">
                    {[1, 2, 3, 4, 5, 6].map((c) => (
                      <td key={c} className="px-3 py-4">
                        <div className="h-4 animate-pulse rounded bg-white/10" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : assets.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<span aria-hidden>🔧</span>}
              title="No tools or equipment"
              description="Add tools and equipment in the main inventory dashboard to see them here."
              actionLabel="Open inventory"
              actionHref="/inventory"
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-sm text-white/45">No tools match filters.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04] text-[11px] font-bold uppercase tracking-wide text-violet-200">
                  <th className="px-3 py-3">Asset #</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Assigned To</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const loc = a.location_id
                    ? locById.get(a.location_id)
                    : undefined;
                  const isVehicleLoc =
                    loc?.location_type === "truck" ||
                    loc?.location_type === "fleet";
                  const assignee = a.assigned_to
                    ? profiles[a.assigned_to]
                    : undefined;
                  const assignName = assignee
                    ? formatEmployeeName(assignee)
                    : a.assigned_to_name?.trim() || "—";
                  return (
                    <tr
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer border-b border-white/5 odd:bg-white/[0.02] hover:bg-white/[0.05]"
                      onClick={() => router.push(`/inventory/${a.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/inventory/${a.id}`);
                        }
                      }}
                    >
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-violet-200">
                        {a.asset_number}
                      </td>
                      <td className="px-3 py-3 font-medium text-white">
                        {a.name}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeClass(a.status)}`}
                        >
                          {statusLabel(a.status)}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-3 py-3 text-white/75">
                        {loc ? (
                          <span className="inline-flex items-center gap-1 truncate">
                            {isVehicleLoc ? (
                              <span aria-hidden>🚛</span>
                            ) : null}
                            <span className="truncate">{loc.name}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-white/70">{assignName}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/inventory/${a.id}`}
                          className="text-xs font-semibold text-violet-300 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
