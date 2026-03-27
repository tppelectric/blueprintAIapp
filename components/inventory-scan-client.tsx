"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import jsQR from "jsqr";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapAssetRow, mapLocationRow, mapMaterialRow } from "@/lib/inventory-mappers";
import type { AssetLocationRow, AssetRow, MaterialRow } from "@/lib/inventory-types";
import { formatEmployeeName } from "@/lib/inventory-employee";
import { parseScanPayload } from "@/lib/inventory-qr";
import { insertInventoryTransaction } from "@/lib/inventory-tx";
import {
  enqueueInventoryOp,
  isOffline,
  peekOfflineQueue,
} from "@/lib/inventory-offline-queue";
import { flushInventoryOfflineQueue } from "@/lib/inventory-offline-flush";
import { isUuid } from "@/lib/is-uuid";
import { createBrowserClient } from "@/lib/supabase/client";

export function InventoryScanClient() {
  const { showToast } = useAppToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useUserRole();
  const userId = profile?.id ?? null;
  const employeeName = useMemo(
    () => formatEmployeeName(profile ?? {}),
    [profile],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastDecoded, setLastDecoded] = useState<string | null>(null);

  const [assetId, setAssetId] = useState<string | null>(null);
  const [assetNumber, setAssetNumber] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [offlinePending, setOfflinePending] = useState(0);

  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [location, setLocation] = useState<AssetLocationRow | null>(null);
  const [material, setMaterial] = useState<MaterialRow | null>(null);
  const [locItemCount, setLocItemCount] = useState(0);
  const [locations, setLocations] = useState<AssetLocationRow[]>([]);
  const [materialsAtLoc, setMaterialsAtLoc] = useState<MaterialRow[]>([]);
  const [allMaterials, setAllMaterials] = useState<MaterialRow[]>([]);

  const [modal, setModal] = useState<
    | { kind: "none" }
    | { kind: "checkin"; locationId: string }
    | { kind: "move"; locationId: string }
    | { kind: "loc_add"; materialId: string; qty: number }
    | { kind: "loc_remove"; materialId: string; qty: number }
    | { kind: "mat_add"; qty: number }
    | { kind: "mat_use"; qty: number }
    | { kind: "mat_job"; qty: number; jobId: string }
  >({ kind: "none" });

  const [jobs, setJobs] = useState<{ id: string; label: string }[]>([]);

  const refreshOfflineCount = useCallback(() => {
    setOfflinePending(peekOfflineQueue().length);
  }, []);

  const applyQuery = useCallback(() => {
    const id = searchParams.get("id")?.trim() || null;
    const loc = searchParams.get("location")?.trim() || null;
    const mat = searchParams.get("material")?.trim() || null;
    const num = searchParams.get("number")?.trim() || null;
    setAssetId(id);
    setAssetNumber(num && !id ? num : null);
    setLocationId(loc);
    setMaterialId(mat);
  }, [searchParams]);

  useEffect(() => {
    applyQuery();
  }, [applyQuery]);

  useEffect(() => {
    refreshOfflineCount();
    const id = window.setInterval(refreshOfflineCount, 2500);
    return () => window.clearInterval(id);
  }, [refreshOfflineCount]);

  const loadContext = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const [{ data: locs }, { data: jobRows }, { data: matRows }] =
        await Promise.all([
          sb.from("asset_locations").select("*").order("name"),
          sb
            .from("jobs")
            .select("id,job_name,job_number")
            .order("updated_at", { ascending: false })
            .limit(200),
          sb.from("materials_inventory").select("*").order("name").limit(500),
        ]);
      setLocations((locs ?? []).map((r) => mapLocationRow(r as Record<string, unknown>)));
      setJobs(
        (jobRows ?? []).map((j) => ({
          id: j.id as string,
          label: `${String(j.job_number ?? "").trim() || "—"} · ${String(j.job_name ?? "").trim() || "Job"}`,
        })),
      );
      setAllMaterials(
        (matRows ?? []).map((r) => mapMaterialRow(r as Record<string, unknown>)),
      );
    } catch {
      setLocations([]);
      setAllMaterials([]);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const loadEntity = useCallback(async () => {
    setAsset(null);
    setLocation(null);
    setMaterial(null);
    setLocItemCount(0);
    setMaterialsAtLoc([]);
    if (!assetId && !assetNumber && !locationId && !materialId) return;
    if (assetId && !isUuid(assetId)) {
      showToast({
        message:
          "This link does not contain a valid item ID. Use a QR from the inventory dashboard or a correct UUID.",
        variant: "error",
      });
      return;
    }
    if (locationId && !isUuid(locationId)) {
      showToast({
        message: "Invalid location ID in link.",
        variant: "error",
      });
      return;
    }
    if (materialId && !isUuid(materialId)) {
      showToast({
        message: "Invalid material ID in link.",
        variant: "error",
      });
      return;
    }
    try {
      const sb = createBrowserClient();
      if (assetId) {
        const { data, error } = await sb
          .from("assets")
          .select("*")
          .eq("id", assetId)
          .maybeSingle();
        if (error) throw error;
        if (data) setAsset(mapAssetRow(data as Record<string, unknown>));
      } else if (assetNumber) {
        const { data, error } = await sb
          .from("assets")
          .select("*")
          .eq("asset_number", assetNumber)
          .maybeSingle();
        if (error) throw error;
        if (data) setAsset(mapAssetRow(data as Record<string, unknown>));
      } else if (locationId) {
        const { data, error } = await sb
          .from("asset_locations")
          .select("*")
          .eq("id", locationId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const loc = mapLocationRow(data as Record<string, unknown>);
          setLocation(loc);
          const [{ count: ac }, { count: mc }, { data: mats }] =
            await Promise.all([
              sb
                .from("assets")
                .select("id", { count: "exact", head: true })
                .eq("location_id", locationId),
              sb
                .from("materials_inventory")
                .select("id", { count: "exact", head: true })
                .eq("location_id", locationId),
              sb
                .from("materials_inventory")
                .select("*")
                .eq("location_id", locationId),
            ]);
          setLocItemCount((ac ?? 0) + (mc ?? 0));
          setMaterialsAtLoc(
            (mats ?? []).map((r) => mapMaterialRow(r as Record<string, unknown>)),
          );
        }
      } else if (materialId) {
        const { data, error } = await sb
          .from("materials_inventory")
          .select("*")
          .eq("id", materialId)
          .maybeSingle();
        if (error) throw error;
        if (data) setMaterial(mapMaterialRow(data as Record<string, unknown>));
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load item.",
        variant: "error",
      });
    }
  }, [assetId, assetNumber, locationId, materialId, showToast]);

  useEffect(() => {
    void loadEntity();
  }, [loadEntity]);

  useEffect(() => {
    const runFlush = () => {
      if (!userId || !navigator.onLine) return;
      void (async () => {
        try {
          const sb = createBrowserClient();
          const n = await flushInventoryOfflineQueue(sb, {
            userId,
            employeeName,
          });
          if (n > 0) {
            refreshOfflineCount();
            showToast({
              message: `Synced ${n} offline action(s).`,
              variant: "success",
            });
            void loadEntity();
          }
        } catch {
          /* keep queue for retry */
        }
      })();
    };
    window.addEventListener("online", runFlush);
    runFlush();
    return () => window.removeEventListener("online", runFlush);
  }, [
    userId,
    employeeName,
    showToast,
    refreshOfflineCount,
    loadEntity,
  ]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code?.data && code.data !== lastDecoded) {
      setLastDecoded(code.data);
      const p = parseScanPayload(code.data);
      const qs = new URLSearchParams();
      if (p.assetId) qs.set("id", p.assetId);
      if (p.locationId) qs.set("location", p.locationId);
      if (p.materialId) qs.set("material", p.materialId);
      if ([...qs.keys()].length > 0) {
        router.replace(`/inventory/scan?${qs.toString()}`);
        showToast({ message: "QR recognized.", variant: "success" });
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [lastDecoded, router, showToast]);

  const startCamera = async () => {
    setLastDecoded(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Camera not available.",
        variant: "error",
      });
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const applyManual = () => {
    const raw = manual.trim();
    const p = parseScanPayload(raw);
    const qs = new URLSearchParams();
    if (p.assetId) qs.set("id", p.assetId);
    if (p.locationId) qs.set("location", p.locationId);
    if (p.materialId) qs.set("material", p.materialId);
    if ([...qs.keys()].length > 0) {
      router.replace(`/inventory/scan?${qs.toString()}`);
      return;
    }
    if (raw && !/^https?:\/\//i.test(raw)) {
      router.replace(
        `/inventory/scan?number=${encodeURIComponent(raw)}`,
      );
      return;
    }
    showToast({
      message: "Enter a valid scan URL, UUID, or asset number (e.g. TPP-001).",
      variant: "error",
    });
  };

  const checkOut = async (a: AssetRow) => {
    if (!userId) {
      showToast({ message: "Sign in to check out.", variant: "error" });
      return;
    }
    if (isOffline()) {
      enqueueInventoryOp({
        kind: "asset_checkout",
        assetId: a.id,
        fromLocationId: a.location_id,
      });
      refreshOfflineCount();
      showToast({
        message: "Offline — check-out queued. Will sync when you are online.",
        variant: "success",
      });
      return;
    }
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({
          status: "checked_out",
          assigned_to: userId,
          assigned_to_name: employeeName,
        })
        .eq("id", a.id);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        asset_id: a.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: "checkout",
        from_location_id: a.location_id,
      });
      showToast({ message: "Checked out to you.", variant: "success" });
      void loadEntity();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const submitCheckIn = async () => {
    if (modal.kind !== "checkin" || !asset || !userId) return;
    const loc = modal.locationId.trim() || null;
    if (isOffline()) {
      enqueueInventoryOp({
        kind: "asset_checkin",
        assetId: asset.id,
        locationId: loc,
      });
      refreshOfflineCount();
      showToast({
        message: "Offline — check-in queued. Will sync when you are online.",
        variant: "success",
      });
      setModal({ kind: "none" });
      return;
    }
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({
          status: "available",
          assigned_to: null,
          assigned_to_name: null,
          location_id: loc,
        })
        .eq("id", asset.id);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        asset_id: asset.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: "checkin",
        to_location_id: loc,
      });
      showToast({ message: "Checked in.", variant: "success" });
      setModal({ kind: "none" });
      void loadEntity();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const submitMove = async () => {
    if (modal.kind !== "move" || !asset || !userId) return;
    const to = modal.locationId.trim() || null;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({ location_id: to })
        .eq("id", asset.id);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        asset_id: asset.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: "move",
        from_location_id: asset.location_id,
        to_location_id: to,
      });
      showToast({ message: "Location updated.", variant: "success" });
      setModal({ kind: "none" });
      void loadEntity();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const reportRepair = async (a: AssetRow) => {
    if (!userId) return;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("assets")
        .update({
          status: "in_repair",
          assigned_to: null,
          assigned_to_name: null,
        })
        .eq("id", a.id);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        asset_id: a.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: "report_issue",
        notes: "Flagged from scan",
      });
      showToast({ message: "Flagged for repair.", variant: "success" });
      void loadEntity();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const applyLocMaterialDelta = async (add: boolean) => {
    if (modal.kind !== "loc_add" && modal.kind !== "loc_remove") return;
    if (!locationId || !userId) return;
    const mid = modal.materialId;
    const qty = modal.qty;
    if (!mid.trim()) {
      showToast({ message: "Select a material.", variant: "error" });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast({ message: "Invalid quantity.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      const { data: row, error: fe } = await sb
        .from("materials_inventory")
        .select("*")
        .eq("id", mid)
        .maybeSingle();
      if (fe || !row) throw fe ?? new Error("Material not found");
      const m = mapMaterialRow(row as Record<string, unknown>);
      if (!add && m.location_id !== locationId) {
        showToast({
          message: "That material is not stored at this location.",
          variant: "error",
        });
        return;
      }
      const next = add ? m.current_quantity + qty : m.current_quantity - qty;
      if (next < 0) {
        showToast({ message: "Not enough stock.", variant: "error" });
        return;
      }
      const { error } = await sb
        .from("materials_inventory")
        .update({
          current_quantity: next,
          location_id: add ? locationId : m.location_id,
        })
        .eq("id", mid);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        material_id: mid,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: add ? "deliver" : "use",
        quantity: qty,
        to_location_id: add ? locationId : null,
        from_location_id: add ? m.location_id : locationId,
      });
      showToast({ message: add ? "Stock added." : "Stock removed.", variant: "success" });
      setModal({ kind: "none" });
      void loadEntity();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const applyMaterialScan = async () => {
    if (!material || !userId) return;
    if (
      modal.kind !== "mat_add" &&
      modal.kind !== "mat_use" &&
      modal.kind !== "mat_job"
    ) {
      return;
    }
    const qty = modal.qty;
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast({ message: "Invalid quantity.", variant: "error" });
      return;
    }
    if (modal.kind === "mat_job" && !modal.jobId.trim()) {
      showToast({ message: "Choose a job.", variant: "error" });
      return;
    }
    try {
      const sb = createBrowserClient();
      let next = material.current_quantity;
      if (modal.kind === "mat_add") next += qty;
      else next -= qty;
      if (next < 0) {
        showToast({ message: "Not enough stock.", variant: "error" });
        return;
      }
      const { error } = await sb
        .from("materials_inventory")
        .update({ current_quantity: next })
        .eq("id", material.id);
      if (error) throw error;
      await insertInventoryTransaction(sb, {
        material_id: material.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type:
          modal.kind === "mat_add"
            ? "deliver"
            : "use",
        quantity: qty,
        job_id: modal.kind === "mat_job" ? modal.jobId.trim() : null,
        from_location_id:
          modal.kind === "mat_add" ? null : material.location_id,
        to_location_id:
          modal.kind === "mat_add" ? material.location_id : null,
      });
      showToast({ message: "Updated.", variant: "success" });
      setModal({ kind: "none" });
      void loadEntity();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const flagLowStock = async () => {
    if (!material || !userId) return;
    try {
      const sb = createBrowserClient();
      await insertInventoryTransaction(sb, {
        material_id: material.id,
        employee_id: userId,
        employee_name: employeeName,
        transaction_type: "report_issue",
        notes: `Low stock: qty ${material.current_quantity} (min ${material.minimum_quantity})`,
        from_location_id: material.location_id,
      });
      showToast({ message: "Low stock flagged.", variant: "success" });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed.",
        variant: "error",
      });
    }
  };

  const loc = asset?.location_id
    ? locations.find((x) => x.id === asset.location_id)
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="inventory" showTppSubtitle />
      <main className="mx-auto w-full min-w-0 max-w-lg flex-1 px-4 py-6">
        <Link
          href="/inventory"
          className="text-sm text-violet-300 hover:underline"
        >
          ← Inventory
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-white">Scan QR</h1>
          {offlinePending > 0 ? (
            <span className="rounded-full bg-amber-500/25 px-3 py-1 text-xs font-bold text-amber-100">
              {offlinePending} offline
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-white/55">
          Point at a code or paste URL, UUID, or asset number (e.g. TPP-001).
        </p>

        <div className="relative mt-6 aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-violet-500/40 bg-black ring-2 ring-violet-500/20">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div
            className="pointer-events-none absolute inset-8 rounded-lg border-2 border-dashed border-violet-300/80"
            aria-hidden
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!scanning ? (
            <button
              type="button"
              className="flex-1 rounded-xl bg-violet-500 py-4 text-base font-bold text-white hover:bg-violet-400"
              onClick={() => void startCamera()}
            >
              Start camera
            </button>
          ) : (
            <button
              type="button"
              className="flex-1 rounded-xl border border-white/25 py-4 text-base font-semibold text-white hover:bg-white/10"
              onClick={stopCamera}
            >
              Stop camera
            </button>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <label className="text-xs font-semibold text-white/50">
            Manual entry
          </label>
          <textarea
            className="app-input mt-2 min-h-[4rem] w-full text-sm"
            placeholder="Paste scan URL, UUID, or asset number"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary btn-h-11 mt-2 w-full"
            onClick={applyManual}
          >
            Apply
          </button>
        </div>

        {asset ? (
          <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
              Asset
            </h2>
            <p className="mt-2 font-semibold text-white">{asset.name}</p>
            <p className="font-mono text-sm text-violet-200">{asset.asset_number}</p>
            <p className="mt-2 text-sm text-white/70">
              Status: <span className="text-white">{asset.status}</span>
            </p>
            <p className="text-sm text-white/70">
              Location:{" "}
              <span className="text-white">{loc?.name ?? "—"}</span>
            </p>
            <div className="mt-4 grid gap-2">
              {asset.status === "available" &&
              (asset.asset_type === "tool" ||
                asset.asset_type === "equipment" ||
                asset.asset_type === "material") ? (
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 py-4 text-base font-semibold text-white"
                  onClick={() => void checkOut(asset)}
                >
                  ✅ Check Out — assign to me
                </button>
              ) : null}
              {asset.status === "checked_out" ? (
                <button
                  type="button"
                  className="rounded-lg bg-amber-500 py-4 text-base font-bold text-[#0a1628]"
                  onClick={() =>
                    setModal({
                      kind: "checkin",
                      locationId: asset.location_id ?? locations[0]?.id ?? "",
                    })
                  }
                >
                  📦 Check In
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-lg border border-white/20 py-4 text-base text-white/85"
                onClick={() =>
                  setModal({
                    kind: "move",
                    locationId: asset.location_id ?? locations[0]?.id ?? "",
                  })
                }
              >
                📍 Move
              </button>
              <button
                type="button"
                className="rounded-lg border border-orange-400/50 py-4 text-base text-orange-200"
                onClick={() => void reportRepair(asset)}
              >
                🔧 Report issue
              </button>
            </div>
          </section>
        ) : null}

        {location ? (
          <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
              Location
            </h2>
            <p className="mt-2 font-semibold text-white">{location.name}</p>
            <p className="mt-1 text-sm text-white/60">
              Items stored:{" "}
              <span className="font-bold text-violet-200">{locItemCount}</span>
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-600/90 py-2.5 text-sm font-semibold text-white"
                onClick={() =>
                  setModal({
                    kind: "loc_add",
                    materialId:
                      allMaterials[0]?.id ?? materialsAtLoc[0]?.id ?? "",
                    qty: 1,
                  })
                }
              >
                ➕ Add item (delivery)
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-600/90 py-2.5 text-sm font-semibold text-[#0a1628]"
                onClick={() =>
                  setModal({
                    kind: "loc_remove",
                    materialId: materialsAtLoc[0]?.id ?? "",
                    qty: 1,
                  })
                }
              >
                ➖ Remove item (usage)
              </button>
              <Link
                href={`/inventory?tab=assets&locationId=${location.id}`}
                className="rounded-lg border border-violet-400/40 py-2.5 text-center text-sm font-semibold text-violet-200"
              >
                📋 View items
              </Link>
            </div>
            {materialsAtLoc.length === 0 ? (
              <p className="mt-2 text-xs text-white/45">
                No materials linked to this location yet. Add stock from the
                dashboard or pick a material in the modal if listed globally.
              </p>
            ) : null}
          </section>
        ) : null}

        {material ? (
          <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">
              Material
            </h2>
            <p className="mt-2 font-semibold text-white">{material.name}</p>
            <p className="mt-1 text-lg font-bold text-violet-200">
              {material.current_quantity} {material.unit}
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="rounded-lg bg-amber-600/90 py-2.5 text-sm font-semibold text-[#0a1628]"
                onClick={() =>
                  setModal({
                    kind: "mat_job",
                    qty: 1,
                    jobId: jobs[0]?.id ?? "",
                  })
                }
              >
                📤 Use on job
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600/90 py-2.5 text-sm font-semibold text-white"
                onClick={() => setModal({ kind: "mat_add", qty: 1 })}
              >
                📥 Add stock
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/20 py-2.5 text-sm text-white/85"
                onClick={() => setModal({ kind: "mat_use", qty: 1 })}
              >
                Use (internal)
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-400/40 py-2.5 text-sm text-red-200"
                onClick={() => void flagLowStock()}
              >
                ⚠️ Flag low stock
              </button>
            </div>
          </section>
        ) : null}

        {!asset &&
        !location &&
        !material &&
        (assetId || assetNumber || locationId || materialId) ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center">
            <p className="text-base font-semibold text-white">Item not found</p>
            <p className="mt-2 text-sm text-white/55">
              The ID may be wrong, the item was removed, or you do not have
              access. Try scanning again or open the dashboard to verify.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/inventory"
                className="btn-primary btn-h-11 inline-flex justify-center"
              >
                Open inventory
              </Link>
              <Link
                href="/inventory/scan"
                className="btn-secondary btn-h-11 inline-flex justify-center"
              >
                Clear scan
              </Link>
            </div>
          </div>
        ) : null}

        {!assetId && !assetNumber && !locationId && !materialId ? (
          <p className="mt-8 text-center text-sm text-white/45">
            Scan a code to see actions.
          </p>
        ) : null}
      </main>

      {modal.kind !== "none" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0a1628] p-5">
            {(modal.kind === "checkin" || modal.kind === "move") && asset ? (
              <>
                <h3 className="font-semibold text-white">
                  {modal.kind === "checkin" ? "Check in" : "Move"}
                </h3>
                <select
                  className="app-input mt-3 w-full text-sm"
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
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11 flex-1"
                    onClick={() =>
                      modal.kind === "checkin"
                        ? void submitCheckIn()
                        : void submitMove()
                    }
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11 flex-1"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {(modal.kind === "loc_add" || modal.kind === "loc_remove") &&
            locationId ? (
              <>
                <h3 className="font-semibold text-white">
                  {modal.kind === "loc_add" ? "Add to location" : "Remove from location"}
                </h3>
                <select
                  className="app-input mt-3 w-full text-sm"
                  value={modal.materialId}
                  onChange={(e) =>
                    setModal({ ...modal, materialId: e.target.value })
                  }
                >
                  <option value="">Select material…</option>
                  {(modal.kind === "loc_remove"
                    ? materialsAtLoc
                    : allMaterials
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {modal.kind === "loc_remove" && materialsAtLoc.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    No materials assigned to this location yet.
                  </p>
                ) : null}
                <input
                  type="number"
                  min={1}
                  className="app-input mt-2 w-full text-sm"
                  value={modal.qty}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      qty: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11 flex-1"
                    onClick={() => void applyLocMaterialDelta(modal.kind === "loc_add")}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11 flex-1"
                    onClick={() => setModal({ kind: "none" })}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
            {(modal.kind === "mat_add" ||
              modal.kind === "mat_use" ||
              modal.kind === "mat_job") &&
            material ? (
              <>
                <h3 className="font-semibold text-white">
                  {modal.kind === "mat_add"
                    ? "Add stock"
                    : modal.kind === "mat_use"
                      ? "Use material"
                      : "Use on job"}
                </h3>
                {modal.kind === "mat_job" ? (
                  <select
                    className="app-input mt-3 w-full text-sm"
                    value={modal.jobId}
                    onChange={(e) =>
                      setModal({ ...modal, jobId: e.target.value })
                    }
                  >
                    <option value="">Job…</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="number"
                  min={1}
                  className="app-input mt-2 w-full text-sm"
                  value={modal.qty}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      qty: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-h-11 flex-1"
                    onClick={() => void applyMaterialScan()}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-h-11 flex-1"
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
