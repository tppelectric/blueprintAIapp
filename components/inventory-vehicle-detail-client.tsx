"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapAssetRow } from "@/lib/inventory-mappers";
import type { AssetRow } from "@/lib/inventory-types";
import { mapVehicleDocumentRow, mapVehicleServiceHistoryRow } from "@/lib/vehicle-mappers";
import {
  nextOilChangeMilesRemaining,
  oilChangeSeverity,
  severityForDate,
} from "@/lib/vehicle-alerts";
import type { VehicleAlertSeverity } from "@/lib/vehicle-types";
import {
  type VehicleDocumentRow,
  type VehicleServiceHistoryRow,
  type VehicleServiceType,
  VEHICLE_SERVICE_TYPES,
  isVehicleAsset,
  vehicleStatusLabel,
} from "@/lib/vehicle-types";
import { canManageInventoryAdmin } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";
import { InventoryVehicleMileageModal } from "@/components/inventory-vehicle-mileage-modal";

type TabKey = "overview" | "maintenance" | "service" | "documents";

function sevClass(s: VehicleAlertSeverity): string {
  switch (s) {
    case "overdue":
      return "border-red-400/40 bg-red-500/10 text-red-100";
    case "due_soon":
      return "border-amber-400/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  }
}

function DateStatusCard({
  label,
  iso,
  extra,
}: {
  label: string;
  iso: string | null;
  extra?: string;
}) {
  const s = severityForDate(iso);
  return (
    <div className={`rounded-xl border p-3 ${sevClass(s)}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium tabular-nums">
        {iso ?? "—"}
        {extra ? <span className="block text-xs font-normal opacity-80">{extra}</span> : null}
      </p>
    </div>
  );
}

function NhtsaModal({
  open,
  onClose,
  make,
  model,
  year,
}: {
  open: boolean;
  onClose: () => void;
  make: string;
  model: string;
  year: string;
}) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setItems(null);
      setErr(null);
      return;
    }
    setBusy(true);
    const u = new URL("/api/vehicles/nhtsa-recalls", window.location.origin);
    u.searchParams.set("make", make);
    u.searchParams.set("model", model);
    u.searchParams.set("modelYear", year);
    void fetch(u.toString())
      .then(async (r) => {
        const j = (await r.json()) as Record<string, unknown>;
        if (!r.ok) throw new Error(String(j.error ?? r.status));
        const raw =
          (j.Results as unknown[]) ??
          (j.results as unknown[]) ??
          (j.items as unknown[]) ??
          [];
        const list = Array.isArray(raw)
          ? raw.filter((x) => x && typeof x === "object") as Record<
              string,
              unknown
            >[]
          : [];
        setItems(list);
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Lookup failed.");
        setItems([]);
      })
      .finally(() => setBusy(false));
  }, [open, make, model, year]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0c1829] p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-white">NHTSA recalls</h2>
        <p className="mt-1 text-xs text-white/55">
          {year} {make} {model}
        </p>
        {busy ? (
          <p className="mt-4 text-sm text-white/50">Checking…</p>
        ) : err ? (
          <p className="mt-4 text-sm text-red-200">{err}</p>
        ) : items && items.length === 0 ? (
          <p className="mt-4 text-sm text-emerald-200">No open recalls reported.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm text-white/85">
            {(items ?? []).map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
              >
                <p className="font-semibold text-amber-100">
                  {String(r.NHTSACampaignNumber ?? r.CampaignNumber ?? "Recall")}
                </p>
                {r.Component ? (
                  <p className="mt-1 text-xs text-white/60">
                    {String(r.Component)}
                  </p>
                ) : null}
                {r.Summary ? (
                  <p className="mt-2 text-xs leading-relaxed">{String(r.Summary)}</p>
                ) : null}
                {r.Remedy ? (
                  <p className="mt-2 text-xs text-white/70">
                    Remedy: {String(r.Remedy)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="mt-5 w-full rounded-lg border border-white/20 py-2 text-sm text-white/80 hover:bg-white/[0.06]"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ServiceRecordModal({
  open,
  assetId,
  onClose,
  onSaved,
  showToast,
}: {
  open: boolean;
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (o: { message: string; variant: "success" | "error" }) => void;
}) {
  const [type, setType] = useState<VehicleServiceType>("Oil Change");
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [nextD, setNextD] = useState("");
  const [nextM, setNextM] = useState("");
  const [regExp, setRegExp] = useState("");
  const [inspExp, setInspExp] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const mi = mileage.trim() ? parseInt(mileage.replace(/\D/g, ""), 10) : null;
      const co = cost.trim() ? Number(cost) : null;
      const row = {
        asset_id: assetId,
        service_type: type,
        service_date: date,
        mileage: mi != null && Number.isFinite(mi) ? mi : null,
        cost: co != null && Number.isFinite(co) ? co : null,
        vendor: vendor.trim() || null,
        notes: notes.trim() || null,
        next_service_date: nextD.trim() ? nextD.slice(0, 10) : null,
        next_service_mileage:
          nextM.trim() && Number.isFinite(parseInt(nextM, 10))
            ? parseInt(nextM, 10)
            : null,
        created_by: user?.id ?? null,
      };
      const { error: insErr } = await sb
        .from("vehicle_service_history")
        .insert(row);
      if (insErr) throw insErr;

      const patch: Record<string, unknown> = {
        last_service_date: date,
      };
      if (row.next_service_date) patch.next_service_date = row.next_service_date;
      if (notes.trim()) patch.next_service_notes = notes.trim();
      if (type === "Oil Change") {
        patch.last_oil_change_date = date;
        if (mi != null && Number.isFinite(mi)) patch.last_oil_change_mileage = mi;
      }
      if (type === "Registration" && regExp.trim()) {
        patch.registration_expires = regExp.slice(0, 10);
      }
      if (type === "Inspection" && inspExp.trim()) {
        patch.inspection_expires = inspExp.slice(0, 10);
      }

      const { error: upErr } = await sb
        .from("assets")
        .update(patch)
        .eq("id", assetId);
      if (upErr) throw upErr;

      showToast({ message: "Service record saved.", variant: "success" });
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0c1829] p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Add service record</h2>
        <label className="mt-4 block text-xs text-white/50">
          Service type
          <select
            className="app-input mt-1 w-full text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as VehicleServiceType)}
          >
            {VEHICLE_SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Date
          <input
            type="date"
            className="app-input mt-1 w-full text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Mileage
          <input
            className="app-input mt-1 w-full text-sm"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Cost
          <input
            className="app-input mt-1 w-full text-sm"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Vendor
          <input
            className="app-input mt-1 w-full text-sm"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Notes
          <textarea
            className="app-input mt-1 min-h-[64px] w-full text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Next service date (optional)
          <input
            type="date"
            className="app-input mt-1 w-full text-sm"
            value={nextD}
            onChange={(e) => setNextD(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Next service mileage (optional)
          <input
            className="app-input mt-1 w-full text-sm"
            value={nextM}
            onChange={(e) => setNextM(e.target.value)}
            inputMode="numeric"
          />
        </label>
        {type === "Registration" ? (
          <label className="mt-3 block text-xs text-white/50">
            New registration expiration (optional)
            <input
              type="date"
              className="app-input mt-1 w-full text-sm"
              value={regExp}
              onChange={(e) => setRegExp(e.target.value)}
            />
          </label>
        ) : null}
        {type === "Inspection" ? (
          <label className="mt-3 block text-xs text-white/50">
            New inspection expiration (optional)
            <input
              type="date"
              className="app-input mt-1 w-full text-sm"
              value={inspExp}
              onChange={(e) => setInspExp(e.target.value)}
            />
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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

function EditDateModal({
  open,
  title,
  value,
  onClose,
  onSave,
  showToast,
}: {
  open: boolean;
  title: string;
  value: string | null;
  onClose: () => void;
  onSave: (iso: string | null) => Promise<void>;
  showToast: (o: { message: string; variant: "success" | "error" }) => void;
}) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setV(value?.slice(0, 10) ?? "");
  }, [open, value]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(v.trim() ? v.slice(0, 10) : null);
      onClose();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0c1829] p-5">
        <h3 className="font-semibold text-white">{title}</h3>
        <input
          type="date"
          className="app-input mt-3 w-full text-sm"
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-violet-500 px-3 py-1.5 text-sm text-white"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryVehicleDetailClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id ?? "");
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isAdmin = canManageInventoryAdmin(role);

  const [tab, setTab] = useState<TabKey>("overview");
  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [history, setHistory] = useState<VehicleServiceHistoryRow[]>([]);
  const [docs, setDocs] = useState<VehicleDocumentRow[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mileageOpen, setMileageOpen] = useState(false);
  const [nhtsaOpen, setNhtsaOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editField, setEditField] = useState<
    | null
    | "registration_expires"
    | "inspection_expires"
    | "insurance_expires"
    | "next_oil_change_due_date"
    | "next_service_date"
  >(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data: a, error: ae } = await sb
        .from("assets")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (ae) throw ae;
      if (!a) {
        setAsset(null);
        return;
      }
      const row = mapAssetRow(a as Record<string, unknown>);
      setAsset(row);

      const { data: h } = await sb
        .from("vehicle_service_history")
        .select("*")
        .eq("asset_id", id)
        .order("service_date", { ascending: false });
      setHistory(
        (h ?? []).map((r) =>
          mapVehicleServiceHistoryRow(r as Record<string, unknown>),
        ),
      );

      const { data: d } = await sb
        .from("vehicle_documents")
        .select("*")
        .eq("asset_id", id)
        .order("created_at", { ascending: false });
      const docRows = (d ?? []).map((r) =>
        mapVehicleDocumentRow(r as Record<string, unknown>),
      );
      setDocs(docRows);

      const urls: Record<string, string> = {};
      for (const doc of docRows) {
        if (!doc.storage_path.trim()) continue;
        const { data: su } = await sb.storage
          .from("inventory-assets")
          .createSignedUrl(doc.storage_path.trim(), 3600);
        if (su?.signedUrl) urls[doc.id] = su.signedUrl;
      }
      setDocUrls(urls);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
      setAsset(null);
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "maintenance") setTab("maintenance");
    else if (t === "service") setTab("service");
    else if (t === "documents") setTab("documents");
    else setTab("overview");
  }, [searchParams]);

  const oilSev = asset ? oilChangeSeverity(asset) : "ok";
  const oilNextMiles = asset ? nextOilChangeMilesRemaining(asset) : null;
  const nhtsaMake = asset?.vehicle_make?.trim() || "";
  const nhtsaModel = asset?.vehicle_model?.trim() || "";
  const nhtsaYear = asset?.vehicle_year != null ? String(asset.vehicle_year) : "";

  const patchAssetField = async (
    field: string,
    val: string | null,
  ) => {
    const sb = createBrowserClient();
    const { error } = await sb
      .from("assets")
      .update({ [field]: val })
      .eq("id", id);
    if (error) throw error;
    showToast({ message: "Updated.", variant: "success" });
    void load();
  };

  const uploadDoc = async (file: File, docType: string) => {
    if (!file.size) return;
    const sb = createBrowserClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const path = `vehicles/${id}/${crypto.randomUUID()}_${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await sb.storage
      .from("inventory-assets")
      .upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await sb.from("vehicle_documents").insert({
      asset_id: id,
      doc_type: docType,
      file_name: file.name,
      storage_path: path,
      uploaded_by: user?.id ?? null,
    });
    if (insErr) throw insErr;
    showToast({ message: "Document uploaded.", variant: "success" });
    void load();
  };

  const maintenanceRows = useMemo(() => {
    if (!asset) return [];
    return [
      {
        key: "registration_expires" as const,
        label: "Registration renewal",
        date: asset.registration_expires,
      },
      {
        key: "inspection_expires" as const,
        label: "Inspection renewal",
        date: asset.inspection_expires,
      },
      {
        key: "insurance_expires" as const,
        label: "Insurance renewal",
        date: asset.insurance_expires,
      },
      {
        key: "next_oil_change_due_date" as const,
        label: "Oil change (date target)",
        date: asset.next_oil_change_due_date,
      },
      {
        key: "next_service_date" as const,
        label: "Next service",
        date: asset.next_service_date,
        notes: asset.next_service_notes,
      },
    ];
  }, [asset]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="inventory" showTppSubtitle />
        <main className="app-page-shell flex-1 py-10 text-sm text-white/50">
          Loading…
        </main>
      </div>
    );
  }

  if (!asset || !isVehicleAsset(asset)) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="inventory" showTppSubtitle />
        <main className="app-page-shell flex-1 py-10">
          <p className="text-white/80">Vehicle not found.</p>
          <Link href="/inventory/vehicles" className="mt-4 text-violet-300 underline">
            ← Fleet
          </Link>
        </main>
      </div>
    );
  }

  const tabs: { k: TabKey; label: string }[] = [
    { k: "overview", label: "Overview" },
    { k: "maintenance", label: "Maintenance" },
    { k: "service", label: "Service history" },
    { k: "documents", label: "Documents" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-8 md:py-10">
        <Link
          href="/inventory/vehicles"
          className="text-sm text-violet-300 hover:underline"
        >
          ← Fleet vehicles
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-300/90">
              {asset.asset_number}
            </p>
            <h1 className="text-2xl font-semibold text-white">{asset.name}</h1>
            <p className="mt-1 text-sm text-white/55">
              {vehicleStatusLabel(asset.status)} · Odometer{" "}
              {asset.current_mileage != null
                ? `${asset.current_mileage.toLocaleString()} mi`
                : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.06]"
              onClick={() => setMileageOpen(true)}
            >
              Update mileage
            </button>
            {nhtsaMake && nhtsaModel && nhtsaYear ? (
              <button
                type="button"
                className="rounded-lg border border-violet-400/35 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/15"
                onClick={() => setNhtsaOpen(true)}
              >
                Check NHTSA recalls
              </button>
            ) : null}
          </div>
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
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h2 className="text-sm font-semibold text-violet-200">
                Vehicle info
              </h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-white/45">Year / Make / Model</dt>
                  <dd className="text-white">
                    {[asset.vehicle_year, asset.vehicle_make, asset.vehicle_model]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/45">Color</dt>
                  <dd className="text-white">{asset.vehicle_color ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">License plate</dt>
                  <dd className="text-white">{asset.license_plate ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">VIN</dt>
                  <dd className="break-all text-white">{asset.vin ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">E-ZPass ID</dt>
                  <dd className="text-white">{asset.ezpass_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Insurance</dt>
                  <dd className="text-white">
                    {asset.insurance_provider ?? "—"}
                    {asset.insurance_policy_number
                      ? ` · #${asset.insurance_policy_number}`
                      : ""}
                  </dd>
                </div>
              </dl>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <DateStatusCard
                label="Registration"
                iso={asset.registration_expires}
              />
              <DateStatusCard
                label="Inspection"
                iso={asset.inspection_expires}
              />
              <DateStatusCard
                label="Insurance"
                iso={asset.insurance_expires}
              />
              <div className={`rounded-xl border p-3 ${sevClass(oilSev)}`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  Oil change
                </p>
                <p className="mt-1 text-sm">
                  Last: {asset.last_oil_change_date ?? "—"}
                  {asset.last_oil_change_mileage != null
                    ? ` @ ${asset.last_oil_change_mileage.toLocaleString()} mi`
                    : ""}
                </p>
                <p className="mt-1 text-xs opacity-90">
                  Next (mi):{" "}
                  {oilNextMiles != null
                    ? `${oilNextMiles > 0 ? oilNextMiles : 0} mi remaining`
                    : "—"}
                  {asset.next_oil_change_due_date
                    ? ` · or by ${asset.next_oil_change_due_date}`
                    : ""}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 sm:col-span-2 ${sevClass(
                  severityForDate(asset.next_service_date),
                )}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  Next service
                </p>
                <p className="mt-1 text-sm font-medium">
                  {asset.next_service_date ?? "—"}
                </p>
                {asset.next_service_notes ? (
                  <p className="mt-1 text-xs opacity-85">
                    {asset.next_service_notes}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "maintenance" ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase text-white/50">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Date / detail</th>
                  <th className="px-3 py-2">Status</th>
                  {isAdmin ? <th className="px-3 py-2"> </th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {maintenanceRows.map((r) => {
                  const s = severityForDate(r.date);
                  return (
                    <tr key={r.key} className="text-white/85">
                      <td className="px-3 py-2 font-medium">{r.label}</td>
                      <td className="px-3 py-2 tabular-nums text-white/70">
                        {r.date ?? "—"}
                        {"notes" in r && r.notes ? (
                          <span className="mt-1 block text-xs text-white/50">
                            {r.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                            s === "overdue"
                              ? "bg-red-500/20 text-red-100 ring-red-400/40"
                              : s === "due_soon"
                                ? "bg-amber-500/20 text-amber-100 ring-amber-400/40"
                                : "bg-emerald-500/20 text-emerald-100 ring-emerald-400/35"
                          }`}
                        >
                          {s === "overdue"
                            ? "Overdue"
                            : s === "due_soon"
                              ? "Due soon"
                              : "OK"}
                        </span>
                      </td>
                      {isAdmin ? (
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-violet-300 hover:underline"
                            onClick={() => setEditField(r.key)}
                          >
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "service" ? (
          <div className="mt-6 space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                onClick={() => setServiceOpen(true)}
              >
                Add service record
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase text-white/50">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Mileage</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white/85">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-white/45">
                        No service records yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-3 py-2 tabular-nums">{h.service_date}</td>
                        <td className="px-3 py-2">{h.service_type}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {h.mileage != null ? h.mileage.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {h.cost != null ? `$${Number(h.cost).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2">{h.vendor ?? "—"}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-xs text-white/65">
                          {h.notes ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "documents" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-sm font-semibold text-violet-200">Upload</h3>
              <DocumentUploadForm
                onUpload={(file, dt) =>
                  void uploadDoc(file, dt).catch((e) =>
                    showToast({
                      message:
                        e instanceof Error ? e.message : "Upload failed.",
                      variant: "error",
                    }),
                  )
                }
              />
            </div>
            <ul className="space-y-2">
              {docs.length === 0 ? (
                <li className="text-sm text-white/45">No documents yet.</li>
              ) : (
                docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                  >
                    <span className="text-white/80">
                      <span className="font-medium capitalize">{d.doc_type}</span>
                      {" · "}
                      {d.file_name}
                    </span>
                    {docUrls[d.id] ? (
                      <a
                        href={docUrls[d.id]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-300 hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-white/40">Link expired — refresh</span>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </main>

      <InventoryVehicleMileageModal
        asset={asset}
        open={mileageOpen}
        onClose={() => setMileageOpen(false)}
        onSaved={() => void load()}
        showToast={showToast}
      />

      <NhtsaModal
        open={nhtsaOpen}
        onClose={() => setNhtsaOpen(false)}
        make={nhtsaMake}
        model={nhtsaModel}
        year={nhtsaYear}
      />

      <ServiceRecordModal
        open={serviceOpen}
        assetId={id}
        onClose={() => setServiceOpen(false)}
        onSaved={() => void load()}
        showToast={showToast}
      />

      <EditDateModal
        open={editField != null}
        title={
          editField === "registration_expires"
            ? "Registration expiration"
            : editField === "inspection_expires"
              ? "Inspection expiration"
              : editField === "insurance_expires"
                ? "Insurance expiration"
                : editField === "next_oil_change_due_date"
                  ? "Next oil change (date)"
                  : "Next service date"
        }
        value={
          editField && asset
            ? (asset[editField] as string | null)
            : null
        }
        onClose={() => setEditField(null)}
        onSave={async (iso) => {
          if (!editField) return;
          await patchAssetField(editField, iso);
        }}
        showToast={showToast}
      />
    </div>
  );
}

function DocumentUploadForm({
  onUpload,
}: {
  onUpload: (file: File, docType: string) => void;
}) {
  const [docType, setDocType] = useState("registration");
  const inputId = "vehicle-doc-file";
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs text-white/50">
        Document type
        <select
          className="app-input mt-1 block text-sm"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
        >
          <option value="registration">Registration card</option>
          <option value="insurance">Insurance card</option>
          <option value="inspection">Inspection / certificate</option>
          <option value="title">Title</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="text-xs text-white/50">
        File
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf,application/pdf"
          className="mt-1 block w-full max-w-xs text-sm text-white/70 file:mr-2 file:rounded-lg file:border-0 file:bg-violet-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f, docType);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
