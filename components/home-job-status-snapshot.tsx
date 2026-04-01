"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";

type StatusCount = { status: string; count: number };

const STATUS_CONFIG: {
  status: string;
  label: string;
  color: string;
  border: string;
}[] = [
  {
    status: "Active",
    label: "Active",
    color: "text-emerald-200",
    border: "border-emerald-500/30",
  },
  {
    status: "Lead",
    label: "Lead",
    color: "text-sky-200",
    border: "border-sky-500/30",
  },
  {
    status: "Quoted",
    label: "Quoted",
    color: "text-[#E8C84A]",
    border: "border-[#E8C84A]/30",
  },
  {
    status: "On Hold",
    label: "On Hold",
    color: "text-amber-200",
    border: "border-amber-500/30",
  },
  {
    status: "Complete",
    label: "Complete",
    color: "text-white/60",
    border: "border-white/15",
  },
  {
    status: "Cancelled",
    label: "Cancelled",
    color: "text-red-300/70",
    border: "border-red-500/20",
  },
];

export function HomeJobStatusSnapshot() {
  const { role, loading: roleLoading } = useUserRole();
  const isAllowed =
    role === "super_admin" || role === "admin";

  const [counts, setCounts] = useState<StatusCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading || !isAllowed) return;
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data } = await sb
          .from("jobs")
          .select("status");
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const row of data ?? []) {
          const s = (row as { status: string }).status;
          map[s] = (map[s] ?? 0) + 1;
        }
        setCounts(
          STATUS_CONFIG.map((c) => ({
            status: c.status,
            count: map[c.status] ?? 0,
          })),
        );
      } catch {
        if (!cancelled) setCounts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleLoading, isAllowed]);

  if (roleLoading || !isAllowed) return null;

  return (
    <section
      className="mt-4 w-full max-w-6xl self-stretch text-left"
      aria-label="Job status snapshot"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
          Job Pipeline
        </p>
        <Link
          href="/jobs"
          className="text-xs text-[#E8C84A] hover:underline"
        >
          View all jobs →
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STATUS_CONFIG.map((c) => (
            <div
              key={c.status}
              className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STATUS_CONFIG.map((cfg) => {
            const count =
              counts.find((c) => c.status === cfg.status)?.count ?? 0;
            return (
              <Link
                key={cfg.status}
                href={`/jobs?status=${encodeURIComponent(cfg.status)}`}
                className={`flex flex-col rounded-xl border bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.07] ${cfg.border}`}
              >
                <span
                  className={`text-xl font-bold tabular-nums ${cfg.color}`}
                >
                  {count}
                </span>
                <span className="mt-0.5 text-[11px] text-white/50">
                  {cfg.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
