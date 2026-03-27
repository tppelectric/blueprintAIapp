"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppToast } from "@/components/toast-provider";
import {
  RECEIPT_CATEGORIES,
  type ReceiptCategory,
  type ReceiptLineItem,
  type ReceiptRow,
} from "@/lib/receipts-types";
import type { ScanReceiptResult } from "@/lib/receipt-scan-types";
import { createBrowserClient } from "@/lib/supabase/client";

const JOB_STATUSES = ["Lead", "Quoted", "Active", "On Hold"] as const;

type JobOpt = { id: string; job_name: string; job_number: string };

function formatJobLabel(j: JobOpt): string {
  const a = j.job_number.trim();
  const b = j.job_name.trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export type ReceiptCaptureProps = {
  jobId?: string | null;
  dailyLogId?: string | null;
  onSaved?: (receipt: ReceiptRow) => void;
  /** When true, start hidden until user opens (e.g. dialog). */
  collapsible?: boolean;
  title?: string;
};

export function ReceiptCapture({
  jobId: propJobId,
  dailyLogId,
  onSaved,
  collapsible = false,
  title = "Capture receipt",
}: ReceiptCaptureProps) {
  const { showToast } = useAppToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(!collapsible);

  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [assignedJobId, setAssignedJobId] = useState<string | null>(null);
  const [punchSuggestion, setPunchSuggestion] = useState<{
    jobId: string | null;
    jobName: string;
  } | null>(null);
  const [showSuggestBanner, setShowSuggestBanner] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "review">("idle");

  const [vendorName, setVendorName] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [cardLastFour, setCardLastFour] = useState("");
  const [cardType, setCardType] = useState("");
  const [category, setCategory] = useState<ReceiptCategory>("Other");
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  type ReceiptProgress =
    | {
        pct: number;
        label: string;
        variant: "normal" | "success" | "error";
        errorDetail?: string;
      }
    | null;
  const [receiptProgress, setReceiptProgress] = useState<ReceiptProgress>(null);
  const scanCreepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearScanCreepTimer = useCallback(() => {
    if (scanCreepTimerRef.current) {
      clearInterval(scanCreepTimerRef.current);
      scanCreepTimerRef.current = null;
    }
  }, []);

  const [jobExpenseCtx, setJobExpenseCtx] = useState<{
    label: string;
    address: string;
    receiptCount: number;
    totalSpend: number;
  } | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      let q = await sb
        .from("jobs")
        .select("id,job_name,job_number")
        .in("status", [...JOB_STATUSES])
        .order("updated_at", { ascending: false });
      if (q.error) {
        q = await sb
          .from("jobs")
          .select("id,job_name,job_number")
          .order("updated_at", { ascending: false });
      }
      if (q.error) throw q.error;
      setJobs(
        (q.data ?? []).map((j) => ({
          id: j.id as string,
          job_name: String(j.job_name ?? ""),
          job_number: String(j.job_number ?? ""),
        })),
      );
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(
    () => () => {
      clearScanCreepTimer();
    },
    [clearScanCreepTimer],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (dailyLogId?.trim()) {
        try {
          const sb = createBrowserClient();
          const { data } = await sb
            .from("daily_logs")
            .select("job_id")
            .eq("id", dailyLogId.trim())
            .maybeSingle();
          if (!cancelled && data?.job_id) {
            setAssignedJobId(data.job_id as string);
            setPunchSuggestion(null);
            setShowSuggestBanner(false);
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (propJobId?.trim()) {
        if (!cancelled) {
          setAssignedJobId(propJobId.trim());
          setPunchSuggestion(null);
          setShowSuggestBanner(false);
        }
        return;
      }
      try {
        const r = await fetch("/api/receipts/suggest-job", {
          credentials: "include",
        });
        const j = (await r.json()) as {
          suggested?: { jobId: string | null; jobName: string } | null;
        };
        if (cancelled || !r.ok) return;
        const s = j.suggested;
        if (s?.jobId) {
          setPunchSuggestion({ jobId: s.jobId, jobName: s.jobName });
          setShowSuggestBanner(true);
        } else {
          setPunchSuggestion(null);
          setShowSuggestBanner(false);
        }
      } catch {
        if (!cancelled) {
          setPunchSuggestion(null);
          setShowSuggestBanner(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dailyLogId, propJobId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const jid = assignedJobId?.trim();
    if (!jid || phase !== "review") {
      setJobExpenseCtx(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const [{ data: job }, { data: recs }] = await Promise.all([
          sb
            .from("jobs")
            .select("job_number,job_name,address,city,state,zip")
            .eq("id", jid)
            .maybeSingle(),
          sb.from("receipts").select("total_amount").eq("job_id", jid),
        ]);
        if (cancelled) return;
        if (!job) {
          setJobExpenseCtx(null);
          return;
        }
        const num = String(job.job_number ?? "").trim();
        const name = String(job.job_name ?? "").trim();
        const label = [num, name].filter(Boolean).join(" · ") || "Job";
        const addrParts = [
          job.address,
          job.city,
          job.state,
          job.zip,
        ]
          .map((x) => String(x ?? "").trim())
          .filter(Boolean);
        const rows = recs ?? [];
        const totalSpend = rows.reduce(
          (s, r) => s + (Number((r as { total_amount?: unknown }).total_amount) || 0),
          0,
        );
        setJobExpenseCtx({
          label,
          address: addrParts.join(", "),
          receiptCount: rows.length,
          totalSpend,
        });
      } catch {
        if (!cancelled) setJobExpenseCtx(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignedJobId, phase]);

  const applyScan = (data: ScanReceiptResult) => {
    setVendorName(data.vendor_name);
    setReceiptDate(
      /^\d{4}-\d{2}-\d{2}$/.test(data.receipt_date)
        ? data.receipt_date
        : data.receipt_date
          ? data.receipt_date.slice(0, 10)
          : "",
    );
    setSubtotal(String(data.subtotal ?? ""));
    setTaxAmount(String(data.tax_amount ?? ""));
    setTotalAmount(String(data.total_amount ?? ""));
    setPaymentMethod(data.payment_method);
    setCardLastFour(data.card_last_four ?? "");
    setCardType(data.card_type ?? "");
    setCategory(data.receipt_category);
    setLineItems(
      data.line_items.length
        ? data.line_items
        : [
            {
              description: "Receipt total",
              quantity: null,
              unit_price: null,
              total: data.total_amount,
            },
          ],
    );
    setConfidence(data.confidence);
  };

  const processFile = async (f: File) => {
    if (!f.type.startsWith("image/")) {
      showToast({ message: "Please choose an image file.", variant: "error" });
      return;
    }
    clearScanCreepTimer();
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setPhase("reading");
    setReceiptProgress({
      pct: 6,
      label: "Reading image...",
      variant: "normal",
    });
    try {
      const dataUrl = await fileToDataUrl(f);
      setReceiptProgress({
        pct: 18,
        label: "Reading image...",
        variant: "normal",
      });
      const comma = dataUrl.indexOf(",");
      const mimeMatch = dataUrl.match(/^data:([^;,]+)/);
      const mediaType = (
        mimeMatch?.[1] ??
        f.type ??
        "image/jpeg"
      ).split(";")[0]!.trim();
      const imageBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

      setReceiptProgress({
        pct: 24,
        label: "Analyzing receipt with AI...",
        variant: "normal",
      });
      scanCreepTimerRef.current = setInterval(() => {
        setReceiptProgress((prev) => {
          if (!prev || prev.variant !== "normal") return prev;
          const next = Math.min(48, prev.pct + 2);
          if (next === prev.pct) return prev;
          return { ...prev, pct: next };
        });
      }, 450);

      const jobIdForScan =
        assignedJobId?.trim() || propJobId?.trim() || null;
      const r = await fetch("/api/tools/scan-receipt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mediaType,
          jobId: jobIdForScan,
          dailyLogId: dailyLogId?.trim() || null,
        }),
      });
      clearScanCreepTimer();
      const j = (await r.json()) as {
        ok?: boolean;
        data?: ScanReceiptResult;
        error?: string;
      };
      if (!r.ok || !j.ok || !j.data) {
        const base = (j.error ?? "").trim() || "Could not read receipt.";
        const msg = r.status ? `${base} (HTTP ${r.status})` : base;
        showToast({
          message: msg,
          variant: "error",
        });
        setReceiptProgress({
          pct: 100,
          label: "",
          variant: "error",
          errorDetail: msg,
        });
        setPhase("idle");
        window.setTimeout(() => setReceiptProgress(null), 6000);
        return;
      }
      setReceiptProgress({
        pct: 62,
        label: "Extracting receipt data...",
        variant: "normal",
      });
      await new Promise((res) => window.setTimeout(res, 280));
      applyScan(j.data);
      setPhase("review");
      setReceiptProgress(null);
      showToast({
        message: "Review extracted details below.",
        variant: "success",
      });
    } catch {
      clearScanCreepTimer();
      showToast({ message: "Scan request failed.", variant: "error" });
      setReceiptProgress({
        pct: 100,
        label: "",
        variant: "error",
        errorDetail: "Scan request failed.",
      });
      setPhase("idle");
      window.setTimeout(() => setReceiptProgress(null), 6000);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void processFile(f);
  };

  const resetCapture = (opts?: { keepProgressBar?: boolean }) => {
    clearScanCreepTimer();
    if (!opts?.keepProgressBar) setReceiptProgress(null);
    setPhase("idle");
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const saveReceipt = async () => {
    if (!file) {
      showToast({ message: "No receipt image.", variant: "error" });
      return;
    }
    const total = parseFloat(totalAmount);
    if (Number.isNaN(total)) {
      showToast({ message: "Enter a valid total amount.", variant: "error" });
      return;
    }

    setSaving(true);
      setReceiptProgress({
        pct: 70,
        label: "Uploading image...",
        variant: "normal",
      });
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user?.id) {
        showToast({ message: "Sign in required.", variant: "error" });
        setReceiptProgress({
          pct: 100,
          label: "",
          variant: "error",
          errorDetail: "Sign in required.",
        });
        window.setTimeout(() => setReceiptProgress(null), 5000);
        return;
      }

      const id = crypto.randomUUID();
      const ext = file.type.includes("png")
        ? "png"
        : file.type.includes("webp")
          ? "webp"
          : "jpg";
      const path = `${id}/receipt.${ext}`;

      const { error: upErr } = await sb.storage
        .from("job-receipts")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        });
      if (upErr) throw upErr;

      setReceiptProgress({
        pct: 85,
        label: "Saving receipt...",
        variant: "normal",
      });

      const sub = subtotal.trim() ? parseFloat(subtotal) : null;
      const tax = taxAmount.trim() ? parseFloat(taxAmount) : null;
      const jobIdValue = assignedJobId?.trim() || null;
      const row = {
        id,
        uploaded_by: user.id,
        job_id: jobIdValue,
        daily_log_id: dailyLogId?.trim() || null,
        storage_path: path,
        vendor_name: vendorName.trim() || null,
        receipt_date: receiptDate.trim() || null,
        subtotal: sub != null && !Number.isNaN(sub) ? sub : null,
        tax_amount: tax != null && !Number.isNaN(tax) ? tax : null,
        total_amount: total,
        payment_method: paymentMethod.trim() || null,
        card_last_four: cardLastFour.trim() || null,
        card_type: cardType.trim() || null,
        receipt_category: category,
        line_items: lineItems,
        confidence:
          confidence > 0
            ? Math.min(999.99, Math.round(confidence * 100) / 100)
            : null,
        notes: notes.trim() || null,
      };

      setReceiptProgress({
        pct: 94,
        label: "Saving receipt...",
        variant: "normal",
      });

      const { data: inserted, error: insErr } = await sb
        .from("receipts")
        .insert(row)
        .select("*")
        .single();

      if (insErr) {
        const bits = [
          insErr.message,
          insErr.code ? `code ${insErr.code}` : null,
          insErr.details ? String(insErr.details) : null,
          insErr.hint ? `hint: ${insErr.hint}` : null,
        ].filter(Boolean);
        throw new Error(bits.join(" — ") || "Insert failed");
      }

      const rec = inserted as ReceiptRow;
      if (Array.isArray(rec.line_items)) {
        /* ok */
      } else if (typeof rec.line_items === "string") {
        try {
          rec.line_items = JSON.parse(rec.line_items) as ReceiptLineItem[];
        } catch {
          rec.line_items = [];
        }
      }

      const linkedJob = jobIdValue
        ? jobs.find((j) => j.id === jobIdValue)
        : undefined;
      const jobLabelForToast = linkedJob ? formatJobLabel(linkedJob) : null;
      showToast({
        message: jobLabelForToast
          ? `Receipt saved — linked to ${jobLabelForToast}.`
          : "Saved to unassigned receipts.",
        variant: "success",
      });
      setReceiptProgress({
        pct: 100,
        label: "",
        variant: "success",
      });
      onSaved?.(rec);
      resetCapture({ keepProgressBar: true });
      window.setTimeout(() => {
        setReceiptProgress(null);
      }, 2200);
      setVendorName("");
      setReceiptDate("");
      setSubtotal("");
      setTaxAmount("");
      setTotalAmount("");
      setPaymentMethod("");
      setCardLastFour("");
      setCardType("");
      setCategory("Other");
      setLineItems([]);
      setNotes("");
      setConfidence(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      showToast({
        message: msg,
        variant: "error",
      });
      setReceiptProgress({
        pct: 100,
        label: "",
        variant: "error",
        errorDetail: msg,
      });
      window.setTimeout(() => setReceiptProgress(null), 6500);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "app-input mt-1 w-full text-sm";
  const labelCls = "text-xs font-semibold text-white/50";

  const body = (
    <div className="space-y-4">
      {showSuggestBanner && punchSuggestion?.jobId ? (
        <div className="rounded-xl border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-4 py-3 text-sm text-white/90">
          <p>
            This looks like it might be for{" "}
            <span className="font-semibold text-[#E8C84A]">
              {punchSuggestion.jobName}
            </span>
            {" — "}
            assign to this job?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-[#E8C84A] px-3 py-1.5 text-xs font-bold text-[#0a1628]"
              onClick={() => {
                setAssignedJobId(punchSuggestion.jobId!);
                setShowSuggestBanner(false);
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/25 px-3 py-1.5 text-xs text-white/85"
              onClick={() => setShowSuggestBanner(false)}
            >
              Choose different
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/25 px-3 py-1.5 text-xs text-white/85"
              onClick={() => {
                setAssignedJobId(null);
                setShowSuggestBanner(false);
                setPunchSuggestion(null);
              }}
            >
              Leave unassigned
            </button>
          </div>
        </div>
      ) : null}

      {phase === "idle" || phase === "reading" ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="rounded-xl border-2 border-dashed border-white/20 bg-black/20 px-4 py-8 text-center"
        >
          <p className="text-sm text-white/70">
            {phase === "reading"
              ? "Reading receipt…"
              : "Drop a receipt photo here, or use the buttons below."}
          </p>
          {phase === "reading" ? (
            <p className="mt-2 text-xs text-[#E8C84A]">Reading receipt…</p>
          ) : (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void processFile(f);
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void processFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628]"
              >
                Camera
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-white/25 px-4 py-2 text-sm text-white/90"
              >
                Upload
              </button>
            </div>
          )}
        </div>
      ) : null}

      {receiptProgress ? (
        <div className="w-full space-y-2">
          <div
            className={`h-2 w-full overflow-hidden rounded-full bg-white/10 transition-colors duration-300 ${
              receiptProgress.variant === "error"
                ? "ring-1 ring-red-500/50"
                : ""
            }`}
          >
            <div
              className={`h-2 max-w-full rounded-full transition-all duration-300 ${
                receiptProgress.variant === "error"
                  ? "bg-red-500"
                  : receiptProgress.variant === "success"
                    ? "bg-emerald-500"
                    : "bg-[#E8C84A]"
              }`}
              style={{
                width: `${
                  receiptProgress.variant === "success"
                    ? 100
                    : Math.min(100, Math.round(receiptProgress.pct))
                }%`,
              }}
            />
          </div>
          <p
            className={`text-center text-xs ${
              receiptProgress.variant === "error"
                ? "text-red-300"
                : receiptProgress.variant === "success"
                  ? "text-emerald-200"
                  : "text-white/70"
            }`}
          >
            {receiptProgress.variant === "success"
              ? "✅ Receipt saved!"
              : receiptProgress.variant === "error"
                ? receiptProgress.errorDetail ?? "Something went wrong."
                : `${Math.round(receiptProgress.pct)}% - ${receiptProgress.label}`}
          </p>
        </div>
      ) : null}

      {phase === "review" && previewUrl ? (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {assignedJobId?.trim() && jobExpenseCtx ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-sm text-white/90">
              <p className="font-semibold text-emerald-200">
                {jobExpenseCtx.label}
              </p>
              {jobExpenseCtx.address ? (
                <p className="mt-1 text-xs text-white/60">
                  {jobExpenseCtx.address}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-white/70">
                {jobExpenseCtx.receiptCount} receipt
                {jobExpenseCtx.receiptCount === 1 ? "" : "s"} on file · Running
                total{" "}
                <span className="font-semibold text-[#E8C84A]">
                  $
                  {jobExpenseCtx.totalSpend.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>{" "}
                <span className="text-white/45">(before this one)</span>
              </p>
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Receipt"
            className="mx-auto max-h-48 rounded-lg border border-white/10 object-contain"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Vendor name</label>
              <input
                className={inputCls}
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                className={inputCls}
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                className={inputCls}
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ReceiptCategory)
                }
              >
                {RECEIPT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Total amount</label>
              <input
                type="number"
                step="0.01"
                className={`${inputCls} text-2xl font-bold text-[#E8C84A]`}
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Subtotal</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Tax amount</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Payment method</label>
              <input
                className={inputCls}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Job assignment</label>
              <select
                className={inputCls}
                value={assignedJobId ?? ""}
                onChange={(e) =>
                  setAssignedJobId(e.target.value.trim() || null)
                }
              >
                <option value="">— Unassigned —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {formatJobLabel(j)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Card type</label>
              <input
                className={inputCls}
                value={cardType}
                onChange={(e) => setCardType(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Card last four</label>
              <input
                className={inputCls}
                value={cardLastFour}
                onChange={(e) => setCardLastFour(e.target.value)}
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Line items</label>
            <ul className="mt-2 space-y-2">
              {lineItems.map((line, i) => (
                <li
                  key={i}
                  className="grid gap-2 rounded-lg border border-white/10 p-2 sm:grid-cols-12"
                >
                  <input
                    className={`${inputCls} sm:col-span-5`}
                    value={line.description}
                    placeholder="Description"
                    onChange={(e) => {
                      const v = e.target.value;
                      setLineItems((rows) => {
                        const next = [...rows];
                        next[i] = { ...next[i]!, description: v };
                        return next;
                      });
                    }}
                  />
                  <input
                    type="number"
                    className={`${inputCls} sm:col-span-2`}
                    value={line.quantity ?? ""}
                    placeholder="Qty"
                    onChange={(e) => {
                      const v = e.target.value;
                      setLineItems((rows) => {
                        const next = [...rows];
                        next[i] = {
                          ...next[i]!,
                          quantity: v === "" ? null : parseFloat(v),
                        };
                        return next;
                      });
                    }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputCls} sm:col-span-2`}
                    value={line.unit_price ?? ""}
                    placeholder="Unit $"
                    onChange={(e) => {
                      const v = e.target.value;
                      setLineItems((rows) => {
                        const next = [...rows];
                        next[i] = {
                          ...next[i]!,
                          unit_price: v === "" ? null : parseFloat(v),
                        };
                        return next;
                      });
                    }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputCls} sm:col-span-2`}
                    value={line.total}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setLineItems((rows) => {
                        const next = [...rows];
                        next[i] = {
                          ...next[i]!,
                          total: Number.isNaN(v) ? 0 : v,
                        };
                        return next;
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="text-xs text-red-300 sm:col-span-1"
                    onClick={() =>
                      setLineItems((rows) => rows.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[#E8C84A] hover:underline"
              onClick={() =>
                setLineItems((r) => [
                  ...r,
                  {
                    description: "",
                    quantity: null,
                    unit_price: null,
                    total: 0,
                  },
                ])
              }
            >
              + Add line
            </button>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className="app-input mt-1 min-h-[4rem] w-full resize-y text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {confidence > 0 ? (
            <p className="text-xs text-white/45">
              Model confidence: {Math.round(confidence * 100)}%
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveReceipt()}
              className="btn-primary btn-h-11"
            >
              {saving ? "Saving…" : "Save receipt"}
            </button>
            <button
              type="button"
              onClick={() => resetCapture()}
              className="btn-secondary btn-h-11"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (collapsible) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-white"
        >
          {title}
          <span className="text-[#E8C84A]">{expanded ? "▼" : "▶"}</span>
        </button>
        {expanded ? <div className="mt-4">{body}</div> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-[#E8C84A]">{title}</h3>
      <div className="mt-3">{body}</div>
    </div>
  );
}
