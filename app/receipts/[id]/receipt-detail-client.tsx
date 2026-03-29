"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  displayProfileName,
  formatReceiptCurrency,
  type ReceiptRow,
} from "@/lib/receipts-types";
import { parseReceiptRow } from "@/lib/receipts-parse";

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [job, setJob] = useState<JobLite | null>(null);
  const [uploader, setUploader] = useState<ProfileLite | null>(null);
  const [lightbox, setLightbox] = useState(false);

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
    </div>
  );
}
