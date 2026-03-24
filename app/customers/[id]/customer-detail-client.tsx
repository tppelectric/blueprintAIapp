"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CustomerRow, JobRow } from "@/lib/jobs-types";

export function CustomerDetailClient({ id }: { id: string }) {
  const [c, setC] = useState<CustomerRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data: cust, error: ce } = await sb
        .from("customers")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (ce || !cust) {
        setError("Customer not found.");
        return;
      }
      setC(cust as CustomerRow);
      const { data: j } = await sb
        .from("jobs")
        .select("*")
        .eq("customer_id", id)
        .order("updated_at", { ascending: false });
      setJobs((j ?? []) as JobRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error || !c) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="customers" showTppSubtitle />
        <main className="p-10 text-red-200">{error ?? "…"}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="customers" showTppSubtitle />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <Link href="/customers" className="text-sm text-[#E8C84A] hover:underline">
          ← Customers
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          {c.company_name || c.contact_name || "Customer"}
        </h1>
        <dl className="mt-4 space-y-2 text-sm text-white/80">
          <div>
            <dt className="text-white/45">Contact</dt>
            <dd>{c.contact_name}</dd>
          </div>
          <div>
            <dt className="text-white/45">Phone</dt>
            <dd>{c.phone}</dd>
          </div>
          <div>
            <dt className="text-white/45">Email</dt>
            <dd>{c.email}</dd>
          </div>
          {[c.address, c.city, c.state, c.zip].some(Boolean) ? (
            <div>
              <dt className="text-white/45">Address</dt>
              <dd>
                {[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}
              </dd>
            </div>
          ) : null}
          {c.notes ? (
            <div>
              <dt className="text-white/45">Notes</dt>
              <dd>{c.notes}</dd>
            </div>
          ) : null}
        </dl>

        <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-[#E8C84A]/90">
          Jobs
        </h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-white/45">No jobs for this customer.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className="block rounded-lg border border-white/10 px-3 py-2 text-sm text-white hover:border-[#E8C84A]/45"
                >
                  {j.job_number} · {j.job_name} · {j.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
