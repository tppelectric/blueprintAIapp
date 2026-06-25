"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/** Standard job option with a prebuilt search haystack. */
export type JobPickerOption = {
  id: string;
  label: string; // "1234 · Job Name"
  customerName: string;
  status: string;
  /** Lowercased: number, name, customer/contractor, location, address. */
  search: string;
};

const INACTIVE_JOB_STATUSES = new Set([
  "Completed",
  "Cancelled",
  "Closed",
  "Lost",
]);

function buildLabel(rec: Record<string, unknown>): string {
  const a = String(rec.job_number ?? "").trim();
  const b = String(rec.job_name ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "Job";
}

/**
 * Loads jobs once with the standard searchable fields (number, name,
 * customer/contractor, location, address). Used by every job picker so search
 * behaves the same app-wide.
 */
export function useJobPickerOptions(includeInactive = false) {
  const [all, setAll] = useState<JobPickerOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data } = await sb
        .from("jobs")
        .select(
          "id,job_name,job_number,status,location_name,address,customers(company_name,contact_name)",
        )
        .order("updated_at", { ascending: false })
        .limit(500);
      setAll(
        (data ?? []).map((j) => {
          const rec = j as Record<string, unknown>;
          const custRaw = rec.customers;
          const c = (
            Array.isArray(custRaw) ? custRaw[0] : custRaw
          ) as { company_name?: string | null; contact_name?: string | null } | null;
          const customerName =
            c?.company_name?.trim() || c?.contact_name?.trim() || "";
          const label = buildLabel(rec);
          const loc = String(rec.location_name ?? "").trim();
          const addr = String(rec.address ?? "").trim();
          return {
            id: j.id as string,
            label,
            customerName,
            status: String(rec.status ?? "").trim() || "Lead",
            search: [label, customerName, loc, addr]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
          };
        }),
      );
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const jobs = useMemo(
    () =>
      includeInactive
        ? all
        : all.filter((j) => !INACTIVE_JOB_STATUSES.has(j.status)),
    [all, includeInactive],
  );

  return { jobs, loading, reload: load };
}

/**
 * Reusable job picker: search box + scrollable select, matching number, name,
 * customer/contractor, location, address (partial). `onChange` returns the full
 * option (or null) so callers get the label too.
 */
export function JobSearchPicker({
  value,
  onChange,
  size = 6,
  includeInactive = false,
  placeholder = "Search number, name, customer, location, address…",
  inputClassName = "app-input mt-1 w-full text-sm",
  selectClassName = "app-input mt-2 w-full text-sm",
}: {
  value: string | null;
  onChange: (option: JobPickerOption | null) => void;
  size?: number;
  includeInactive?: boolean;
  placeholder?: string;
  inputClassName?: string;
  selectClassName?: string;
}) {
  const { jobs, loading } = useJobPickerOptions(includeInactive);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return jobs;
    return jobs.filter((j) => j.search.includes(t));
  }, [jobs, q]);

  return (
    <div>
      <input
        className={inputClassName}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={loading ? "Loading jobs…" : placeholder}
        autoComplete="off"
      />
      <select
        className={selectClassName}
        size={size}
        value={value ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id ? (jobs.find((j) => j.id === id) ?? null) : null);
        }}
      >
        <option value="">— Choose job —</option>
        {filtered.map((j) => (
          <option key={j.id} value={j.id}>
            {j.label}
            {j.customerName ? ` — ${j.customerName}` : ""}
          </option>
        ))}
      </select>
      {!loading && filtered.length === 0 ? (
        <p className="mt-1 text-xs text-amber-200/80">No jobs match.</p>
      ) : null}
    </div>
  );
}
