"use client";

import Link from "next/link";
import {
  DashboardProjectSkeletonGrid,
  EmptyState,
  SectionTitle,
} from "@/components/app-polish";
import { DashboardApiUsageCard } from "@/components/dashboard-api-usage-card";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectScansSummary } from "@/lib/project-scans-types";
import { formatPlanScanRelativeDate } from "@/lib/scan-import-from-plans";
import { createBrowserClient } from "@/lib/supabase/client";
import { fetchBlueprintSignedUrl } from "@/lib/fetch-blueprint-signed-url";
import { getPdfjs } from "@/lib/pdfjs-worker";
import { formatUsd } from "@/lib/scan-modes";
import type { JobListRow } from "@/lib/jobs-types";

type SheetPageRow = {
  page_count: number | null;
  file_url?: string | null;
  sheet_order?: number | null;
};

type ProjectRow = {
  id: string;
  project_name: string | null;
  sheet_count: number | null;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
  sheets?: SheetPageRow[] | null;
};

function projectDisplayName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").trim() || fileName;
}

function cardTitle(p: ProjectRow): string {
  const n = p.project_name?.trim();
  if (n) return n;
  return projectDisplayName(p.file_name);
}

function sheetCountLabel(p: ProjectRow): string {
  const fromDb = p.sheet_count ?? p.sheets?.length;
  const c =
    fromDb != null && fromDb > 0
      ? fromDb
      : p.file_url
        ? 1
        : 0;
  return `${c} sheet${c === 1 ? "" : "s"}`;
}

function firstSheetStoragePath(p: ProjectRow): string | null {
  const sh = p.sheets as SheetPageRow[] | null | undefined;
  if (sh?.length) {
    const sorted = [...sh].sort(
      (a, b) => (a.sheet_order ?? 0) - (b.sheet_order ?? 0),
    );
    const u = sorted[0]?.file_url;
    if (u) return u;
  }
  return p.file_url?.trim() ? p.file_url : null;
}

function ProjectBlueprintThumb({ storagePath }: { storagePath: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setPreview(null);
    (async () => {
      try {
        const signedUrl = await fetchBlueprintSignedUrl(storagePath);
        const pdfjs = await getPdfjs();
        const pdf = await pdfjs.getDocument({ url: signedUrl }).promise;
        const page = await pdf.getPage(1);
        const scale = 0.12;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          void pdf.destroy();
          return;
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        void pdf.destroy();
        if (!cancelled) setPreview(dataUrl);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setPreview(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (failed || (!preview && storagePath)) {
    return (
      <div className="dash-muted mb-2 flex h-28 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-[11px]">
        Blueprint
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="mb-2 h-28 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]" />
    );
  }
  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
      <img
        src={preview}
        alt=""
        className="h-28 w-full object-cover object-top"
      />
    </div>
  );
}

function totalPagesLabel(p: ProjectRow): string {
  const rows = p.sheets;
  if (!rows?.length) return "—";
  const known = rows.every(
    (s) => typeof s.page_count === "number" && s.page_count >= 0,
  );
  if (!known) return "—";
  const sum = rows.reduce((acc, s) => acc + (s.page_count ?? 0), 0);
  return sum === 1 ? "1 page" : `${sum} pages`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  const decimals = i >= 2 ? 2 : i === 1 ? 2 : 0;
  return `${parseFloat(val.toFixed(decimals))} ${sizes[i]}`;
}

function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function CheckSaveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );
}

export function DashboardClient() {
  const { showToast } = useAppToast();
  const { canSeeApiCosts, loading: roleLoading } = useUserRole();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthUsage, setMonthUsage] = useState<{
    pages: number;
    cost: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recentJobs, setRecentJobs] = useState<JobListRow[]>([]);
  const [scanSummaries, setScanSummaries] = useState<
    Record<string, ProjectScansSummary>
  >({});
  const savedTimerRef = useRef<number | null>(null);
  const editShellRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();

      await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (process.env.NODE_ENV === "development") {
        console.log("Current user:", user);
      }

      const { data, error: qError } = await supabase
        .from("projects")
        .select(
          "id, project_name, sheet_count, file_name, file_url, file_size, created_at, sheets(file_url, page_count, sheet_order)",
        )
        .order("created_at", { ascending: false });

      if (qError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[dashboard] projects query:", qError.message, qError);
        }
        setError(qError.message);
        setProjects([]);
        return;
      }
      setProjects((data ?? []) as ProjectRow[]);

      try {
        const { data: jData, error: jErr } = await supabase
          .from("jobs")
          .select(
            "id,job_name,job_number,status,job_type,updated_at,customers(company_name,contact_name)",
          )
          .order("updated_at", { ascending: false })
          .limit(5);
        if (jErr) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[dashboard] jobs query:", jErr.message);
          }
          setRecentJobs([]);
        } else {
          setRecentJobs((jData ?? []) as unknown as JobListRow[]);
        }
      } catch (je) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[dashboard] jobs load failed:", je);
        }
        setRecentJobs([]);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load projects. Try again.",
      );
      setProjects([]);
      setRecentJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED"
      ) {
        void load();
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (!canSeeApiCosts || roleLoading) {
      setMonthUsage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/api-usage?scope=month");
        const j = (await r.json()) as {
          pagesAnalyzed?: number;
          totalCost?: number;
          error?: string;
        };
        if (cancelled || !r.ok || j.error) {
          if (!cancelled) setMonthUsage(null);
          return;
        }
        if (
          typeof j.pagesAnalyzed === "number" &&
          typeof j.totalCost === "number"
        ) {
          setMonthUsage({ pages: j.pagesAnalyzed, cost: j.totalCost });
        } else {
          setMonthUsage(null);
        }
      } catch {
        if (!cancelled) setMonthUsage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, canSeeApiCosts, roleLoading]);

  useEffect(() => {
    if (!projects.length) {
      setScanSummaries({});
      return;
    }
    let cancelled = false;
    const ids = projects.map((p) => p.id).join(",");
    void (async () => {
      try {
        const r = await fetch(
          `/api/project-scans/batch?ids=${encodeURIComponent(ids)}`,
        );
        const j = (await r.json()) as {
          summaries?: Record<string, ProjectScansSummary>;
        };
        if (!cancelled) setScanSummaries(j.summaries ?? {});
      } catch {
        if (!cancelled) setScanSummaries({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const startEdit = useCallback((p: ProjectRow) => {
    setEditingId(p.id);
    setEditDraft(cardTitle(p));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  useEffect(() => {
    if (!editingId) return;
    const onPointerDown = (e: PointerEvent) => {
      const shell = editShellRef.current;
      if (!shell) return;
      if (!shell.contains(e.target as Node)) {
        cancelEdit();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editingId, cancelEdit]);

  const saveRename = useCallback(async () => {
    if (!editingId) return;
    const name = editDraft.trim();
    if (!name) return;
    setRenameSaving(true);
    try {
      const res = await fetch("/api/projects/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: editingId, projectName: name }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(json.error ?? "Could not save name.");
        return;
      }
      setProjects((prev) =>
        prev.map((x) =>
          x.id === editingId ? { ...x, project_name: name } : x,
        ),
      );
      setEditingId(null);
      setEditDraft("");
      setSavedProjectId(editingId);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(
        () => setSavedProjectId(null),
        2500,
      );
    } finally {
      setRenameSaving(false);
    }
  }, [editingId, editDraft]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: deleteTarget.id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(json.error ?? "Could not delete project.");
        return;
      }
      setProjects((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast({ message: "Project deleted", variant: "success" });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, showToast]);

  return (
    <div className="dashboard-root flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />

      <main className="app-page-shell mx-auto max-w-5xl flex-1 py-8 md:py-10">
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 shrink-0 sm:max-w-[min(100%,28rem)]">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Project Dashboard
            </h1>
            {monthUsage && monthUsage.pages > 0 ? (
              <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
                This month: {monthUsage.pages} page
                {monthUsage.pages === 1 ? "" : "s"} analyzed —{" "}
                <span className="font-semibold text-[#E8C84A]">
                  {formatUsd(monthUsage.cost)}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Link
              href="/jobs"
              className="btn-secondary shrink-0 rounded-lg px-3 py-2 text-sm"
            >
              Jobs
            </Link>
            <Link
              href="/customers"
              className="btn-secondary shrink-0 rounded-lg px-3 py-2 text-sm"
            >
              Customers
            </Link>
          </div>
        </div>

        {!loading && !error ? (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="app-card rounded-xl border p-3">
              <p className="text-xs text-[var(--foreground-muted)]">Projects</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--foreground)]">
                {projects.length}
              </p>
            </div>
            <Link
              href="/jobs"
              className="app-card block rounded-xl border p-3 transition-colors hover:border-[#E8C84A]/35"
            >
              <p className="text-xs text-[var(--foreground-muted)]">Jobs</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
                Open job board
              </p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                Leads, quotes, field work.
              </p>
            </Link>
            <div className="app-card rounded-xl border p-3">
              <p className="text-xs text-[var(--foreground-muted)]">
                This month (API)
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[#E8C84A]">
                {monthUsage && monthUsage.pages > 0
                  ? formatUsd(monthUsage.cost)
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                {monthUsage && monthUsage.pages > 0
                  ? `${monthUsage.pages} page${monthUsage.pages === 1 ? "" : "s"}`
                  : "No usage yet"}
              </p>
            </div>
          </section>
        ) : null}

        <section className="app-card app-card-pad-lg">
          <SectionTitle className="mb-4">Quick actions</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/tools" className="btn-secondary btn-h-11 w-full">
              Tools hub
            </Link>
            <Link
              href="/tools/load-calculator"
              className="btn-secondary btn-h-11 w-full"
            >
              Load calculator
            </Link>
            <Link href="/tools/nec-checker" className="btn-secondary btn-h-11 w-full">
              NEC checker
            </Link>
            <Link
              href="/tools/electrical-reference"
              className="btn-secondary btn-h-11 w-full"
            >
              Electrical reference
            </Link>
            <Link
              href="/tools/motor-hvac-calculator"
              className="btn-secondary btn-h-11 w-full"
            >
              Motor / HVAC
            </Link>
            <Link href="/tools/wifi-analyzer" className="btn-secondary btn-h-11 w-full">
              Wi‑Fi analyzer
            </Link>
            <Link href="/tools/av-analyzer" className="btn-secondary btn-h-11 w-full">
              AV analyzer
            </Link>
            <Link
              href="/tools/smarthome-analyzer"
              className="btn-secondary btn-h-11 w-full"
            >
              Smart home
            </Link>
            <Link
              href="/tools/electrical-analyzer"
              className="btn-secondary btn-h-11 w-full"
            >
              Electrical analyzer
            </Link>
            <Link
              href="/tools/project-describer"
              className="btn-secondary btn-h-11 w-full"
            >
              AI describer
            </Link>
            <Link
              href="/upload"
              className="btn-primary btn-h-11 col-span-1 w-full sm:col-span-2 lg:col-span-3"
            >
              Upload new blueprint
            </Link>
          </div>
        </section>

        <div className="w-full min-w-0">
          <DashboardApiUsageCard />
        </div>

        {loading ? (
          <div className="mt-4" role="status" aria-live="polite" aria-busy="true">
            <p className="app-muted mb-4 text-sm">Loading projects…</p>
            <DashboardProjectSkeletonGrid />
          </div>
        ) : null}

        {!loading && error && (
          <div
            className="mt-8 rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {error}
          </div>
        )}

        {!loading && !error && recentJobs.length > 0 && (
          <section className="app-card app-card-pad-lg">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#E8C84A]/45 pb-2">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Recent activity
              </h2>
              <Link
                href="/jobs"
                className="text-sm font-medium text-[#E8C84A] hover:underline"
              >
                View all →
              </Link>
            </div>
            <ul className="space-y-2">
              {recentJobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="app-card flex flex-wrap items-baseline justify-between gap-2 !p-3 text-sm hover:border-[#E8C84A]/35"
                  >
                    <span className="text-base font-semibold text-[var(--foreground)]">
                      {j.job_number} · {j.job_name}
                    </span>
                    <span className="app-muted">
                      {j.status} · {j.job_type}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && !error && projects.length === 0 && (
          <EmptyState
            icon={<span aria-hidden>📐</span>}
            title="No projects yet — upload your first blueprint"
            description="Upload a blueprint PDF to create your first project."
            actionLabel="Go to upload"
            actionHref="/upload"
          />
        )}

        {!loading && !error && projects.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const thumbPath = firstSheetStoragePath(p);
              return (
              <li key={p.id}>
                <article
                  ref={(node) => {
                    if (p.id === editingId) {
                      editShellRef.current = node;
                    } else if (node && editShellRef.current === node) {
                      editShellRef.current = null;
                    }
                  }}
                  className="app-card flex h-full flex-col rounded-xl border p-3 transition-colors hover:border-[#E8C84A]/25"
                >
                  {thumbPath ? (
                    <ProjectBlueprintThumb storagePath={thumbPath} />
                  ) : null}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {editingId === p.id ? (
                        <div className="flex min-w-0 items-center gap-2">
                          <input
                            type="text"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            disabled={renameSaving}
                            autoFocus
                            className="min-w-0 flex-1 rounded-lg border border-sky-500/50 bg-[var(--surface-elevated)] px-2 py-1 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-sky-400/50"
                            aria-label="Project name"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveRename();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void saveRename()}
                            disabled={renameSaving || !editDraft.trim()}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/45 bg-emerald-600/90 text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
                            aria-label="Save project name"
                            title="Save"
                          >
                            {renameSaving ? (
                              <span
                                className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                                aria-hidden
                              />
                            ) : (
                              <CheckSaveIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--foreground)]">
                          {cardTitle(p)}
                        </h2>
                      )}
                      {savedProjectId === p.id ? (
                        <p className="mt-1 text-xs font-medium text-emerald-300/95">
                          Saved
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {editingId !== p.id ? (
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 text-[var(--foreground)] transition-colors hover:border-[#E8C84A]/35"
                          aria-label="Edit project name"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        disabled={deleting}
                        className="rounded-md border border-red-500/35 bg-red-950/30 p-1.5 text-red-200 transition-colors hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Delete project"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                      <span className="ml-0.5 shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/35">
                        Uploaded
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-[var(--foreground-muted)]">
                    {sheetCountLabel(p)} · {totalPagesLabel(p)} ·{" "}
                    {formatUploadDate(p.created_at)} · {formatFileSize(p.file_size)}
                  </p>
                  {scanSummaries[p.id] ? (
                    <div className="mt-2.5 space-y-1.5 border-t border-[var(--border)] pt-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <Link
                          href={`/project/${p.id}?scanFocus=room`}
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset transition-colors",
                            scanSummaries[p.id]!.hasRoomScan
                              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40 hover:bg-emerald-500/25"
                              : "bg-[var(--surface-elevated)] text-[var(--foreground)]/50 ring-[var(--border)]",
                          ].join(" ")}
                          title={
                            scanSummaries[p.id]!.hasRoomScan
                              ? "Open room scan"
                              : "No room scan yet"
                          }
                        >
                          📋 Room Scan
                        </Link>
                        <Link
                          href={`/project/${p.id}?scanFocus=electrical`}
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset transition-colors",
                            scanSummaries[p.id]!.hasElectricalScan
                              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40 hover:bg-emerald-500/25"
                              : "bg-[var(--surface-elevated)] text-[var(--foreground)]/50 ring-[var(--border)]",
                          ].join(" ")}
                          title={
                            scanSummaries[p.id]!.hasElectricalScan
                              ? "Open electrical scans"
                              : "No electrical scan yet"
                          }
                        >
                          ⚡ Electrical Scan
                        </Link>
                      </div>
                      <p className="line-clamp-1 text-[11px] text-[var(--foreground-muted)]">
                        Last scan:{" "}
                        {formatPlanScanRelativeDate(
                          scanSummaries[p.id]!.lastScanned,
                        )}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-1 flex-col justify-end">
                    <Link
                      href={`/project/${p.id}`}
                      className="dash-open-project-btn !py-2 !text-xs"
                    >
                      Open Project
                    </Link>
                  </div>
                </article>
              </li>
            );
            })}
          </ul>
        )}

        {deleteTarget ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-6 shadow-xl">
              <h2
                id="delete-project-title"
                className="text-lg font-semibold text-[var(--foreground)]"
              >
                Delete project?
              </h2>
              <p className="dash-muted mt-3 text-sm leading-relaxed">
                Are you sure you want to delete this project? This will
                permanently delete all sheets, analysis results, and detected
                rooms. This cannot be undone.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void confirmDelete()}
                  className="btn-danger-outline inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                        aria-hidden
                      />
                      Deleting…
                    </>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
