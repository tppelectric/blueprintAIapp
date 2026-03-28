"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  DEFAULT_PURSUING_REQUIREMENTS,
  ORANGE_COUNTY_NY_REQUIREMENTS,
} from "@/lib/license-default-requirements";
import { appendLicenseHistory } from "@/lib/license-history-log";
import { LICENSE_TYPE_OPTIONS } from "@/lib/license-types";
import { US_STATE_OPTIONS } from "@/lib/us-states";
import { createBrowserClient } from "@/lib/supabase/client";
import { canManageLicenses } from "@/lib/user-roles";

type UserOpt = { id: string; full_name: string | null; email: string | null };

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function LicensesNewClient() {
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const router = useRouter();
  const isAdmin = canManageLicenses(role);

  const [mode, setMode] = useState<"active" | "pursuit">("active");
  const [licenseName, setLicenseName] = useState("");
  const [licenseType, setLicenseType] = useState<string>("electrical_contractor");
  const [licenseTypeCustom, setLicenseTypeCustom] = useState("");
  const [holderType, setHolderType] = useState<"company" | "employee">(
    "company",
  );
  const [holderUserId, setHolderUserId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [jurisdictionSummary, setJurisdictionSummary] = useState("");
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [renewalFee, setRenewalFee] = useState("");
  const [notes, setNotes] = useState("");
  const [requiresCe, setRequiresCe] = useState(false);
  const [ceHoursRequired, setCeHoursRequired] = useState("");
  const [cePeriodStart, setCePeriodStart] = useState("");
  const [cePeriodEnd, setCePeriodEnd] = useState("");
  const [ceRenewalDeadline, setCeRenewalDeadline] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [reqItems, setReqItems] = useState<{ key: string; text: string }[]>(
    () =>
      DEFAULT_PURSUING_REQUIREMENTS.map((t) => ({
        key: randomId(),
        text: t,
      })),
  );

  const [users, setUsers] = useState<UserOpt[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const r = await fetch("/api/users/for-assignment", {
          credentials: "include",
        });
        if (!r.ok) return;
        const j = (await r.json()) as {
          users?: { id: string; full_name?: string | null; email?: string | null }[];
        };
        setUsers(
          (j.users ?? []).map((u) => ({
            id: u.id,
            full_name: u.full_name ?? null,
            email: u.email ?? null,
          })),
        );
      } catch {
        setUsers([]);
      }
    })();
  }, [isAdmin]);

  const addRequirement = useCallback(() => {
    setReqItems((prev) => [...prev, { key: randomId(), text: "" }]);
  }, []);

  const removeRequirement = useCallback((key: string) => {
    setReqItems((prev) => prev.filter((x) => x.key !== key));
  }, []);

  const updateRequirement = useCallback((key: string, text: string) => {
    setReqItems((prev) =>
      prev.map((x) => (x.key === key ? { ...x, text } : x)),
    );
  }, []);

  const applyOrangeCounty = useCallback(() => {
    setReqItems((prev) => {
      const existing = new Set(prev.map((p) => p.text.trim().toLowerCase()));
      const add = ORANGE_COUNTY_NY_REQUIREMENTS.filter(
        (t) => !existing.has(t.trim().toLowerCase()),
      ).map((t) => ({ key: randomId(), text: t }));
      return [...prev, ...add];
    });
    setState("NY");
    setCounty("Orange");
    showToast({
      message: "Orange County, NY checklist merged into requirements.",
      variant: "success",
    });
  }, [showToast]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const name = licenseName.trim();
    if (!name) {
      showToast({ message: "License name is required.", variant: "error" });
      return;
    }
    if (licenseType === "other" && !licenseTypeCustom.trim()) {
      showToast({
        message: "Enter a custom type or choose another option.",
        variant: "error",
      });
      return;
    }
    if (holderType === "employee" && !holderUserId) {
      showToast({
        message: "Select an employee for this license.",
        variant: "error",
      });
      return;
    }

    setBusy(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const uid = user?.id ?? null;

      let pdfPath: string | null = null;
      if (pdfFile && pdfFile.size > 0) {
        const safe = pdfFile.name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
        const objectPath = `licenses/${crypto.randomUUID()}/${safe}`;
        const { error: upErr } = await sb.storage
          .from("license-files")
          .upload(objectPath, pdfFile, {
            contentType: pdfFile.type || "application/pdf",
            upsert: false,
          });
        if (upErr) throw upErr;
        pdfPath = objectPath;
      }

      const status = mode === "pursuit" ? "in_pursuit" : "active";
      const row = {
        holder_type: holderType,
        holder_user_id: holderType === "employee" ? holderUserId : null,
        license_status: status,
        license_name: name,
        license_type: licenseType,
        license_type_custom:
          licenseType === "other" ? licenseTypeCustom.trim() || null : null,
        license_number: licenseNumber.trim() || null,
        issuing_authority: issuingAuthority.trim() || null,
        jurisdiction_summary: jurisdictionSummary.trim() || null,
        state: state.trim() || null,
        county: county.trim() || null,
        municipality: municipality.trim() || null,
        issue_date: issueDate.trim() || null,
        expiry_date: expiryDate.trim() || null,
        renewal_fee: renewalFee.trim() ? Number(renewalFee) : null,
        notes: notes.trim() || null,
        license_pdf_path: pdfPath,
        requires_ce: requiresCe,
        ce_hours_required: requiresCe && ceHoursRequired.trim()
          ? Number(ceHoursRequired)
          : null,
        ce_hours_completed: 0,
        ce_period_start: cePeriodStart.trim() || null,
        ce_period_end: cePeriodEnd.trim() || null,
        ce_renewal_deadline: ceRenewalDeadline.trim() || null,
        created_by: uid,
        updated_at: new Date().toISOString(),
      };

      const { data: ins, error: insErr } = await sb
        .from("licenses")
        .insert(row)
        .select("id")
        .single();
      if (insErr) throw insErr;
      const licenseId = String(ins?.id ?? "");
      if (!licenseId) throw new Error("No license id returned.");

      if (mode === "pursuit") {
        const reqs = reqItems
          .map((r) => r.text.trim())
          .filter(Boolean)
          .map((text, i) => ({
            license_id: licenseId,
            requirement_text: text,
            sort_order: i,
            is_completed: false,
          }));
        if (reqs.length > 0) {
          const { error: rqErr } = await sb
            .from("license_requirements")
            .insert(reqs);
          if (rqErr) throw rqErr;
        }
      }

      await appendLicenseHistory(
        sb,
        licenseId,
        "created",
        `License created: ${name}`,
        { mode, holder_type: holderType },
        uid,
      );

      showToast({ message: "License saved.", variant: "success" });
      router.push(`/licenses/${licenseId}`);
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell mx-auto max-w-lg flex-1 py-16 text-center">
          <p className="text-white/80">You don&apos;t have access to add licenses.</p>
          <Link href="/licenses" className="mt-4 inline-block text-[#E8C84A] hover:underline">
            Back to licenses
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-3xl flex-1 py-8 md:py-10">
        <Link
          href="/licenses"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Licenses
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">New license</h1>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-8">
          <fieldset className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
              Status
            </legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/90">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "active"}
                  onChange={() => setMode("active")}
                />
                Active license
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "pursuit"}
                  onChange={() => setMode("pursuit")}
                />
                Pursuing new license
              </label>
            </div>
          </fieldset>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                License name *
              </span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={licenseName}
                onChange={(e) => setLicenseName(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                License type
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
              >
                {LICENSE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {licenseType === "other" ? (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  Custom type
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={licenseTypeCustom}
                  onChange={(e) => setLicenseTypeCustom(e.target.value)}
                />
              </label>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  Holder
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={holderType}
                  onChange={(e) =>
                    setHolderType(e.target.value as "company" | "employee")
                  }
                >
                  <option value="company">Company</option>
                  <option value="employee">Employee</option>
                </select>
              </label>
              {holderType === "employee" ? (
                <label className="block sm:col-span-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                    Employee
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                    value={holderUserId}
                    onChange={(e) => setHolderUserId(e.target.value)}
                  >
                    <option value="">— Select user —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {(u.full_name?.trim() || u.email) ?? u.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                License number
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Issuing authority
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Jurisdiction (summary)
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={jurisdictionSummary}
                onChange={(e) => setJurisdictionSummary(e.target.value)}
                placeholder="e.g. Orange County, NY"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                State
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {US_STATE_OPTIONS.map((s) => (
                  <option key={s.value || "blank"} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  County
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  Municipality
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  Issue date
                </span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  Expiry date
                </span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Renewal fee
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={renewalFee}
                onChange={(e) => setRenewalFee(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Notes
              </span>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">
                License PDF
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="mt-1 w-full text-sm text-white/80 file:mr-2 file:rounded-lg file:border-0 file:bg-[#E8C84A] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#0a1628]"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
              <input
                type="checkbox"
                checked={requiresCe}
                onChange={(e) => setRequiresCe(e.target.checked)}
              />
              This license requires continuing education (CE)
            </label>

            {requiresCe ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-3">
                <label className="block">
                  <span className="text-xs text-white/55">Hours required</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                    value={ceHoursRequired}
                    onChange={(e) => setCeHoursRequired(e.target.value)}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-white/55">CE period start</span>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                      value={cePeriodStart}
                      onChange={(e) => setCePeriodStart(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-white/55">CE period end</span>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                      value={cePeriodEnd}
                      onChange={(e) => setCePeriodEnd(e.target.value)}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs text-white/55">CE renewal deadline</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                    value={ceRenewalDeadline}
                    onChange={(e) => setCeRenewalDeadline(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>

          {mode === "pursuit" ? (
            <fieldset className="rounded-xl border border-orange-400/25 bg-orange-500/5 p-4">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-orange-200/90">
                Requirements checklist
              </legend>
              <p className="mt-1 text-xs text-white/50">
                Edit, add, or remove steps before saving. You can change them later on the license detail page.
              </p>
              <button
                type="button"
                className="mt-3 rounded-lg border border-orange-400/40 px-3 py-1.5 text-xs font-semibold text-orange-100 hover:bg-orange-500/15"
                onClick={() => void applyOrangeCounty()}
              >
                Merge Orange County, NY example checklist
              </button>
              <ul className="mt-4 space-y-2">
                {reqItems.map((r) => (
                  <li
                    key={r.key}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#071422]/80 p-2"
                  >
                    <span className="text-white/40" aria-hidden>
                      □
                    </span>
                    <input
                      className="min-w-0 flex-1 rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-sm text-white"
                      value={r.text}
                      onChange={(e) =>
                        updateRequirement(r.key, e.target.value)
                      }
                      placeholder="Requirement"
                    />
                    <button
                      type="button"
                      className="shrink-0 text-xs text-red-300 hover:underline"
                      onClick={() => removeRequirement(r.key)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-[#E8C84A] hover:underline"
                onClick={addRequirement}
              >
                + Add requirement
              </button>
            </fieldset>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#E8C84A] px-5 py-2.5 text-sm font-bold text-[#0a1628] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save license"}
            </button>
            <Link
              href="/licenses"
              className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
