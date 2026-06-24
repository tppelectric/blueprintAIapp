"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { canPushReceiptToJobtread } from "@/lib/user-roles";
import {
  displayProfileName,
  formatReceiptCurrency,
  type ReceiptRow,
} from "@/lib/receipts-types";
import { parseReceiptRow } from "@/lib/receipts-parse";

type PushPreview = {
  blockReason: string | null;
  notePreview: string;
  alreadyPushed: boolean;
  pushedAt: string | null;
  jobLive: {
    title: string;
    number: string | null;
    name: string;
    customerName: string | null;
    address: string | null;
    status: string | null;
  } | null;
};

type JobLite = {
  id: string;
  job_name: string | null;
  job_number: string | null;
};

type ProfileLite = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

function formatJobTitle(j: {
  job_number?: string | null;
  job_name?: string | null;
}): string {
  const a = String(j.job_number ?? "").trim();
  const b = String(j.job_name ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "Job";
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReceiptDateOnly(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReceiptDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const { role } = useUserRole();
  const canPush = canPushReceiptToJobtread(role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [job, setJob] = useState<JobLite | null>(null);
  const [uploader, setUploader] = useState<ProfileLite | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const [pushOpen, setPushOpen] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushPreview, setPushPreview] = useState<PushPreview | null>(null);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!id?.trim()) {
      setLoading(false);
      setError("Missing receipt id.");
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setReceipt(null);
      setImageUrl(null);
      setJob(null);
      setUploader(null);

      try {
        const sb = createBrowserClient();

        const { data: raw, error: recErr } = await sb
          .from("receipts")
          .select("*")
          .eq("id", id)
          .single();

        if (cancelled) return;

        if (recErr || !raw) {
          setError(
            recErr?.message?.includes("No rows") || recErr?.code === "PGRST116"
              ? "Receipt not found."
              : recErr?.message ?? "Could not load receipt.",
          );
          setLoading(false);
          return;
        }

        const parsed = parseReceiptRow(raw as Record<string, unknown>);
        setReceipt(parsed);

        if (parsed.storage_path) {
          try {
            const { data: signed, error: signErr } = await sb.storage
              .from("job-receipts")
              .createSignedUrl(parsed.storage_path, 3600);
            if (!cancelled && !signErr && signed?.signedUrl) {
              setImageUrl(signed.signedUrl);
            }
          } catch {
            /* optional image */
          }
        }

        if (parsed.job_id) {
          try {
            const { data: jobRow, error: jobErr } = await sb
              .from("jobs")
              .select("id,job_name,job_number")
              .eq("id", parsed.job_id)
              .single();
            if (!cancelled && !jobErr && jobRow) {
              setJob(jobRow as JobLite);
            }
          } catch {
            /* optional */
          }
        }

        if (parsed.uploaded_by) {
          try {
            const { data: prof, error: profErr } = await sb
              .from("user_profiles")
              .select("id,first_name,last_name,full_name,email")
              .eq("id", parsed.uploaded_by)
              .single();
            if (!cancelled && !profErr && prof) {
              setUploader(prof as ProfileLite);
            }
          } catch {
            /* optional */
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const closePushModal = useCallback(() => {
    setPushOpen(false);
    setPushPreview(null);
    setPushError(null);
    setPushSuccess(null);
  }, []);

  const openPushModal = useCallback(async () => {
    if (!id?.trim()) return;
    setPushOpen(true);
    setPushLoading(true);
    setPushError(null);
    setPushSuccess(null);
    setPushPreview(null);
    try {
      const res = await fetch(
        `/api/receipts/${encodeURIComponent(id)}/jobtread-push-preview`,
        { credentials: "include" },
      );
      const body = (await res.json()) as PushPreview & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? "Could not load push preview.");
      }
      setPushPreview({
        blockReason: body.blockReason ?? null,
        notePreview: body.notePreview ?? "",
        alreadyPushed: Boolean(body.alreadyPushed),
        pushedAt: body.pushedAt ?? null,
        jobLive: body.jobLive ?? null,
      });
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setPushLoading(false);
    }
  }, [id]);

  const confirmPush = useCallback(async () => {
    if (!id?.trim()) return;
    setPushSaving(true);
    setPushError(null);
    try {
      const res = await fetch(
        `/api/receipts/${encodeURIComponent(id)}/jobtread-push`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        pushedAt?: string;
        commentId?: string;
        fileId?: string | null;
        imageWarning?: string | null;
      };
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? "Push failed.");
      }
      setPushSuccess(
        body.fileId
          ? "Receipt note + image posted to JobTread."
          : body.imageWarning
            ? `Note posted to JobTread. Image not attached: ${body.imageWarning}`
            : "Receipt note posted to JobTread.",
      );
      setReceipt((prev) =>
        prev
          ? {
              ...prev,
              pushed_to_jobtread_at: body.pushedAt ?? new Date().toISOString(),
              jobtread_comment_id: body.commentId ?? prev.jobtread_comment_id,
            }
          : prev,
      );
      setTimeout(() => closePushModal(), 1200);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Push failed.");
    } finally {
      setPushSaving(false);
    }
  }, [id, closePushModal]);

  const pageTitle = receipt?.vendor_name?.trim() || "Receipt";

  const aiRows: { label: string; value: string }[] = [];
  if (receipt) {
    if (receipt.vendor_name?.trim()) {
      aiRows.push({ label: "Vendor", value: receipt.vendor_name.trim() });
    }
    if (receipt.receipt_date?.trim()) {
      aiRows.push({
        label: "Receipt date",
        value: formatReceiptDateOnly(receipt.receipt_date),
      });
    }
    aiRows.push({
      label: "Total",
      value: formatReceiptCurrency(receipt.total_amount),
    });
    if (receipt.subtotal != null) {
      aiRows.push({
        label: "Subtotal",
        value: formatReceiptCurrency(receipt.subtotal),
      });
    }
    if (receipt.tax_amount != null) {
      aiRows.push({
        label: "Tax",
        value: formatReceiptCurrency(receipt.tax_amount),
      });
    }
    if (receipt.receipt_category?.trim()) {
      aiRows.push({ label: "Category", value: receipt.receipt_category });
    }
    if (receipt.payment_method?.trim()) {
      aiRows.push({
        label: "Payment method",
        value: receipt.payment_method.trim(),
      });
    }
    if (receipt.description?.trim()) {
      aiRows.push({ label: "Description", value: receipt.description.trim() });
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-5xl flex-1 py-8 md:py-10">
        <Link
          href="/receipts"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Receipts
        </Link>

        {loading ? (
          <div className="mt-6 space-y-4">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="aspect-[3/4] max-h-[70vh] animate-pulse rounded-xl bg-white/10" />
              <div className="space-y-3">
                <div className="h-6 w-full animate-pulse rounded bg-white/10" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="h-10 w-1/2 animate-pulse rounded bg-white/10" />
                <div className="h-24 w-full animate-pulse rounded-lg bg-white/10" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-5">
            <p className="font-medium text-red-200">{error}</p>
            <Link
              href="/receipts"
              className="mt-3 inline-block text-sm text-[#E8C84A] hover:underline"
            >
              ← Back to receipts
            </Link>
          </div>
        ) : receipt ? (
          <>
            <h1 className="mt-4 text-2xl font-bold text-white md:text-3xl">
              {pageTitle}
            </h1>

            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0">
                {imageUrl ? (
                  <button
                    type="button"
                    className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/20 ring-1 ring-white/10"
                    onClick={() => setLightbox(true)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt=""
                      className="mx-auto max-h-[70vh] w-full object-contain"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-[3/4] max-h-[50vh] items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white/40">
                    No image available
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-4 text-sm text-white/88">
                <div>
                  <p className="text-xl font-bold text-white md:text-2xl">
                    {receipt.vendor_name?.trim() || "—"}
                  </p>
                  <p className="mt-1 text-white/55">
                    {formatReceiptDateOnly(receipt.receipt_date)}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-[#E8C84A]">
                    {formatReceiptCurrency(receipt.total_amount)}
                  </p>
                </div>

                {(receipt.subtotal != null || receipt.tax_amount != null) && (
                  <div className="space-y-1 text-white/70">
                    {receipt.subtotal != null ? (
                      <p>
                        <span className="text-white/45">Subtotal:</span>{" "}
                        {formatReceiptCurrency(receipt.subtotal)}
                      </p>
                    ) : null}
                    {receipt.tax_amount != null ? (
                      <p>
                        <span className="text-white/45">Tax:</span>{" "}
                        {formatReceiptCurrency(receipt.tax_amount)}
                      </p>
                    ) : null}
                  </div>
                )}

                <div>
                  <span className="inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/85">
                    {receipt.receipt_category}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white/45">Status:</span>
                  {receipt.job_id && job ? (
                    <>
                      <span className="text-white/80">Assigned to</span>
                      <Link
                        href={`/jobs/${receipt.job_id}`}
                        className="font-semibold text-[#E8C84A] hover:underline"
                      >
                        {formatJobTitle(job)}
                      </Link>
                    </>
                  ) : receipt.job_id ? (
                    <Link
                      href={`/jobs/${receipt.job_id}`}
                      className="font-semibold text-[#E8C84A] hover:underline"
                    >
                      View job
                    </Link>
                  ) : (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-300">
                      Unassigned
                    </span>
                  )}
                </div>

                {canPush ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void openPushModal()}
                      disabled={!receipt.job_id || Boolean(receipt.pushed_to_jobtread_at)}
                      className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/15 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Push to JobTread
                    </button>
                    {receipt.pushed_to_jobtread_at ? (
                      <span className="text-xs text-emerald-300">
                        Pushed{" "}
                        {formatDisplayDate(receipt.pushed_to_jobtread_at)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {receipt.description?.trim() ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">
                      Description
                    </p>
                    <p className="mt-1 text-white/85">{receipt.description}</p>
                  </div>
                ) : null}

                {receipt.notes?.trim() ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-white/75">
                      {receipt.notes}
                    </p>
                  </div>
                ) : null}

                <div className="border-t border-white/10 pt-4 text-white/70">
                  <p>
                    <span className="text-white/45">Uploaded by:</span>{" "}
                    {uploader
                      ? displayProfileName(uploader)
                      : receipt.uploaded_by
                        ? "—"
                        : "—"}
                  </p>
                  <p className="mt-1">
                    <span className="text-white/45">Uploaded at:</span>{" "}
                    {formatDisplayDate(receipt.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {receipt.line_items && receipt.line_items.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                  Line Items
                </h2>
                <div className="mt-3 overflow-x-auto rounded-xl border border-white/12">
                  <table className="w-full min-w-[500px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.04]">
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">Description</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">Qty</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">Unit Price</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.line_items.map((item, i) => (
                        <tr key={i} className="border-b border-white/5 odd:bg-white/[0.02]">
                          <td className="px-4 py-3 text-white/88">{item.description}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/70">
                            {item.quantity ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/70">
                            {item.unit_price != null ? formatReceiptCurrency(item.unit_price) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#E8C84A]">
                            {formatReceiptCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/15 bg-white/[0.04]">
                        <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-white/55">
                          Total
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-[#E8C84A]">
                          {formatReceiptCurrency(receipt.total_amount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            ) : null}

            {aiRows.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                  AI Extracted Data
                </h2>
                <div className="mt-3 rounded-xl border border-white/12 bg-white/[0.03] p-4">
                  <dl className="space-y-3">
                    {aiRows.map((row) => (
                      <div key={row.label}>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-white/45">
                          {row.label}
                        </dt>
                        <dd className="mt-0.5 text-sm text-white">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>

      {lightbox && imageUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          aria-label="Close"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      ) : null}

      {pushOpen ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-jt-push-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-white/12 bg-[#0a1628] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2
                id="receipt-jt-push-title"
                className="text-sm font-semibold text-white"
              >
                Push receipt to JobTread
              </h2>
              <button
                type="button"
                onClick={closePushModal}
                disabled={pushSaving}
                className="rounded-lg px-2 py-1 text-sm text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-4 py-3">
              {pushLoading ? (
                <p className="text-sm text-white/55">Loading JobTread job…</p>
              ) : pushError && !pushPreview ? (
                <p className="text-sm text-red-300">{pushError}</p>
              ) : (
                <>
                  {pushPreview?.blockReason ? (
                    <p className="mb-3 text-sm text-amber-200">
                      {pushPreview.blockReason}
                    </p>
                  ) : null}
                  {pushSuccess ? (
                    <p className="mb-3 text-sm text-emerald-300">{pushSuccess}</p>
                  ) : null}
                  {pushPreview?.jobLive ? (
                    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                        JobTread job (live)
                      </p>
                      <p className="mt-1 font-semibold text-white">
                        {pushPreview.jobLive.title}
                      </p>
                      {pushPreview.jobLive.customerName ? (
                        <p className="mt-1 text-white/70">
                          Customer: {pushPreview.jobLive.customerName}
                        </p>
                      ) : null}
                      {pushPreview.jobLive.address ? (
                        <p className="mt-0.5 text-white/55">
                          {pushPreview.jobLive.address}
                        </p>
                      ) : null}
                      {pushPreview.jobLive.status ? (
                        <p className="mt-1 text-xs text-white/45">
                          Status: {pushPreview.jobLive.status}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    Comment preview
                  </p>
                  <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-sans text-xs leading-relaxed text-white/85">
                    {pushPreview?.notePreview ?? "—"}
                  </pre>
                  <p className="mt-3 text-[11px] text-white/40">
                    The note above plus the receipt photo are posted to the
                    JobTread job.
                  </p>
                  {pushError && pushPreview ? (
                    <p className="mt-3 text-sm text-red-300">{pushError}</p>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={closePushModal}
                disabled={pushSaving}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  pushSaving ||
                  pushLoading ||
                  !pushPreview ||
                  Boolean(pushPreview.blockReason) ||
                  Boolean(pushSuccess)
                }
                onClick={() => void confirmPush()}
                className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/15 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pushSaving ? "Pushing…" : "Confirm & push"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
