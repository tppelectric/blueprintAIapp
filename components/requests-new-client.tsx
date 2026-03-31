"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import type {
  InternalRequestDetails,
  InternalRequestPriority,
  InternalRequestType,
} from "@/lib/internal-request-types";
import { REQUEST_TYPE_OPTIONS } from "@/lib/internal-request-types";
import { createBrowserClient } from "@/lib/supabase/client";

type JobOpt = { id: string; job_name: string; job_number: string };
type AssetOpt = {
  id: string;
  name: string;
  asset_number: string;
  asset_type: string;
};

function emptyDetails(): InternalRequestDetails {
  return {};
}

const VALID_REQUEST_TYPES = new Set<string>(
  REQUEST_TYPE_OPTIONS.map((o) => o.value),
);

function parsePrefillQueryParam(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const attempts: (() => unknown)[] = [
    () => JSON.parse(decodeURIComponent(trimmed.replace(/\+/g, " "))),
    () => JSON.parse(trimmed),
  ];
  for (const parse of attempts) {
    try {
      const v = parse();
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function lineItemsToDescription(lineItems: unknown): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  const lines = lineItems.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const desc = [o.description, o.item, o.name, o.label].find(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
      const qty = o.quantity ?? o.qty;
      const qtyStr =
        qty !== undefined && qty !== null && String(qty).trim() !== ""
          ? ` × ${String(qty)}`
          : "";
      return desc ? `${desc.trim()}${qtyStr}` : "";
    }
    return "";
  });
  const joined = lines.filter(Boolean).join("\n").trim();
  return joined || null;
}

export function RequestsNewClient() {
  const { showToast } = useAppToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillAppliedRef = useRef(false);
  const { profile, loading: roleLoading } = useUserRole();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reqType, setReqType] = useState<InternalRequestType | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<InternalRequestPriority>("normal");
  const [jobId, setJobId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");
  const [details, setDetails] = useState<InternalRequestDetails>(emptyDetails);
  const [photos, setPhotos] = useState<File[]>([]);
  const [toolSearch, setToolSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [assets, setAssets] = useState<AssetOpt[]>([]);

  const loadMeta = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const [jRes, aRes] = await Promise.all([
        sb.from("jobs").select("id,job_name,job_number").limit(250),
        sb.from("assets").select("id,name,asset_number,asset_type").limit(800),
      ]);
      setJobs((jRes.data ?? []) as JobOpt[]);
      setAssets(
        (aRes.data ?? []).map((a) => ({
          id: String(a.id),
          name: String(a.name ?? ""),
          asset_number: String(a.asset_number ?? ""),
          asset_type: String(a.asset_type ?? ""),
        })),
      );
    } catch {
      setJobs([]);
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const raw = searchParams.get("prefill")?.trim();
    if (!raw) return;
    prefillAppliedRef.current = true;
    try {
      const p = parsePrefillQueryParam(raw);
      if (!p) {
        showToast({
          message: "Could not read prefill from link.",
          variant: "error",
        });
        return;
      }
      if (typeof p.title === "string") setTitle(p.title);
      if (typeof p.description === "string") setDescription(p.description);
      if (typeof p.itemDescription === "string")
        setItemDescription(p.itemDescription);
      else {
        const fromLines = lineItemsToDescription(p.lineItems ?? p.line_items);
        if (fromLines) setItemDescription(fromLines);
      }
      if (typeof p.quantity === "number" || typeof p.quantity === "string") {
        setQuantity(String(p.quantity));
      } else if (typeof p.qty === "number" || typeof p.qty === "string") {
        setQuantity(String(p.qty));
      }
      if (typeof p.amount === "number" || typeof p.amount === "string") {
        setAmount(String(p.amount));
      }
      if (typeof p.dateNeeded === "string") setDateNeeded(p.dateNeeded);
      if (typeof p.jobId === "string") setJobId(p.jobId);
      const pr = p.priority;
      if (
        pr === "low" ||
        pr === "normal" ||
        pr === "urgent" ||
        pr === "emergency"
      ) {
        setPriority(pr);
      }
      const rt = p.requestType;
      if (typeof rt === "string" && VALID_REQUEST_TYPES.has(rt)) {
        setReqType(rt as InternalRequestType);
        setStep(2);
      }
      const det = p.details;
      if (det && typeof det === "object" && !Array.isArray(det)) {
        setDetails((d) => ({
          ...d,
          ...(det as InternalRequestDetails),
        }));
      }
    } catch {
      showToast({
        message: "Could not read prefill from link.",
        variant: "error",
      });
    }
  }, [searchParams, showToast]);

  const vehicles = useMemo(
    () => assets.filter((a) => a.asset_type === "vehicle"),
    [assets],
  );

  const tools = useMemo(
    () =>
      assets.filter((a) =>
        ["tool", "equipment", "material"].includes(a.asset_type),
      ),
    [assets],
  );

  const filteredTools = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    if (!q) return tools.slice(0, 80);
    return tools
      .filter(
        (a) =>
          a.asset_number.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [tools, toolSearch]);

  const typeLabel = (t: InternalRequestType) =>
    REQUEST_TYPE_OPTIONS.find((x) => x.value === t)?.step1Label ?? t;

  const pickType = (t: InternalRequestType) => {
    setReqType(t);
    setStep(2);
    setDetails(emptyDetails());
    setAssetId("");
    setTitle("");
  };

  const mergeDetail = <K extends keyof InternalRequestDetails>(
    key: K,
    value: InternalRequestDetails[K],
  ) => {
    setDetails((d) => ({ ...d, [key]: value }));
  };

  const buildDefaultTitle = (): string => {
    if (title.trim()) return title.trim();
    const t = reqType ? typeLabel(reqType) : "Request";
    const snippet = description.trim().slice(0, 60);
    return snippet ? `${t}: ${snippet}` : `${t} (no subject)`;
  };

  const submit = async () => {
    if (!profile?.id || !reqType) return;
    if (reqType === "vehicle_maintenance" && !assetId.trim()) {
      showToast({ message: "Select a vehicle.", variant: "error" });
      return;
    }
    if (reqType === "tool_repair" && !assetId.trim()) {
      showToast({ message: "Select a tool or asset.", variant: "error" });
      return;
    }
    if (reqType === "material_order" && !itemDescription.trim()) {
      showToast({ message: "Describe the material needed.", variant: "error" });
      return;
    }
    if (reqType === "document_request" && !itemDescription.trim()) {
      showToast({ message: "What document is needed?", variant: "error" });
      return;
    }
    if (reqType === "safety_incident" && !(details.safety_what ?? "").trim()) {
      showToast({
        message: "Describe what happened (safety).",
        variant: "error",
      });
      return;
    }
    if (reqType === "tool_request" && !itemDescription.trim()) {
      showToast({ message: "Describe the equipment needed.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const extra: InternalRequestDetails = {
        ...details,
        additional_notes: details.additional_notes?.trim() || undefined,
      };
      const row = {
        submitted_by: profile.id,
        request_type: reqType,
        title: buildDefaultTitle(),
        description: description.trim() || null,
        priority,
        status: "new" as const,
        job_id: jobId.trim() || null,
        asset_id: assetId.trim() || null,
        amount: amount.trim() ? Number(amount) : null,
        quantity: quantity.trim() ? parseInt(quantity, 10) : null,
        item_description: itemDescription.trim() || null,
        date_needed: dateNeeded.trim() || null,
        details: extra,
        photos: [] as string[],
      };

      const { data: ins, error: insErr } = await sb
        .from("internal_requests")
        .insert(row)
        .select("id,request_number")
        .single();
      if (insErr) throw insErr;
      const id = String(ins?.id ?? "");
      const num = String(ins?.request_number ?? "");
      if (!id) throw new Error("No id returned");

      const paths: string[] = [];
      for (const file of photos) {
        if (!file.size) continue;
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const path = `requests/${id}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await sb.storage
          .from("internal-request-files")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw upErr;
        paths.push(path);
      }
      if (paths.length > 0) {
        const { error: pErr } = await sb
          .from("internal_requests")
          .update({ photos: paths, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (pErr) throw pErr;
      }

      showToast({
        message: `Submitted ${num || id}`,
        variant: "success",
      });
      router.push(`/requests/${id}`);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Submit failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (roleLoading || !profile?.id) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center text-white/60">
          {roleLoading ? "Loading…" : "Sign in to submit requests."}
        </main>
      </div>
    );
  }

  const step1 = (
    <div>
      <p className="text-sm text-white/55">
        Step 1 of 3 — What do you need?
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {REQUEST_TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pickType(o.value)}
            className="flex min-h-[6.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] p-4 text-center transition hover:border-[#E8C84A]/45 hover:bg-[#E8C84A]/10"
          >
            <span className="text-3xl" aria-hidden>
              {o.icon}
            </span>
            <span className="text-xs font-semibold leading-snug text-white">
              {o.step1Label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const sharedFields = (
    <>
      <label className="block text-xs text-white/55">
        Title (optional — we&apos;ll generate one if empty)
        <input
          className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-xs text-white/55">
        Description / details
        <textarea
          rows={4}
          className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="block text-xs text-white/55">
        Suggested priority
        <select
          className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
          value={priority}
          onChange={(e) =>
            setPriority(e.target.value as InternalRequestPriority)
          }
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
          <option value="emergency">Emergency</option>
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Link to job (optional)
        <select
          className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
        >
          <option value="">— None —</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.job_number} · {j.job_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Photos (optional)
        <input
          type="file"
          accept="image/*"
          multiple
          className="mt-1 w-full text-xs text-white/70 file:mr-2 file:rounded-lg file:border-0 file:bg-[#E8C84A] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#0a1628]"
          onChange={(e) =>
            setPhotos(Array.from(e.target.files ?? []))
          }
        />
      </label>
    </>
  );

  const typeSpecific =
    reqType === "vehicle_maintenance" ? (
      <>
        <label className="block text-xs text-white/55">
          Which vehicle?
          <select
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            <option value="">— Select —</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.asset_number} · {v.name || "Vehicle"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-white/55">
          When did you notice the issue?
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.vehicle_issue_noticed ?? ""}
            onChange={(e) =>
              mergeDetail("vehicle_issue_noticed", e.target.value)
            }
            placeholder="e.g. This morning, last week…"
          />
        </label>
        <fieldset className="text-xs text-white/75">
          <legend className="text-white/55">Safe to drive?</legend>
          <label className="mr-4 inline-flex items-center gap-2">
            <input
              type="radio"
              name="safe"
              checked={details.vehicle_safe_to_drive === true}
              onChange={() => mergeDetail("vehicle_safe_to_drive", true)}
            />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="safe"
              checked={details.vehicle_safe_to_drive === false}
              onChange={() => mergeDetail("vehicle_safe_to_drive", false)}
            />
            No
          </label>
        </fieldset>
      </>
    ) : reqType === "tool_repair" ? (
      <>
        <label className="block text-xs text-white/55">
          Search tool / equipment
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            placeholder="Asset # or name"
          />
        </label>
        <label className="block text-xs text-white/55">
          Select asset
          <select
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            <option value="">— Select —</option>
            {filteredTools.map((a) => (
              <option key={a.id} value={a.id}>
                {a.asset_number} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-white/55">
          What&apos;s wrong?
        </label>
        <fieldset className="text-xs text-white/75">
          <legend className="text-white/55">Still usable?</legend>
          <label className="mr-4 inline-flex items-center gap-2">
            <input
              type="radio"
              name="usable"
              checked={details.tool_still_usable === true}
              onChange={() => mergeDetail("tool_still_usable", true)}
            />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="usable"
              checked={details.tool_still_usable === false}
              onChange={() => mergeDetail("tool_still_usable", false)}
            />
            No
          </label>
        </fieldset>
      </>
    ) : reqType === "material_order" ? (
      <>
        <label className="block text-xs text-white/55">
          Item name &amp; specs *
          <textarea
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Quantity
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Date needed by
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={dateNeeded}
            onChange={(e) => setDateNeeded(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Preferred vendor (optional)
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.material_preferred_vendor ?? ""}
            onChange={(e) =>
              mergeDetail("material_preferred_vendor", e.target.value)
            }
          />
        </label>
        <label className="block text-xs text-white/55">
          Estimated cost (optional)
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </>
    ) : reqType === "document_request" ? (
      <>
        <label className="block text-xs text-white/55">
          What document is needed?
          <input
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Who / what it is for
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.document_for_who ?? ""}
            onChange={(e) => mergeDetail("document_for_who", e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Date needed by
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={dateNeeded}
            onChange={(e) => setDateNeeded(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Specific requirements
          <textarea
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.document_requirements ?? ""}
            onChange={(e) =>
              mergeDetail("document_requirements", e.target.value)
            }
          />
        </label>
      </>
    ) : reqType === "safety_incident" ? (
      <>
        <label className="block text-xs text-white/55">
          When did it happen?
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.safety_when ?? ""}
            onChange={(e) => mergeDetail("safety_when", e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Where (job site, office, etc.)
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.safety_where ?? ""}
            onChange={(e) => mergeDetail("safety_where", e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          What happened?
          <textarea
            required
            rows={3}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.safety_what ?? ""}
            onChange={(e) => mergeDetail("safety_what", e.target.value)}
          />
        </label>
        <fieldset className="text-xs text-white/75">
          <legend className="text-white/55">Anyone injured?</legend>
          <label className="mr-4 inline-flex items-center gap-2">
            <input
              type="radio"
              name="inj"
              checked={details.safety_injured === true}
              onChange={() => mergeDetail("safety_injured", true)}
            />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="inj"
              checked={details.safety_injured === false}
              onChange={() => mergeDetail("safety_injured", false)}
            />
            No
          </label>
        </fieldset>
        {details.safety_injured ? (
          <label className="block text-xs text-white/55">
            Who and how?
            <textarea
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={details.safety_injury_details ?? ""}
              onChange={(e) =>
                mergeDetail("safety_injury_details", e.target.value)
              }
            />
          </label>
        ) : null}
        <fieldset className="text-xs text-white/75">
          <legend className="text-white/55">Medical attention needed?</legend>
          <label className="mr-4 inline-flex items-center gap-2">
            <input
              type="radio"
              name="med"
              checked={details.safety_medical_attention === true}
              onChange={() => mergeDetail("safety_medical_attention", true)}
            />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="med"
              checked={details.safety_medical_attention === false}
              onChange={() => mergeDetail("safety_medical_attention", false)}
            />
            No
          </label>
        </fieldset>
        <label className="block text-xs text-white/55">
          Witnesses
          <textarea
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.safety_witnesses ?? ""}
            onChange={(e) => mergeDetail("safety_witnesses", e.target.value)}
          />
        </label>
      </>
    ) : reqType === "tool_request" ? (
      <>
        <label className="block text-xs text-white/55">
          Equipment needed *
          <textarea
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Quantity
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          Date needed by
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={dateNeeded}
            onChange={(e) => setDateNeeded(e.target.value)}
          />
        </label>
      </>
    ) : (
      <>
        <label className="block text-xs text-white/55">
          Additional notes
          <textarea
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            value={details.additional_notes ?? ""}
            onChange={(e) => mergeDetail("additional_notes", e.target.value)}
          />
        </label>
        {(reqType === "expense_reimbursement" ||
          reqType === "license_request") && (
          <label className="block text-xs text-white/55">
            Amount (if known)
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}
      </>
    );

  const step2 = reqType && (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        Step 2 of 3 — {typeLabel(reqType)}
      </p>
      {typeSpecific}
      {sharedFields}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          onClick={() => setStep(1)}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628]"
          onClick={() => setStep(3)}
        >
          Review
        </button>
      </div>
    </div>
  );

  const step3 = reqType && (
    <div className="space-y-4">
      <p className="text-sm text-white/55">Step 3 of 3 — Confirm</p>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/85">
        <p>
          <span className="text-white/50">Type:</span> {typeLabel(reqType)}
        </p>
        <p className="mt-2">
          <span className="text-white/50">Title:</span> {buildDefaultTitle()}
        </p>
        <p className="mt-2">
          <span className="text-white/50">Priority:</span> {priority}
        </p>
        {description.trim() ? (
          <p className="mt-2 whitespace-pre-wrap">
            <span className="text-white/50">Description:</span> {description}
          </p>
        ) : null}
        <p className="mt-2 text-white/50">
          Photos: {photos.length} file{photos.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          onClick={() => setStep(2)}
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-50"
          onClick={() => void submit()}
        >
          {busy ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-lg flex-1 px-4 py-6 md:max-w-xl md:py-10">
        <Link
          href="/my-requests"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← My requests
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">New request</h1>
        <div className="mt-6">
          {step === 1 ? step1 : null}
          {step === 2 ? step2 : null}
          {step === 3 ? step3 : null}
        </div>
      </main>
    </div>
  );
}
