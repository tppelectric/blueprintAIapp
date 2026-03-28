"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast, type ShowToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { appendLicenseHistory } from "@/lib/license-history-log";
import {
  mapCeCourseRow,
  mapLicenseHistoryRow,
  mapLicenseRequirementRow,
  mapLicenseRow,
  mapLicenseStudyMaterialRow,
} from "@/lib/license-mappers";
import type {
  CeCourseRow,
  LicenseHistoryRow,
  LicenseRequirementRow,
  LicenseRow,
  LicenseStudyMaterialRow,
  LicenseStudyMaterialType,
} from "@/lib/license-types";
import { syncCeHoursCompleted } from "@/lib/license-ce-sync";
import {
  daysUntilDateUtc,
  daysUntilExpiryUtc,
  expiryColorTier,
  expiryTierClasses,
  licenseTypeLabel,
} from "@/lib/license-utils";
import { LICENSE_TYPE_OPTIONS } from "@/lib/license-types";
import { US_STATE_OPTIONS } from "@/lib/us-states";
import { createBrowserClient } from "@/lib/supabase/client";
import { canManageLicenses } from "@/lib/user-roles";

type Tab = "details" | "ce" | "requirements" | "materials" | "history";

const MAT_TYPES: { value: LicenseStudyMaterialType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "video", label: "Video" },
  { value: "link", label: "Link" },
  { value: "note", label: "Note" },
  { value: "book", label: "Book" },
  { value: "practice_test", label: "Practice test" },
];

function tabBtn(active: boolean, onClick: () => void, children: ReactNode) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
        active
          ? "bg-[#E8C84A]/20 text-[#E8C84A] ring-1 ring-[#E8C84A]/40"
          : "text-white/65 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function LicensesDetailClient({ licenseId }: { licenseId: string }) {
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isAdmin = canManageLicenses(role);

  const [tab, setTab] = useState<Tab>("details");
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState<LicenseRow | null>(null);
  const [courses, setCourses] = useState<CeCourseRow[]>([]);
  const [requirements, setRequirements] = useState<LicenseRequirementRow[]>(
    [],
  );
  const [materials, setMaterials] = useState<LicenseStudyMaterialRow[]>([]);
  const [history, setHistory] = useState<LicenseHistoryRow[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [ceOpen, setCeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [matOpen, setMatOpen] = useState(false);
  const [newReqText, setNewReqText] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data: lic, error: e1 } = await sb
        .from("licenses")
        .select("*")
        .eq("id", licenseId)
        .maybeSingle();
      if (e1) throw e1;
      if (!lic) {
        setLicense(null);
        return;
      }
      const L = mapLicenseRow(lic as Record<string, unknown>);
      setLicense(L);

      const [cRes, rRes, mRes, hRes] = await Promise.all([
        sb
          .from("ce_courses")
          .select("*")
          .eq("license_id", licenseId)
          .order("course_date", { ascending: false }),
        sb
          .from("license_requirements")
          .select("*")
          .eq("license_id", licenseId)
          .order("sort_order"),
        sb
          .from("license_study_materials")
          .select("*")
          .eq("license_id", licenseId)
          .order("created_at", { ascending: false }),
        sb
          .from("license_history")
          .select("*")
          .eq("license_id", licenseId)
          .order("created_at", { ascending: false }),
      ]);

      setCourses(
        (cRes.data ?? []).map((r) => mapCeCourseRow(r as Record<string, unknown>)),
      );
      setRequirements(
        (rRes.data ?? []).map((r) =>
          mapLicenseRequirementRow(r as Record<string, unknown>),
        ),
      );
      setMaterials(
        (mRes.data ?? []).map((r) =>
          mapLicenseStudyMaterialRow(r as Record<string, unknown>),
        ),
      );
      setHistory(
        (hRes.data ?? []).map((r) =>
          mapLicenseHistoryRow(r as Record<string, unknown>),
        ),
      );

      if (L.license_pdf_path?.trim()) {
        const { data: signed } = await sb.storage
          .from("license-files")
          .createSignedUrl(L.license_pdf_path.trim(), 3600);
        setPdfUrl(signed?.signedUrl ?? null);
      } else {
        setPdfUrl(null);
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load license.",
        variant: "error",
      });
      setLicense(null);
    } finally {
      setLoading(false);
    }
  }, [licenseId, showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const daysLeft = license ? daysUntilExpiryUtc(license.expiry_date) : null;
  const tier = license
    ? expiryColorTier(license.expiry_date, license.license_status)
    : "none";

  const ceReq = Number(license?.ce_hours_required ?? 0);
  const ceDone = Number(license?.ce_hours_completed ?? 0);
  const ceRemain = Math.max(0, ceReq - ceDone);
  const cePct =
    license?.requires_ce && ceReq > 0
      ? Math.min(100, Math.round((ceDone / ceReq) * 100))
      : 0;
  const renewDays = license
    ? daysUntilDateUtc(
        license.ce_renewal_deadline ?? license.ce_period_end ?? null,
      )
    : null;

  const reqDone = requirements.filter((r) => r.is_completed).length;

  const openSigned = async (path: string) => {
    const sb = createBrowserClient();
    const { data, error } = await sb.storage
      .from("license-files")
      .createSignedUrl(path.trim(), 3600);
    if (error || !data?.signedUrl) {
      showToast({ message: "Could not open file.", variant: "error" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const toggleRequirement = async (r: LicenseRequirementRow) => {
    if (!isAdmin) return;
    const sb = createBrowserClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const next = !r.is_completed;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await sb
      .from("license_requirements")
      .update({
        is_completed: next,
        completed_at: next ? today : null,
      })
      .eq("id", r.id);
    if (error) {
      showToast({ message: error.message, variant: "error" });
      return;
    }
    await appendLicenseHistory(
      sb,
      licenseId,
      "requirement",
      next ? `Completed: ${r.requirement_text.slice(0, 80)}` : `Reopened: ${r.requirement_text.slice(0, 80)}`,
      { requirement_id: r.id, is_completed: next },
      user?.id ?? null,
    );
    void loadAll();
  };

  const addRequirement = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newReqText.trim()) return;
    const sb = createBrowserClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const maxSort =
      requirements.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
    const { error } = await sb.from("license_requirements").insert({
      license_id: licenseId,
      requirement_text: newReqText.trim(),
      sort_order: maxSort,
      is_completed: false,
    });
    if (error) {
      showToast({ message: error.message, variant: "error" });
      return;
    }
    await appendLicenseHistory(
      sb,
      licenseId,
      "requirement",
      `Added requirement: ${newReqText.trim().slice(0, 80)}`,
      {},
      user?.id ?? null,
    );
    setNewReqText("");
    void loadAll();
  };

  const deleteRequirement = async (id: string, text: string) => {
    if (!isAdmin || !window.confirm("Remove this requirement?")) return;
    const sb = createBrowserClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const { error } = await sb.from("license_requirements").delete().eq("id", id);
    if (error) {
      showToast({ message: error.message, variant: "error" });
      return;
    }
    await appendLicenseHistory(
      sb,
      licenseId,
      "requirement",
      `Removed requirement: ${text.slice(0, 80)}`,
      { requirement_id: id },
      user?.id ?? null,
    );
    void loadAll();
  };

  const visibleTabs = useMemo(() => {
    const base: Tab[] = ["details", "requirements", "materials", "history"];
    if (license?.requires_ce) base.splice(1, 0, "ce");
    return base;
  }, [license?.requires_ce]);

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab("details");
  }, [visibleTabs, tab]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center text-white/60">
          Loading…
        </main>
      </div>
    );
  }

  if (!license) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center">
          <p className="text-white/70">License not found.</p>
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
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-5xl flex-1 py-8 md:py-10">
        <Link href="/licenses" className="text-sm text-[#E8C84A] hover:underline">
          ← Licenses
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {license.license_name}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              {licenseTypeLabel(license.license_type, license.license_type_custom)}{" "}
              · {license.license_number?.trim() || "No number"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-4 py-1.5 text-sm font-bold ring-2 ${expiryTierClasses(tier === "none" && license.license_status === "in_pursuit" ? "none" : tier)}`}
            >
              {license.license_status === "in_pursuit"
                ? "In pursuit"
                : license.license_status.charAt(0).toUpperCase() +
                  license.license_status.slice(1)}
            </span>
            {isAdmin ? (
              <button
                type="button"
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {visibleTabs.includes("details")
            ? tabBtn(tab === "details", () => setTab("details"), "Details")
            : null}
          {visibleTabs.includes("ce")
            ? tabBtn(tab === "ce", () => setTab("ce"), "CE tracking")
            : null}
          {visibleTabs.includes("requirements")
            ? tabBtn(
                tab === "requirements",
                () => setTab("requirements"),
                "Requirements",
              )
            : null}
          {visibleTabs.includes("materials")
            ? tabBtn(
                tab === "materials",
                () => setTab("materials"),
                "Study materials",
              )
            : null}
          {visibleTabs.includes("history")
            ? tabBtn(tab === "history", () => setTab("history"), "History")
            : null}
        </div>

        {tab === "details" ? (
          <DetailsTab
            license={license}
            daysLeft={daysLeft}
            tier={tier}
            pdfUrl={pdfUrl}
            onOpenPdf={() => {
              if (pdfUrl) window.open(pdfUrl, "_blank", "noopener,noreferrer");
            }}
          />
        ) : null}

        {tab === "ce" && license.requires_ce ? (
          <CeTab
            license={license}
            courses={courses}
            cePct={cePct}
            ceReq={ceReq}
            ceDone={ceDone}
            ceRemain={ceRemain}
            renewDays={renewDays}
            isAdmin={isAdmin}
            onAdd={() => setCeOpen(true)}
            onOpenFile={openSigned}
          />
        ) : null}

        {tab === "requirements" ? (
          <RequirementsTab
            requirements={requirements}
            reqDone={reqDone}
            isAdmin={isAdmin}
            newReqText={newReqText}
            setNewReqText={setNewReqText}
            onToggle={toggleRequirement}
            onAdd={addRequirement}
            onDelete={deleteRequirement}
          />
        ) : null}

        {tab === "materials" ? (
          <MaterialsTab
            materials={materials}
            isAdmin={isAdmin}
            onAdd={() => setMatOpen(true)}
            onOpenFile={openSigned}
          />
        ) : null}

        {tab === "history" ? <HistoryTab rows={history} /> : null}
      </main>

      {ceOpen ? (
        <CeCourseModal
          licenseId={licenseId}
          onClose={() => setCeOpen(false)}
          onSaved={() => {
            setCeOpen(false);
            void loadAll();
          }}
          showToast={showToast}
        />
      ) : null}

      {editOpen ? (
        <EditLicenseModal
          license={license}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void loadAll();
          }}
          showToast={showToast}
        />
      ) : null}

      {matOpen ? (
        <StudyMaterialModal
          licenseId={licenseId}
          onClose={() => setMatOpen(false)}
          onSaved={() => {
            setMatOpen(false);
            void loadAll();
          }}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}

function DetailsTab({
  license,
  daysLeft,
  tier,
  pdfUrl,
  onOpenPdf,
}: {
  license: LicenseRow;
  daysLeft: number | null;
  tier: ReturnType<typeof expiryColorTier>;
  pdfUrl: string | null;
  onOpenPdf: () => void;
}) {
  return (
    <div className="mt-6 space-y-6">
      {license.license_status !== "in_pursuit" ? (
        <div
          className={`rounded-xl p-4 ring-1 ${expiryTierClasses(tier === "none" ? "green" : tier)}`}
        >
          <p className="text-sm font-semibold">Days until expiry</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {daysLeft == null
              ? "—"
              : daysLeft < 0
                ? `Expired (${Math.abs(daysLeft)}d ago)`
                : daysLeft}
          </p>
        </div>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailItem label="Issuing authority" value={license.issuing_authority} />
        <DetailItem label="Jurisdiction" value={license.jurisdiction_summary} />
        <DetailItem
          label="State / County / Municipality"
          value={[license.state, license.county, license.municipality]
            .filter(Boolean)
            .join(" · ") || null}
        />
        <DetailItem label="Issue date" value={license.issue_date} />
        <DetailItem label="Expiry date" value={license.expiry_date} />
        <DetailItem
          label="Renewal fee"
          value={
            license.renewal_fee != null
              ? `$${Number(license.renewal_fee).toFixed(2)}`
              : null
          }
        />
        <DetailItem label="Holder" value={license.holder_type} />
        <DetailItem label="Notes" value={license.notes} className="sm:col-span-2" />
      </dl>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-white/45">
          License PDF
        </p>
        {pdfUrl ? (
          <div className="mt-2 space-y-2">
            <button
              type="button"
              onClick={onOpenPdf}
              className="text-sm font-medium text-[#E8C84A] hover:underline"
            >
              Download / open in new tab
            </button>
            <iframe
              title="License PDF"
              src={pdfUrl}
              className="mt-2 h-[min(70vh,520px)] w-full rounded-lg border border-white/15 bg-black/20"
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/45">No PDF uploaded.</p>
        )}
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-white/40">
        {label}
      </dt>
      <dd className="mt-0.5 text-white/90">{value?.trim() || "—"}</dd>
    </div>
  );
}

function CeTab({
  license,
  courses,
  cePct,
  ceReq,
  ceDone,
  ceRemain,
  renewDays,
  isAdmin,
  onAdd,
  onOpenFile,
}: {
  license: LicenseRow;
  courses: CeCourseRow[];
  cePct: number;
  ceReq: number;
  ceDone: number;
  ceRemain: number;
  renewDays: number | null;
  isAdmin: boolean;
  onAdd: () => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="mb-2 flex justify-between text-sm text-white/70">
          <span>Progress</span>
          <span className="tabular-nums">
            {ceDone} of {ceReq || "—"} hours complete
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#E8C84A]/85"
            style={{ width: `${cePct}%` }}
          />
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <DetailItem
          label="Renewal period"
          value={
            license.ce_period_start && license.ce_period_end
              ? `${license.ce_period_start} → ${license.ce_period_end}`
              : null
          }
        />
        <DetailItem
          label="Hours required"
          value={ceReq > 0 ? String(ceReq) : null}
        />
        <DetailItem label="Hours completed" value={String(ceDone)} />
        <DetailItem label="Hours remaining" value={String(ceRemain)} />
        <DetailItem
          label="Days until renewal deadline"
          value={
            renewDays == null
              ? null
              : renewDays < 0
                ? `Overdue (${Math.abs(renewDays)}d)`
                : String(renewDays)
          }
        />
      </dl>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Completed courses</h3>
        {isAdmin ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-[#E8C84A] px-3 py-1.5 text-xs font-bold text-[#0a1628]"
          >
            Add course
          </button>
        ) : null}
      </div>

      {courses.length === 0 ? (
        <p className="text-sm text-white/45">No courses recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-left text-xs text-white/85">
            <thead className="border-b border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-white/5">
                  <td className="px-3 py-2 font-medium">{c.course_name}</td>
                  <td className="px-3 py-2">{c.provider ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{c.course_date}</td>
                  <td className="px-3 py-2 tabular-nums">{c.hours_earned}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {c.cost != null ? `$${Number(c.cost).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.certificate_path?.trim() ? (
                      <button
                        type="button"
                        className="text-[#E8C84A] hover:underline"
                        onClick={() => onOpenFile(c.certificate_path!)}
                      >
                        View
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequirementsTab({
  requirements,
  reqDone,
  isAdmin,
  newReqText,
  setNewReqText,
  onToggle,
  onAdd,
  onDelete,
}: {
  requirements: LicenseRequirementRow[];
  reqDone: number;
  isAdmin: boolean;
  newReqText: string;
  setNewReqText: (s: string) => void;
  onToggle: (r: LicenseRequirementRow) => void;
  onAdd: (e: FormEvent) => void;
  onDelete: (id: string, text: string) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-white/70">
        Progress:{" "}
        <span className="font-semibold text-[#E8C84A]">
          {reqDone} of {requirements.length}
        </span>{" "}
        complete
      </p>
      <ul className="space-y-2">
        {requirements.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
          >
            <label className="flex cursor-pointer items-start gap-2 text-sm text-white/90">
              <input
                type="checkbox"
                className="mt-1"
                checked={r.is_completed}
                disabled={!isAdmin}
                onChange={() => void onToggle(r)}
              />
              <span>
                <span className={r.is_completed ? "line-through opacity-60" : ""}>
                  {r.requirement_text}
                </span>
                {r.completed_at ? (
                  <span className="mt-0.5 block text-xs text-white/45">
                    Done {r.completed_at}
                  </span>
                ) : null}
                {r.notes?.trim() ? (
                  <span className="mt-0.5 block text-xs text-white/50">
                    {r.notes}
                  </span>
                ) : null}
              </span>
            </label>
            {isAdmin ? (
              <button
                type="button"
                className="ml-auto text-xs text-red-300 hover:underline"
                onClick={() => void onDelete(r.id, r.requirement_text)}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {isAdmin ? (
        <form onSubmit={onAdd} className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
            placeholder="New requirement"
            value={newReqText}
            onChange={(e) => setNewReqText(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg border border-[#E8C84A]/50 px-4 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
          >
            Add requirement
          </button>
        </form>
      ) : null}
    </div>
  );
}

function MaterialsTab({
  materials,
  isAdmin,
  onAdd,
  onOpenFile,
}: {
  materials: LicenseStudyMaterialRow[];
  isAdmin: boolean;
  onAdd: () => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end">
        {isAdmin ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-[#E8C84A] px-3 py-1.5 text-xs font-bold text-[#0a1628]"
          >
            Add material
          </button>
        ) : null}
      </div>
      {materials.length === 0 ? (
        <p className="text-sm text-white/45">No study materials yet.</p>
      ) : (
        <ul className="space-y-3">
          {materials.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/80">
                {m.material_type.replace("_", " ")}
              </p>
              <p className="mt-1 font-semibold text-white">{m.title}</p>
              {m.description?.trim() ? (
                <p className="mt-1 text-sm text-white/55">{m.description}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {m.url?.trim() ? (
                  <a
                    href={m.url.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-sky-300 hover:underline"
                  >
                    Open link
                  </a>
                ) : null}
                {m.file_path?.trim() ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-[#E8C84A] hover:underline"
                    onClick={() => onOpenFile(m.file_path!)}
                  >
                    Download / view
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({ rows }: { rows: LicenseHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 text-sm text-white/45">No history entries yet.</p>
    );
  }
  return (
    <ul className="mt-6 space-y-3">
      {rows.map((h) => (
        <li
          key={h.id}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        >
          <p className="text-xs text-white/45">
            {new Date(h.created_at).toLocaleString()} · {h.event_type}
          </p>
          <p className="mt-0.5 text-white/90">{h.summary}</p>
        </li>
      ))}
    </ul>
  );
}

function CeCourseModal({
  licenseId,
  onClose,
  onSaved,
  showToast,
}: {
  licenseId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: ShowToast;
}) {
  const [courseName, setCourseName] = useState("");
  const [provider, setProvider] = useState("");
  const [courseDate, setCourseDate] = useState("");
  const [hours, setHours] = useState("");
  const [cost, setCost] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = courseName.trim();
    if (!n || !courseDate.trim()) {
      showToast({ message: "Course name and date are required.", variant: "error" });
      return;
    }
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0) {
      showToast({ message: "Enter valid hours earned.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      let certPath: string | null = null;
      if (certFile && certFile.size > 0) {
        const safe = certFile.name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
        const objectPath = `ce-certificates/${licenseId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await sb.storage
          .from("license-files")
          .upload(objectPath, certFile, {
            contentType: certFile.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw upErr;
        certPath = objectPath;
      }
      const { error: insErr } = await sb.from("ce_courses").insert({
        license_id: licenseId,
        course_name: n,
        provider: provider.trim() || null,
        course_date: courseDate.trim().slice(0, 10),
        hours_earned: h,
        cost: cost.trim() ? Number(cost) : null,
        certificate_path: certPath,
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      const sync = await syncCeHoursCompleted(sb, licenseId);
      if (!sync.ok) throw new Error(sync.error);
      await appendLicenseHistory(
        sb,
        licenseId,
        "ce_course",
        `Added CE course: ${n} (${h}h)`,
        { hours_earned: h },
        user?.id ?? null,
      );
      showToast({ message: "Course saved; hours updated.", variant: "success" });
      onSaved();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#0a1628] p-5 shadow-xl"
        role="dialog"
        aria-labelledby="ce-modal-title"
      >
        <h2 id="ce-modal-title" className="text-lg font-semibold text-white">
          Add CE course
        </h2>
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <label className="block text-xs text-white/55">
            Course name *
            <input
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Provider
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Date *
            <input
              type="date"
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={courseDate}
              onChange={(e) => setCourseDate(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Hours earned *
            <input
              type="number"
              step="0.25"
              min="0"
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Cost
            <input
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Certificate file
            <input
              type="file"
              className="mt-1 w-full text-xs text-white/70"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditLicenseModal({
  license,
  onClose,
  onSaved,
  showToast,
}: {
  license: LicenseRow;
  onClose: () => void;
  onSaved: () => void;
  showToast: ShowToast;
}) {
  const [licenseName, setLicenseName] = useState(license.license_name);
  const [licenseStatus, setLicenseStatus] = useState(license.license_status);
  const [licenseNumber, setLicenseNumber] = useState(
    license.license_number ?? "",
  );
  const [expiryDate, setExpiryDate] = useState(license.expiry_date ?? "");
  const [notes, setNotes] = useState(license.notes ?? "");
  const [requiresCe, setRequiresCe] = useState(license.requires_ce);
  const [ceHoursRequired, setCeHoursRequired] = useState(
    license.ce_hours_required != null ? String(license.ce_hours_required) : "",
  );
  const [cePeriodStart, setCePeriodStart] = useState(
    license.ce_period_start ?? "",
  );
  const [cePeriodEnd, setCePeriodEnd] = useState(license.ce_period_end ?? "");
  const [ceRenewalDeadline, setCeRenewalDeadline] = useState(
    license.ce_renewal_deadline ?? "",
  );
  const [licenseType, setLicenseType] = useState(license.license_type);
  const [licenseTypeCustom, setLicenseTypeCustom] = useState(
    license.license_type_custom ?? "",
  );
  const [issuingAuthority, setIssuingAuthority] = useState(
    license.issuing_authority ?? "",
  );
  const [state, setState] = useState(license.state ?? "");
  const [county, setCounty] = useState(license.county ?? "");
  const [municipality, setMunicipality] = useState(license.municipality ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = licenseName.trim();
    if (!name) {
      showToast({ message: "Name required.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const { error } = await sb
        .from("licenses")
        .update({
          license_name: name,
          license_status: licenseStatus,
          license_number: licenseNumber.trim() || null,
          expiry_date: expiryDate.trim() || null,
          notes: notes.trim() || null,
          requires_ce: requiresCe,
          ce_hours_required:
            requiresCe && ceHoursRequired.trim()
              ? Number(ceHoursRequired)
              : null,
          ce_period_start: cePeriodStart.trim() || null,
          ce_period_end: cePeriodEnd.trim() || null,
          ce_renewal_deadline: ceRenewalDeadline.trim() || null,
          license_type: licenseType,
          license_type_custom:
            licenseType === "other" ? licenseTypeCustom.trim() || null : null,
          issuing_authority: issuingAuthority.trim() || null,
          state: state.trim() || null,
          county: county.trim() || null,
          municipality: municipality.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", license.id);
      if (error) throw error;
      await appendLicenseHistory(
        sb,
        license.id,
        "update",
        "License details updated",
        {},
        user?.id ?? null,
      );
      showToast({ message: "Saved.", variant: "success" });
      onSaved();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/15 bg-[#0a1628] p-5 shadow-xl"
        role="dialog"
        aria-labelledby="edit-lic-title"
      >
        <h2 id="edit-lic-title" className="text-lg font-semibold text-white">
          Edit license
        </h2>
        <form onSubmit={(e) => void submit(e)} className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <label className="block text-xs text-white/55">
            Name *
            <input
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={licenseName}
              onChange={(e) => setLicenseName(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Status
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={licenseStatus}
              onChange={(e) =>
                setLicenseStatus(e.target.value as LicenseRow["license_status"])
              }
            >
              <option value="active">Active</option>
              <option value="in_pursuit">In pursuit</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="block text-xs text-white/55">
            Type
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
            <label className="block text-xs text-white/55">
              Custom type
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                value={licenseTypeCustom}
                onChange={(e) => setLicenseTypeCustom(e.target.value)}
              />
            </label>
          ) : null}
          <label className="block text-xs text-white/55">
            License number
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Issuing authority
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={issuingAuthority}
              onChange={(e) => setIssuingAuthority(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            State
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              {US_STATE_OPTIONS.map((s) => (
                <option key={s.value || "x"} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/55">
            County
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Municipality
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Expiry date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Notes
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-white/85">
            <input
              type="checkbox"
              checked={requiresCe}
              onChange={(e) => setRequiresCe(e.target.checked)}
            />
            Requires CE
          </label>
          {requiresCe ? (
            <>
              <label className="block text-xs text-white/55">
                Hours required
                <input
                  type="number"
                  step="0.25"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={ceHoursRequired}
                  onChange={(e) => setCeHoursRequired(e.target.value)}
                />
              </label>
              <label className="block text-xs text-white/55">
                CE period start
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={cePeriodStart}
                  onChange={(e) => setCePeriodStart(e.target.value)}
                />
              </label>
              <label className="block text-xs text-white/55">
                CE period end
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={cePeriodEnd}
                  onChange={(e) => setCePeriodEnd(e.target.value)}
                />
              </label>
              <label className="block text-xs text-white/55">
                CE renewal deadline
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                  value={ceRenewalDeadline}
                  onChange={(e) => setCeRenewalDeadline(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudyMaterialModal({
  licenseId,
  onClose,
  onSaved,
  showToast,
}: {
  licenseId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: ShowToast;
}) {
  const [materialType, setMaterialType] =
    useState<LicenseStudyMaterialType>("link");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      showToast({ message: "Title required.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      let filePath: string | null = null;
      if (file && file.size > 0) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
        const objectPath = `study-materials/${licenseId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await sb.storage
          .from("license-files")
          .upload(objectPath, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw upErr;
        filePath = objectPath;
      }
      const { error } = await sb.from("license_study_materials").insert({
        license_id: licenseId,
        material_type: materialType,
        title: t,
        description: description.trim() || null,
        url: url.trim() || null,
        file_path: filePath,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await appendLicenseHistory(
        sb,
        licenseId,
        "study_material",
        `Added study material: ${t}`,
        { material_type: materialType },
        user?.id ?? null,
      );
      showToast({ message: "Material added.", variant: "success" });
      onSaved();
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#0a1628] p-5 shadow-xl"
        role="dialog"
      >
        <h2 className="text-lg font-semibold text-white">Add study material</h2>
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <label className="block text-xs text-white/55">
            Type
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={materialType}
              onChange={(e) =>
                setMaterialType(e.target.value as LicenseStudyMaterialType)
              }
            >
              {MAT_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/55">
            Title *
            <input
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            Description
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/55">
            URL
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="block text-xs text-white/55">
            File (optional)
            <input
              type="file"
              className="mt-1 w-full text-xs text-white/70"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
