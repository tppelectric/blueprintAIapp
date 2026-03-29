"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { formatEmployeeName } from "@/lib/inventory-employee";
import { mapAssetRow, mapLocationRow, mapTransactionRow } from "@/lib/inventory-mappers";
import type {
  AssetLocationRow,
  AssetRow,
  AssetTransactionRow,
  InventoryAssetStatus,
} from "@/lib/inventory-types";
import { canManageInventoryAdmin } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";

type TabKey = "overview" | "history";

type ProfileLite = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

const ASSET_TYPE_LABEL: Record<string, string> = {
  tool: "Tool",
  material: "Material",
  equipment: "Equipment",
  vehicle: "Vehicle",
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

function formatCurrency(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function formatTxDate(iso: string): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function transactionActionLabel(t: string): string {
  const x = t.trim().toLowerCase().replace(/_/g, " ");
  if (!x) return "—";
  return x.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function InventoryAssetDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isAdmin = canManageInventoryAdmin(role);

  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [locationRow, setLocationRow] = useState<AssetLocationRow | null>(null);
  const [assignee, setAssignee] = useState<ProfileLite | null>(null);
  const [transactions, setTransactions] = useState<AssetTransactionRow[]>([]);
  const [allLocations, setAllLocations] = useState<AssetLocationRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    description: string;
    status: InventoryAssetStatus;
    location_id: string;
    notes: string;
    serial_number: string;
  } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id?.trim()) {
      setLoading(false);
      setError("Missing asset id.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();

      const { data: raw, error: ae } = await sb
        .from("assets")
        .select("*")
        .eq("id", id)
        .single();

      if (ae || !raw) {
        setAsset(null);
        setError(
          ae?.message?.includes("No rows") || ae?.code === "PGRST116"
            ? "Asset not found."
            : ae?.message ?? "Could not load asset.",
        );
        return;
      }

      const row = mapAssetRow(raw as Record<string, unknown>);
      setAsset(row);

      if (row.location_id) {
        try {
          const { data: loc, error: le } = await sb
            .from("asset_locations")
            .select("id,name,location_type")
            .eq("id", row.location_id)
            .single();
          if (!le && loc) {
            setLocationRow(mapLocationRow(loc as Record<string, unknown>));
          } else {
            setLocationRow(null);
          }
        } catch {
          setLocationRow(null);
        }
      } else {
        setLocationRow(null);
      }

      if (row.assigned_to) {
        try {
          const { data: prof, error: pe } = await sb
            .from("user_profiles")
            .select("id,first_name,last_name,full_name,email")
            .eq("id", row.assigned_to)
            .single();
          if (!pe && prof) setAssignee(prof as ProfileLite);
          else setAssignee(null);
        } catch {
          setAssignee(null);
        }
      } else {
        setAssignee(null);
      }

      try {
        const { data: txRows, error: te } = await sb
          .from("asset_transactions")
          .select("*")
          .eq("asset_id", id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (!te && txRows) {
          setTransactions(
            txRows.map((r) => mapTransactionRow(r as Record<string, unknown>)),
          );
        } else {
          setTransactions([]);
        }
      } catch {
        setTransactions([]);
      }

      if (isAdmin) {
        try {
          const { data: locs, error: locErr } = await sb
            .from("asset_locations")
            .select("id,name,location_type,description,address,qr_code_url,created_at")
            .order("name", { ascending: true });
          if (!locErr && locs) {
            setAllLocations(
              locs.map((l) => mapLocationRow(l as Record<string, unknown>)),
            );
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setAsset(null);
    } finally {
      setLoading(false);
    }
  }, [id, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (asset && editing) {
      setEditDraft({
        name: asset.name,
        description: asset.description ?? "",
        status: asset.status,
        location_id: asset.location_id ?? "",
        notes: asset.notes ?? "",
        serial_number: asset.serial_number ?? "",
      });
    }
  }, [asset, editing]);

  const assignedDisplay = useMemo(() => {
    if (!asset?.assigned_to) return "—";
    if (assignee) return formatEmployeeName(assignee);
    if (asset.assigned_to_name?.trim()) return asset.assigned_to_name.trim();
    return "—";
  }, [asset, assignee]);

  const saveEdit = async () => {
    if (!asset || !editDraft) return;
    setSaveBusy(true);
    try {
      const sb = createBrowserClient();
      const { error: upErr } = await sb
        .from("assets")
        .update({
          name: editDraft.name.trim(),
          description: editDraft.description.trim() || null,
          status: editDraft.status,
          location_id: editDraft.location_id.trim() || null,
          notes: editDraft.notes.trim() || null,
          serial_number: editDraft.serial_number.trim() || null,
        })
        .eq("id", asset.id);
      if (upErr) throw upErr;
      showToast({ message: "Asset updated.", variant: "success" });
      setEditing(false);
      await load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="inventory" showTppSubtitle />
        <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-8 md:py-10">
          <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-9 w-2/3 max-w-md animate-pulse rounded-lg bg-white/10" />
          <div className="mt-6 flex gap-2">
            <div className="h-10 w-28 animate-pulse rounded-lg bg-white/10" />
            <div className="h-10 w-28 animate-pulse rounded-lg bg-white/10" />
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="h-40 animate-pulse rounded-xl bg-white/10" />
            <div className="h-40 animate-pulse rounded-xl bg-white/10" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="inventory" showTppSubtitle />
        <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-8 md:py-10">
          <div className="rounded-xl border border-red-500/35 bg-red-950/25 px-4 py-5">
            <p className="font-medium text-red-200">{error ?? "Not found."}</p>
            <Link
              href="/inventory"
              className="mt-3 inline-block text-sm text-violet-300 hover:underline"
            >
              ← Inventory
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const tabs: { k: TabKey; label: string }[] = [
    { k: "overview", label: "Overview" },
    { k: "history", label: "History" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-8 md:py-10">
        <Link
          href="/inventory"
          className="text-sm text-violet-300 hover:underline"
        >
          ← Inventory
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-white md:text-3xl">
            {asset.name}
          </h1>
          {isAdmin && !editing ? (
            <button
              type="button"
              className="rounded-lg border border-violet-400/40 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/15"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-violet-500/20 px-2 py-1 font-mono text-xs font-semibold text-violet-200 ring-1 ring-violet-400/30">
            {asset.asset_number}
          </span>
          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
            {ASSET_TYPE_LABEL[asset.asset_type] ?? asset.asset_type}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeClass(asset.status)}`}
          >
            {statusLabel(asset.status)}
          </span>
        </div>

        <div
          className="mt-6 flex min-w-0 gap-1 overflow-x-auto border-b border-violet-500/20 pb-0"
          role="tablist"
        >
          {tabs.map(({ k, label }) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold ${
                tab === k
                  ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30"
                  : "text-white/55 hover:bg-white/[0.04]"
              }`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="mt-6 space-y-6">
            {editing && editDraft ? (
              <section className="rounded-2xl border border-violet-500/25 bg-white/[0.04] p-4">
                <h2 className="text-sm font-semibold text-violet-200">
                  Edit asset
                </h2>
                <div className="mt-3 space-y-3">
                  <label className="block text-xs text-white/50">
                    Name
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={editDraft.name}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, name: e.target.value })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Description
                    <textarea
                      className="app-input mt-1 min-h-[72px] w-full text-sm"
                      value={editDraft.description}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Status
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={editDraft.status}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          status: e.target.value as InventoryAssetStatus,
                        })
                      }
                    >
                      <option value="available">Available</option>
                      <option value="checked_out">Checked Out</option>
                      <option value="in_repair">In Repair</option>
                      <option value="retired">Retired</option>
                    </select>
                  </label>
                  <label className="block text-xs text-white/50">
                    Location
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={editDraft.location_id}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          location_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {allLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-white/50">
                    Serial number
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={editDraft.serial_number}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          serial_number: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Notes
                    <textarea
                      className="app-input mt-1 min-h-[64px] w-full text-sm"
                      value={editDraft.notes}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, notes: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={saveBusy}
                    onClick={() => void saveEdit()}
                  >
                    {saveBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
                    disabled={saveBusy}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h2 className="text-sm font-semibold text-violet-200">Details</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-white/45">Location</dt>
                  <dd className="text-white">
                    {locationRow?.name?.trim() ? locationRow.name : "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/45">Assigned to</dt>
                  <dd className="text-white">{assignedDisplay}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Serial number</dt>
                  <dd className="text-white">{asset.serial_number?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Purchase date</dt>
                  <dd className="text-white">
                    {asset.purchase_date?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/45">Purchase price</dt>
                  <dd className="text-white">
                    {formatCurrency(asset.purchase_price)}
                  </dd>
                </div>
                {asset.notes?.trim() ? (
                  <div className="sm:col-span-2">
                    <dt className="text-white/45">Notes</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-white/85">
                      {asset.notes}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {asset.description?.trim() ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <h2 className="text-sm font-semibold text-violet-200">
                  Description
                </h2>
                <p className="mt-2 text-sm text-white/85">{asset.description}</p>
              </section>
            ) : null}

            {asset.asset_type === "vehicle" ? (
              <p className="text-sm">
                <Link
                  href={`/inventory/vehicles/${asset.id}`}
                  className="font-semibold text-violet-300 hover:underline"
                >
                  View full vehicle details →
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase text-white/50">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/85">
                {transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-white/45"
                    >
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 tabular-nums text-white/70">
                        {formatTxDate(t.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        {transactionActionLabel(t.transaction_type)}
                      </td>
                      <td className="px-3 py-2">
                        {t.employee_name?.trim() ||
                          (t.employee_id
                            ? t.employee_id.slice(0, 8) + "…"
                            : "—")}
                      </td>
                      <td className="max-w-[240px] px-3 py-2 text-xs text-white/60">
                        {t.notes?.trim() || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}
