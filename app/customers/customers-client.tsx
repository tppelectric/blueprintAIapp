"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CustomerRow } from "@/lib/jobs-types";

type Row = CustomerRow & { job_count?: number };

export function CustomersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data: cust, error: ce } = await sb
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (ce) throw ce;
      const { data: jobs } = await sb.from("jobs").select("id,customer_id");
      const byC: Record<string, number> = {};
      for (const j of jobs ?? []) {
        const cid = (j as { customer_id: string | null }).customer_id;
        if (cid) byC[cid] = (byC[cid] ?? 0) + 1;
      }
      setRows(
        (cust ?? []).map((c) => ({
          ...(c as CustomerRow),
          job_count: byC[(c as CustomerRow).id] ?? 0,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="customers" showTppSubtitle />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-white">Customers</h1>
          <Link
            href="/jobs"
            className="text-sm text-[#E8C84A] hover:underline"
          >
            Jobs →
          </Link>
        </div>
        {loading ? (
          <p className="mt-10 text-white/60">Loading…</p>
        ) : error ? (
          <p className="mt-10 text-red-200">{error}</p>
        ) : rows.length === 0 ? (
          <p className="mt-10 text-white/55">No customers yet.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 hover:border-[#E8C84A]/45"
                >
                  <p className="font-semibold text-white">
                    {c.company_name || c.contact_name || "Customer"}
                  </p>
                  <p className="text-sm text-white/55">
                    {c.phone} · {c.email}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    {c.job_count ?? 0} job{(c.job_count ?? 0) === 1 ? "" : "s"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
