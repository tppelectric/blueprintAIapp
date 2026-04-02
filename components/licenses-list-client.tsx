"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { mapLicenseRow } from "@/lib/license-mappers";
import type { LicenseRow } from "@/lib/license-types";
import {
  daysUntilExpiryUtc,
  expiryColorTier,
  expiryTierClasses,
  isStatActive,
  isStatExpired,
  isStatExpiringSoon,
  isStatInPursuit,
  licenseTypeLabel,
} from "@/lib/license-utils";
import { createBrowserClient } from "@/lib/supabase/client";
import { userDisplayName } from "@/lib/user-display-name";
import { canManageLicenses } from "@/lib/user-roles";

type UserOpt = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function statusBadgeClass(status: LicenseRow["license_status"]): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-100 ring-emerald-400/35";
    case "in_pursuit":
      return "bg-sky-500/20 text-sky-100 ring-sky-400/35";
    case "expired":
      return "bg-red-500/20 text-red-100 ring-red-400/40";
    case "suspended":
      return "bg-zinc-500/25 text-zinc-200 ring-zinc-400/30";
    default:
      return "bg-white/10 text-white/80 ring-white/15";
  }
}

function statusLabel(status: LicenseRow["license_status"]): string {
  switch (status) {
    case "in_pursuit":
      return "In pursuit";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function LicenseCard({ l, holderLabel }: { l: LicenseRow; holderLabel: string }) {
  const tier = expiryColorTier(l.expiry_date, l.license_status);
  const days = daysUntilExpiryUtc(l.expiry_date);
  const ceReq = Number(l.ce_hours_required ?? 0);
  const ceDone = Number(l.ce_hours_completed ?? 0);
  const cePct =
    l.requires_ce && ceReq > 0
      ? Math.min(100, Math.round((ceDone / ceReq) * 100))
      : null;

  const expiryLine =
    l.license_status === "in_pursuit" ? (
      <span className="text-sky-200/90">Pursuit — no expiry yet</span>
    ) : days == null ? (
      <span className="text-white/50">No expiry date</span>
    ) : days < 0 ? (
      <span className="text-red-200">Expired {Math.abs(days)}d ago</span>
    ) : (
      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${expiryTierClasses(tier)}`}>
        Expires {l.expiry_date} · {days}d left
      </span>
    );

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">
            {l.license_name}
          </p>
          <p className="mt-0.5 text-sm text-white/55">
            {l.license_number?.trim() || "No number"} ·{" "}
            {licenseTypeLabel(l.license_type, l.license_type_custom)}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {l.issuing_authority?.trim() || "—"}
            {l.jurisdiction_summary?.trim()
              ? ` · ${l.jurisdiction_summary.trim()}`
              : l.state
                ? ` · ${[l.state, l.county, l.municipality].filter(Boolean).join(", ")}`
                : ""}
          </p>
          <p className="mt-1 text-xs text-white/50">Holder: {holderLabel}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusBadgeClass(l.license_status)}`}
        >
          {statusLabel(l.license_status)}
        </span>
      </div>
      <div className="mt-3 text-xs">{expiryLine}</div>
      {cePct != null ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-white/55">
            <span>CE progress</span>
            <span className="tabular-nums">
              {ceDone} / {ceReq} hrs ({cePct}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#E8C84A]/85 transition-[width]"
              style={{ width: `${cePct}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <Link
          href={`/licenses/${l.id}`}
          className="inline-flex rounded-lg border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20"
        >
          View
        </Link>
      </div>
    </li>
  );
}

export function LicensesListClient() {
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isAdmin = canManageLicenses(role);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("licenses")
        .select("*")
        .order("license_name");
      if (error) throw error;
      setRows(
        (data ?? []).map((r) => mapLicenseRow(r as Record<string, unknown>)),
      );
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load licenses.",
        variant: "error",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch("/api/users/for-assignment", {
        credentials: "include",
      });
      if (!r.ok) {
        setUsers([]);
        return;
      }
      const j = (await r.json()) as {
        users?: {
          id: string;
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
        }[];
      };
      setUsers(
        (j.users ?? []).map((u) => ({
          id: u.id,
          full_name: u.full_name ?? null,
          first_name: u.first_name ?? null,
          last_name: u.last_name ?? null,
          email: u.email ?? null,
        })),
      );
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const userName = useCallback(
    (id: string | null) => {
      if (!id) return "Unknown user";
      const u = users.find((x) => x.id === id);
      if (!u) return "Employee";
      const n = userDisplayName(u);
      return n !== "—" ? n : "Employee";
    },
    [users],
  );

  const stats = useMemo(() => {
    const active = rows.filter((l) => isStatActive(l)).length;
    const expiring = rows.filter((l) => isStatExpiringSoon(l)).length;
    const expired = rows.filter((l) => isStatExpired(l)).length;
    const pursuit = rows.filter((l) => isStatInPursuit(l)).length;
    return { active, expiring, expired, pursuit };
  }, [rows]);

  const companyLicenses = useMemo(
    () => rows.filter((l) => l.holder_type === "company"),
    [rows],
  );

  const employeeGroups = useMemo(() => {
    const byUser = new Map<string, LicenseRow[]>();
    for (const l of rows) {
      if (l.holder_type !== "employee") continue;
      const uid = l.holder_user_id ?? "_unassigned";
      const arr = byUser.get(uid) ?? [];
      arr.push(l);
      byUser.set(uid, arr);
    }
    const keys = [...byUser.keys()].sort((a, b) => {
      const na = userName(a === "_unassigned" ? null : a);
      const nb = userName(b === "_unassigned" ? null : b);
      return na.localeCompare(nb);
    });
    return keys.map((k) => ({
      key: k,
      name: userName(k === "_unassigned" ? null : k),
      licenses: (byUser.get(k) ?? []).sort((a, b) =>
        a.license_name.localeCompare(b.license_name),
      ),
    }));
  }, [rows, userName]);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-6xl flex-1 py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Licenses & certifications
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Company and employee credentials, CE, and renewal tracking.
            </p>
          </div>
          {isAdmin ? (
            <Link
              href="/licenses/new"
              className="rounded-xl bg-[#E8C84A] px-4 py-2.5 text-sm font-bold text-[#0a1628] shadow-lg hover:bg-[#f0d56e]"
            >
              Add license
            </Link>
          ) : null}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200/90">
              Active
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-100">
              {loading ? "—" : stats.active}
            </p>
          </div>
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-100/90">
              Expiring soon
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-50">
              {loading ? "—" : stats.expiring}
            </p>
          </div>
          <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-100/90">
              Expired
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-red-50">
              {loading ? "—" : stats.expired}
            </p>
          </div>
          <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-100/90">
              In pursuit
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-sky-50">
              {loading ? "—" : stats.pursuit}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-white/50">Loading…</p>
        ) : (
          <>
            <section className="mt-10">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]/90">
                Company licenses
              </h2>
              {companyLicenses.length === 0 ? (
                <p className="mt-3 text-sm text-white/45">None yet.</p>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {companyLicenses.map((l) => (
                    <LicenseCard key={l.id} l={l} holderLabel="Company" />
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-12">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]/90">
                Employee licenses
              </h2>
              {employeeGroups.length === 0 ? (
                <p className="mt-3 text-sm text-white/45">None yet.</p>
              ) : (
                <div className="mt-6 space-y-8">
                  {employeeGroups.map((g) => (
                    <div key={g.key}>
                      <h3 className="text-base font-semibold text-white">
                        {g.name}
                      </h3>
                      <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                        {g.licenses.map((l) => (
                          <LicenseCard
                            key={l.id}
                            l={l}
                            holderLabel={g.name}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
