"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  mapAssetRow,
  mapLocationRow,
  mapMaterialRow,
  isLowStock,
} from "@/lib/inventory-mappers";
import type {
  AssetLocationRow,
  AssetLocationType,
  AssetRow,
  InventoryAssetStatus,
  InventoryAssetType,
  MaterialRow,
} from "@/lib/inventory-types";
import {
  qrUrlForAsset,
  qrUrlForLocation,
  qrUrlForMaterial,
} from "@/lib/inventory-qr";
import { downloadInventoryQrPdfSheet } from "@/lib/inventory-qr-pdf";
import { canManageInventoryAdmin } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";

type TabKey = "assets" | "materials" | "locations" | "qr";

const LOC_LABEL: Record<AssetLocationType, string> = {
  warehouse: "Warehouse",
  truck: "Truck",
  job_site: "Job Site",
  boiler_room: "Boiler Room",
  office: "Office",
};

const ASSET_TYPE_LABEL: Record<InventoryAssetType, string> = {
  tool: "Tool",
  equipment: "Equipment",
  other: "Other",
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

function displayName(
  profiles: Record<string, { first_name?: string | null; last_name?: string | null; email?: string | null }>,
  userId: string | null,
): string {
  if (!userId) return "—";
  const p = profiles[userId];
  if (!p) return userId.slice(0, 8) + "…";
  const f = (p.first_name ?? "").trim();
  const l = (p.last_name ?? "").trim();
  if (f || l) return [f, l].filter(Boolean).join(" ");
  return (p.email ?? "").trim() || "—";
}

export function InventoryDashboardClient() {
  const { showToast } = useAppToast();
  const searchParams = useSearchParams();
  const { role, profile } = useUserRole();
  const isAdmin = canManageInventoryAdmin(role);
  const userId = profile?.id ?? null;

  const [tab, setTab] = useState<TabKey>("assets");
  const [locations, setLocations] = useState<AssetLocationRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [profiles, setProfiles] = useState<
    Record<
      string,
      { first_name?: string | null; last_name?: string | null; email?: string | null }
    >
  >({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeF, setAssetTypeF] = useState("");
  const [assetStatusF, setAssetStatusF] = useState("");
  const [assetLocF, setAssetLocF] = useState("");

  const [matSearch, setMatSearch] = useState("");

  const [qrPick, setQrPick] = useState<Set<string>>(new Set());
  const [qrBusy, setQrBusy] = useState(false);

  const [modal, setModal] = useState<
    | { kind: "none" }
    | { kind: "asset_form"; mode: "add" | "edit"; draft: Partial<AssetRow> & { id?: string } }
    | { kind: "material_form"; mode: "add" | "edit"; draft: Partial<MaterialRow> & { id?: string } }
    | { kind: "location_form"; mode: "add" | "edit"; draft: Partial<AssetLocationRow> & { id?: string } }
    | { kind: "checkin"; asset: AssetRow; locationId: string }
    | { kind: "move_asset"; asset: AssetRow; locationId: string }
    | { kind: "mat_qty"; material: MaterialRow; delta: number; mode: "add" | "use" }
    | { kind: "mat_job"; material: MaterialRow; qty: number; jobId: string }
  >({ kind: "none" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const [locRes, astRes, matRes, jobRes] = await Promise.all([
        sb.from("asset_locations").select("*").order("name"),
        sb.from("assets").select("*").order("asset_number"),
        sb.from("materials_inventory").select("*").order("name"),
        sb.from("jobs").select("id,job_name,job_number").order("updated_at", { ascending: false }).limit(200),
      ]);
      if (locRes.error) throw locRes.error;
      if (astRes.error) throw astRes.error;
      if (matRes.error) throw matRes.error;

      const locs = (locRes.data ?? []).map((r) =>
        mapLocationRow(r as Record<string, unknown>),
      );
      const asts = (astRes.data ?? []).map((r) =>
        mapAssetRow(r as Record<string, unknown>),
      );
      const mats = (matRes.data ?? []).map((r) =>
        mapMaterialRow(r as Record<string, unknown>),
      );
      setLocations(locs);
      setAssets(asts);
      setMaterials(mats);

      setJobs(
        (jobRes.data ?? []).map((j) => ({
          id: j.id as string,
          label: `${String(j.job_number ?? "").trim() || "—"} · ${String(j.job_name ?? "").trim() || "Job"}`,
        })),
      );

      const uids = [
        ...new Set(asts.map((a) => a.checked_out_to).filter(Boolean)),
      ] as string[];
      const pmap: typeof profiles = {};
      if (uids.length) {
        const { data: profs } = await sb
          .from("user_profiles")
          .select("id,first_name,last_name,email")
          .in("id", uids);
        for (const p of profs ?? []) {
          pmap[(p as { id: string }).id] = p as (typeof profiles)[string];
        }
      }
      setProfiles(pmap);

      const nextPhotos: Record<string, string> = {};
      for (const a of asts) {
        if (a.photo_url && /^https?:\/\//i.test(a.photo_url)) {
          nextPhotos[a.id] = a.photo_url;
          continue;
        }
        if (a.photo_path?.trim()) {
          const { data } = await sb.storage
            .from("inventory-assets")
            .createSignedUrl(a.photo_path.trim(), 3600);
          if (data?.signedUrl) nextPhotos[a.id] = data.signedUrl;
        }
      }
      setPhotoUrls(nextPhotos);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load inventory.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "materials" || t === "locations" || t === "qr") setTab(t);
    const lid = searchParams.get("locationId");
    if (lid) setAssetLocF(lid);
  }, [searchParams]);

  const locById = useMemo(() => {
    const m = new Map<string, AssetLocationRow>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  const itemCountByLocation = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of locations) m.set(l.id, 0);
    for (const a of assets) {
      if (a.location_id) m.set(a.location_id, (m.get(a.location_id) ?? 0) + 1);
    }
    for (const mat of materials) {
      if (mat.location_id)
        m.set(mat.location_id, (m.get(mat.location_id) ?? 0) + 1);
    }
    return m;
  }, [locations, assets, materials]);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    return assets.filter((a) => {
      if (assetTypeF && a.asset_type !== assetTypeF) return false;
      if (assetStatusF && a.status !== assetStatusF) return false;
      if (assetLocF && a.location_id !== assetLocF) return false;
      if (q) {
        const hay = `${a.name} ${a.asset_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, assetSearch, assetTypeF, assetStatusF, assetLocF]);

  const filteredMaterials = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    return materials.filter((m) => {
      if (!q) return true;
      const hay = `${m.name} ${m.part_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [materials, matSearch]);

  const logTransaction = async (
    sb: ReturnType<typeof createBrowserClient>,
    row: {
      asset_id?: string | null;
      material_id?: string | null;
      transaction_type: string;
      quantity_delta?: number | null;
      from_location_id?: string | null;
      to_location_id?: string | null;
      job_id?: string | null;
      notes?: string | null;
    },
  ) => {
    if (!userId) return;
    await sb.from("asset_transactions").insert({
      ...row,
      user_id: userId,
    });
  };

  const checkOut = async (a: AssetRow) => {
    if (!userId) {
      showToast({ message: "Sign in to check out.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({ status: "checked_out", checked_out_to: userId })
        .eq("id", a.id);
      if (error) throw error;
      await logTransaction(sb, {
        asset_id: a.id,
        transaction_type: "check_out",
        from_location_id: a.location_id,
        notes: null,
      });
      showToast({ message: `Checked out: ${a.name}`, variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Check out failed.",
        variant: "error",
      });
    }
  };

  const openCheckIn = (a: AssetRow) => {
    setModal({
      kind: "checkin",
      asset: a,
      locationId: a.location_id ?? locations[0]?.id ?? "",
    });
  };

  const submitCheckIn = async () => {
    if (modal.kind !== "checkin" || !userId) return;
    const locId = modal.locationId.trim() || null;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({
          status: "available",
          checked_out_to: null,
          location_id: locId,
        })
        .eq("id", modal.asset.id);
      if (error) throw error;
      await logTransaction(sb, {
        asset_id: modal.asset.id,
        transaction_type: "check_in",
        to_location_id: locId,
        notes: null,
      });
      showToast({ message: "Checked in.", variant: "success" });
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Check in failed.",
        variant: "error",
      });
    }
  };

  const openMove = (a: AssetRow) => {
    setModal({
      kind: "move_asset",
      asset: a,
      locationId: a.location_id ?? locations[0]?.id ?? "",
    });
  };

  const submitMove = async () => {
    if (modal.kind !== "move_asset" || !userId) return;
    const from = modal.asset.location_id;
    const to = modal.locationId.trim() || null;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({ location_id: to })
        .eq("id", modal.asset.id);
      if (error) throw error;
      await logTransaction(sb, {
        asset_id: modal.asset.id,
        transaction_type: "move",
        from_location_id: from,
        to_location_id: to,
      });
      showToast({ message: "Location updated.", variant: "success" });
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Move failed.",
        variant: "error",
      });
    }
  };

  const saveAsset = async () => {
    if (modal.kind !== "asset_form" || !userId) return;
    const d = modal.draft;
    const row = {
      asset_number: String(d.asset_number ?? "").trim(),
      name: String(d.name ?? "").trim(),
      asset_type: d.asset_type ?? "tool",
      status: d.status ?? "available",
      location_id: d.location_id?.trim() || null,
      checked_out_to:
        d.status === "checked_out" ? d.checked_out_to ?? userId : null,
      photo_path: d.photo_path?.trim() || null,
      photo_url: d.photo_url?.trim() || null,
      notes: d.notes?.trim() || null,
    };
    if (!row.asset_number || !row.name) {
      showToast({ message: "Name and number required.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      if (modal.mode === "add") {
        const { error } = await sb.from("assets").insert(row);
        if (error) throw error;
        showToast({ message: "Asset created.", variant: "success" });
      } else if (d.id) {
        const { error } = await sb.from("assets").update(row).eq("id", d.id);
        if (error) throw error;
        showToast({ message: "Asset updated.", variant: "success" });
      }
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    }
  };

  const saveMaterial = async () => {
    if (modal.kind !== "material_form") return;
    const d = modal.draft;
    const row = {
      name: String(d.name ?? "").trim(),
      part_number: d.part_number?.trim() || null,
      current_quantity: Number(d.current_quantity ?? 0),
      minimum_quantity: Number(d.minimum_quantity ?? 0),
      unit: String(d.unit ?? "ea").trim() || "ea",
      location_id: d.location_id?.trim() || null,
    };
    if (!row.name) {
      showToast({ message: "Material name required.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      if (modal.mode === "add") {
        const { error } = await sb.from("materials_inventory").insert(row);
        if (error) throw error;
        showToast({ message: "Material created.", variant: "success" });
      } else if (d.id) {
        const { error } = await sb
          .from("materials_inventory")
          .update(row)
          .eq("id", d.id);
        if (error) throw error;
        showToast({ message: "Material updated.", variant: "success" });
      }
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    }
  };

  const saveLocation = async () => {
    if (modal.kind !== "location_form") return;
    const d = modal.draft;
    const row = {
      name: String(d.name ?? "").trim(),
      location_type: d.location_type ?? "warehouse",
    };
    if (!row.name) {
      showToast({ message: "Location name required.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      if (modal.mode === "add") {
        const { error } = await sb.from("asset_locations").insert(row);
        if (error) throw error;
        showToast({ message: "Location created.", variant: "success" });
      } else if (d.id) {
        const { error } = await sb
          .from("asset_locations")
          .update(row)
          .eq("id", d.id);
        if (error) throw error;
        showToast({ message: "Location updated.", variant: "success" });
      }
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    }
  };

  const applyMaterialQty = async () => {
    if (modal.kind !== "mat_qty" || !userId) return;
    const { material, delta, mode } = modal;
    if (!Number.isFinite(delta) || delta <= 0) {
      showToast({ message: "Enter a positive amount.", variant: "error" });
      return;
    }
    const next =
      mode === "add"
        ? material.current_quantity + delta
        : material.current_quantity - delta;
    if (next < 0) {
      showToast({ message: "Not enough stock.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("materials_inventory")
        .update({ current_quantity: next })
        .eq("id", material.id);
      if (error) throw error;
      await logTransaction(sb, {
        material_id: material.id,
        transaction_type: mode === "add" ? "material_add" : "material_use",
        quantity_delta: mode === "add" ? delta : -delta,
        to_location_id: material.location_id,
      });
      showToast({ message: "Quantity updated.", variant: "success" });
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    }
  };

  const applyMaterialJob = async () => {
    if (modal.kind !== "mat_job" || !userId) return;
    const { material, qty, jobId } = modal;
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast({ message: "Enter quantity.", variant: "error" });
      return;
    }
    if (!jobId.trim()) {
      showToast({ message: "Choose a job.", variant: "error" });
      return;
    }
    const next = material.current_quantity - qty;
    if (next < 0) {
      showToast({ message: "Not enough stock.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("materials_inventory")
        .update({ current_quantity: next })
        .eq("id", material.id);
      if (error) throw error;
      await logTransaction(sb, {
        material_id: material.id,
        transaction_type: "material_use_job",
        quantity_delta: -qty,
        job_id: jobId.trim(),
        from_location_id: material.location_id,
      });
      showToast({ message: "Logged use on job.", variant: "success" });
      setModal({ kind: "none" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    }
  };

  const printQr = async (url: string, title: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 });
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) {
        showToast({ message: "Allow pop-ups to print QR.", variant: "error" });
        return;
      }
      w.document.write(
        `<!DOCTYPE html><html><head><title>QR</title></head><body style="text-align:center;font-family:sans-serif;padding:24px"><img src="${dataUrl}" alt="" width="256" height="256"/><p style="margin-top:16px;font-weight:600">${title}</p><p style="font-size:11px;word-break:break-all;color:#444">${url}</p><script>window.onload=function(){window.print();}</script></body></html>`,
      );
      w.document.close();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "QR failed.",
        variant: "error",
      });
    }
  };

  const toggleQrPick = (key: string) => {
    setQrPick((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const downloadQrPdf = async () => {
    setQrBusy(true);
    try {
      const items: { url: string; label: string }[] = [];
      for (const key of qrPick) {
        const [kind, id] = key.split(":");
        if (kind === "a") {
          const a = assets.find((x) => x.id === id);
          if (a) items.push({ url: qrUrlForAsset(id), label: `${a.asset_number} · ${a.name}` });
        } else if (kind === "l") {
          const l = locations.find((x) => x.id === id);
          if (l) items.push({ url: qrUrlForLocation(id), label: `Loc · ${l.name}` });
        } else if (kind === "m") {
          const m = materials.find((x) => x.id === id);
          if (m) items.push({ url: qrUrlForMaterial(id), label: `Mat · ${m.name}` });
        }
      }
      if (items.length === 0) {
        showToast({ message: "Select at least one item.", variant: "error" });
        return;
      }
      await downloadInventoryQrPdfSheet(items, "Inventory QR codes");
      showToast({ message: "PDF downloaded.", variant: "success" });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "PDF failed.",
        variant: "error",
      });
    } finally {
      setQrBusy(false);
    }
  };

  const tabs: { k: TabKey; label: string }[] = [
    { k: "assets", label: "Assets" },
    { k: "materials", label: "Materials" },
    { k: "locations", label: "Locations" },
    { k: "qr", label: "QR Codes" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-6xl flex-1 py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/dashboard" className="text-sm text-violet-300 hover:underline">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Inventory
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Tools, materials, and storage locations with QR tracking.
            </p>
          </div>
          <Link
            href="/inventory/scan"
            className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-400"
          >
            Scan QR
          </Link>
        </div>

        <div
          className="mt-8 flex min-w-0 flex-wrap gap-1 border-b border-violet-500/20 pb-0"
          role="tablist"
        >
          {tabs.map(({ k, label }) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold ${
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

        {loading ? (
          <p className="mt-8 text-sm text-white/50">Loading inventory…</p>
        ) : null}

        {!loading && tab === "assets" ? (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-white/50">
                Search
                <input
                  className="app-input mt-1 block w-48 text-sm"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  placeholder="Name or number"
                />
              </label>
              <label className="text-xs text-white/50">
                Type
                <select
                  className="app-input mt-1 block text-sm"
                  value={assetTypeF}
                  onChange={(e) => setAssetTypeF(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="tool">Tool</option>
                  <option value="equipment">Equipment</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Status
                <select
                  className="app-input mt-1 block text-sm"
                  value={assetStatusF}
                  onChange={(e) => setAssetStatusF(e.target.value)}
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
                  className="app-input mt-1 block min-w-[10rem] text-sm"
                  value={assetLocF}
                  onChange={(e) => setAssetLocF(e.target.value)}
                >
                  <option value="">All</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin ? (
                <button
                  type="button"
                  className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                  onClick={() =>
                    setModal({
                      kind: "asset_form",
                      mode: "add",
                      draft: {
                        asset_type: "tool",
                        status: "available",
                        location_id: locations[0]?.id ?? null,
                      },
                    })
                  }
                >
                  Add Asset
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAssets.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 ring-1 ring-violet-500/10"
                >
                  <div className="flex gap-3">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 text-2xl text-white/30">
                      {photoUrls[a.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrls[a.id]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span aria-hidden>🔧</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{a.name}</p>
                      <p className="font-mono text-sm text-violet-300">
                        {a.asset_number}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
                          {ASSET_TYPE_LABEL[a.asset_type]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeClass(a.status)}`}
                        >
                          {statusLabel(a.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/50">
                    Location:{" "}
                    <span className="text-white/80">
                      {a.location_id
                        ? locById.get(a.location_id)?.name ?? "—"
                        : "—"}
                    </span>
                  </p>
                  {a.status === "checked_out" ? (
                    <p className="mt-1 text-xs text-white/50">
                      Assigned to:{" "}
                      <span className="text-amber-200/90">
                        {displayName(profiles, a.checked_out_to)}
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.status === "available" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-xs font-bold text-[#0a1628]"
                        onClick={() => void checkOut(a)}
                      >
                        Check Out
                      </button>
                    ) : null}
                    {a.status === "checked_out" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600/90 px-2.5 py-1.5 text-xs font-bold text-white"
                        onClick={() => openCheckIn(a)}
                      >
                        Check In
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-white/80"
                      onClick={() => openMove(a)}
                    >
                      Move
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="rounded-lg border border-violet-400/40 px-2.5 py-1.5 text-xs text-violet-200"
                        onClick={() =>
                          setModal({
                            kind: "asset_form",
                            mode: "edit",
                            draft: { ...a },
                          })
                        }
                      >
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70"
                      onClick={() =>
                        void printQr(qrUrlForAsset(a.id), a.asset_number)
                      }
                    >
                      Print QR
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {filteredAssets.length === 0 ? (
              <p className="text-sm text-white/45">No assets match filters.</p>
            ) : null}
          </section>
        ) : null}

        {!loading && tab === "materials" ? (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-white/50">
                Search
                <input
                  className="app-input mt-1 block w-48 text-sm"
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                  placeholder="Name or part #"
                />
              </label>
              {isAdmin ? (
                <button
                  type="button"
                  className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                  onClick={() =>
                    setModal({
                      kind: "material_form",
                      mode: "add",
                      draft: {
                        unit: "ea",
                        current_quantity: 0,
                        minimum_quantity: 0,
                        location_id: locations[0]?.id ?? null,
                      },
                    })
                  }
                >
                  Add Material
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredMaterials.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{m.name}</p>
                      {m.part_number ? (
                        <p className="text-xs text-white/45">
                          Part #{m.part_number}
                        </p>
                      ) : null}
                    </div>
                    {isLowStock(m) ? (
                      <span className="shrink-0 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-bold text-red-200">
                        Low stock
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-lg font-bold text-violet-200">
                    {m.current_quantity}{" "}
                    <span className="text-sm font-normal text-white/60">
                      {m.unit}
                    </span>
                  </p>
                  <p className="text-xs text-white/50">
                    Min {m.minimum_quantity} {m.unit} · Loc:{" "}
                    {m.location_id
                      ? locById.get(m.location_id)?.name ?? "—"
                      : "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600/80 px-2.5 py-1.5 text-xs font-semibold text-white"
                      onClick={() =>
                        setModal({
                          kind: "mat_qty",
                          material: m,
                          delta: 1,
                          mode: "add",
                        })
                      }
                    >
                      Add Stock
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-amber-600/80 px-2.5 py-1.5 text-xs font-semibold text-[#0a1628]"
                      onClick={() =>
                        setModal({
                          kind: "mat_job",
                          material: m,
                          qty: 1,
                          jobId: jobs[0]?.id ?? "",
                        })
                      }
                    >
                      Use on Job
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-white/80"
                      onClick={() =>
                        setModal({
                          kind: "mat_qty",
                          material: m,
                          delta: 1,
                          mode: "use",
                        })
                      }
                    >
                      Use (internal)
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="rounded-lg border border-violet-400/40 px-2.5 py-1.5 text-xs text-violet-200"
                        onClick={() =>
                          setModal({
                            kind: "material_form",
                            mode: "edit",
                            draft: { ...m },
                          })
                        }
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && tab === "locations" ? (
          <section className="mt-6 space-y-4">
            {isAdmin ? (
              <button
                type="button"
                className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                onClick={() =>
                  setModal({
                    kind: "location_form",
                    mode: "add",
                    draft: { location_type: "warehouse" },
                  })
                }
              >
                Add Location
              </button>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {locations.map((l) => (
                <div
                  key={l.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <p className="font-semibold text-white">{l.name}</p>
                  <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">
                    {LOC_LABEL[l.location_type]}
                  </span>
                  <p className="mt-3 text-sm text-white/60">
                    <span className="font-bold text-violet-200">
                      {itemCountByLocation.get(l.id) ?? 0}
                    </span>{" "}
                    items stored
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-white/80"
                      onClick={() =>
                        void printQr(qrUrlForLocation(l.id), l.name)
                      }
                    >
                      Print QR Code
                    </button>
                    <Link
                      href={`/inventory?tab=assets&locationId=${l.id}`}
                      className="rounded-lg bg-violet-500/20 px-2.5 py-1.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/30"
                    >
                      View Items
                    </Link>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="rounded-lg border border-violet-400/40 px-2.5 py-1.5 text-xs text-violet-200"
                        onClick={() =>
                          setModal({
                            kind: "location_form",
                            mode: "edit",
                            draft: { ...l },
                          })
                        }
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && tab === "qr" ? (
          <section className="mt-6 space-y-6">
            <p className="text-sm text-white/55">
              Select assets, locations, or materials, then download a PDF sheet
              of QR codes. Codes open the scan page for quick check-in/out.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={qrBusy}
                className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                onClick={() => void downloadQrPdf()}
              >
                {qrBusy ? "Building PDF…" : "Download PDF sheet"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80"
                onClick={() => setQrPick(new Set())}
              >
                Clear selection
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-violet-300/90">
                  Assets
                </h3>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2 text-sm">
                  {assets.map((a) => {
                    const key = `a:${a.id}`;
                    return (
                      <li key={a.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-white/80">
                          <input
                            type="checkbox"
                            checked={qrPick.has(key)}
                            onChange={() => toggleQrPick(key)}
                          />
                          {a.asset_number} · {a.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-violet-300/90">
                  Locations
                </h3>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2 text-sm">
                  {locations.map((l) => {
                    const key = `l:${l.id}`;
                    return (
                      <li key={l.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-white/80">
                          <input
                            type="checkbox"
                            checked={qrPick.has(key)}
                            onChange={() => toggleQrPick(key)}
                          />
                          {l.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-violet-300/90">
                  Materials
                </h3>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2 text-sm">
                  {materials.map((m) => {
                    const key = `m:${m.id}`;
                    return (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-white/80">
                          <input
                            type="checkbox"
                            checked={qrPick.has(key)}
                            onChange={() => toggleQrPick(key)}
                          />
                          {m.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {modal.kind !== "none" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#0a1628] p-5">
            {modal.kind === "checkin" ? (
              <>
                <h3 className="text-lg font-semibold text-white">Check in</h3>
                <p className="mt-1 text-sm text-white/55">{modal.asset.name}</p>
                <label className="mt-4 block text-xs text-white/50">
                  Return to location
                  <select
                    className="app-input mt-1 w-full text-sm"
                    value={modal.locationId}
                    onChange={(e) =>
                      setModal({ ...modal, locationId: e.target.value })
                    }
                  >
                    <option value="">— None —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void submitCheckIn()}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "move_asset" ? (
              <>
                <h3 className="text-lg font-semibold text-white">Move asset</h3>
                <p className="mt-1 text-sm text-white/55">{modal.asset.name}</p>
                <label className="mt-4 block text-xs text-white/50">
                  New location
                  <select
                    className="app-input mt-1 w-full text-sm"
                    value={modal.locationId}
                    onChange={(e) =>
                      setModal({ ...modal, locationId: e.target.value })
                    }
                  >
                    <option value="">— None —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void submitMove()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "mat_qty" ? (
              <>
                <h3 className="text-lg font-semibold text-white">
                  {modal.mode === "add" ? "Add stock" : "Use material"}
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  {modal.material.name}
                </p>
                <label className="mt-4 block text-xs text-white/50">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    className="app-input mt-1 w-full text-sm"
                    value={modal.delta}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        delta: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void applyMaterialQty()}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "mat_job" ? (
              <>
                <h3 className="text-lg font-semibold text-white">
                  Use on job
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  {modal.material.name}
                </p>
                <label className="mt-4 block text-xs text-white/50">
                  Job
                  <select
                    className="app-input mt-1 w-full text-sm"
                    value={modal.jobId}
                    onChange={(e) =>
                      setModal({ ...modal, jobId: e.target.value })
                    }
                  >
                    <option value="">Select job…</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-xs text-white/50">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    className="app-input mt-1 w-full text-sm"
                    value={modal.qty}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        qty: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void applyMaterialJob()}
                  >
                    Log use
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "asset_form" ? (
              <>
                <h3 className="text-lg font-semibold text-white">
                  {modal.mode === "add" ? "Add asset" : "Edit asset"}
                </h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs text-white/50">
                    Asset number
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.asset_number ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            asset_number: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Name
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.name ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: { ...modal.draft, name: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Type
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.asset_type ?? "tool"}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            asset_type: e.target.value as InventoryAssetType,
                          },
                        })
                      }
                    >
                      <option value="tool">Tool</option>
                      <option value="equipment">Equipment</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="block text-xs text-white/50">
                    Status
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.status ?? "available"}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            status: e.target.value as InventoryAssetStatus,
                          },
                        })
                      }
                    >
                      <option value="available">Available</option>
                      <option value="checked_out">Checked out</option>
                      <option value="in_repair">In repair</option>
                      <option value="retired">Retired</option>
                    </select>
                  </label>
                  <label className="block text-xs text-white/50">
                    Location
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.location_id ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            location_id: e.target.value || null,
                          },
                        })
                      }
                    >
                      <option value="">— None —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-white/50">
                    Photo URL (optional)
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.photo_url ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            photo_url: e.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Storage path (optional)
                    <input
                      className="app-input mt-1 w-full text-sm"
                      placeholder="inventory-assets bucket path"
                      value={modal.draft.photo_path ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            photo_path: e.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Notes
                    <textarea
                      className="app-input mt-1 min-h-[3rem] w-full text-sm"
                      value={modal.draft.notes ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: { ...modal.draft, notes: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void saveAsset()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "material_form" ? (
              <>
                <h3 className="text-lg font-semibold text-white">
                  {modal.mode === "add" ? "Add material" : "Edit material"}
                </h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs text-white/50">
                    Name
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.name ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: { ...modal.draft, name: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Part number
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.part_number ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            part_number: e.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Current qty
                    <input
                      type="number"
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.current_quantity ?? 0}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            current_quantity: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Minimum qty
                    <input
                      type="number"
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.minimum_quantity ?? 0}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            minimum_quantity: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Unit
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.unit ?? "ea"}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: { ...modal.draft, unit: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Location
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.location_id ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            location_id: e.target.value || null,
                          },
                        })
                      }
                    >
                      <option value="">— None —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void saveMaterial()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "location_form" ? (
              <>
                <h3 className="text-lg font-semibold text-white">
                  {modal.mode === "add" ? "Add location" : "Edit location"}
                </h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs text-white/50">
                    Name
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.name ?? ""}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: { ...modal.draft, name: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    Type
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={modal.draft.location_type ?? "warehouse"}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          draft: {
                            ...modal.draft,
                            location_type: e.target.value as AssetLocationType,
                          },
                        })
                      }
                    >
                      <option value="warehouse">Warehouse</option>
                      <option value="truck">Truck</option>
                      <option value="job_site">Job Site</option>
                      <option value="boiler_room">Boiler Room</option>
                      <option value="office">Office</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11"
                    onClick={() => void saveLocation()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
