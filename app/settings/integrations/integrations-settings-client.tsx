"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  SYNC_INTERVALS,
  type JobtreadSettingsPublic,
  type SyncInterval,
} from "@/lib/jobtread-settings";
import { canManageIntegrations } from "@/lib/user-roles";

type JobtreadSyncLogEntry = {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_synced: number;
  error_message: string | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusColor(status: string): string {
  if (status === "ok") return "text-emerald-300";
  if (status === "error") return "text-red-300";
  return "text-white/60";
}

function syncTypeLabel(t: string): string {
  const map: Record<string, string> = {
    customers: "Customers",
    jobs: "Jobs",
    daily_logs: "Daily logs",
  };
  return map[t] ?? t.replace(/_/g, " ");
}

function syncStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success") {
    return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/40";
  }
  if (s === "error" || s === "failed") {
    return "bg-red-500/15 text-red-200 ring-1 ring-red-500/40";
  }
  return "bg-white/[0.08] text-white/65 ring-1 ring-white/15";
}

function formatShortWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function applyJobtreadPublicToDrafts(
  s: JobtreadSettingsPublic,
  setters: {
    setSettings: (v: JobtreadSettingsPublic) => void;
    setCompanyIdDraft: (v: string) => void;
    setAutoSync: (v: boolean) => void;
    setSyncInterval: (v: SyncInterval) => void;
    setImportCustomers: (v: boolean) => void;
    setImportJobs: (v: boolean) => void;
    setExportDailyLogs: (v: boolean) => void;
    setExportPhotos: (v: boolean) => void;
    setExportTimeEntries: (v: boolean) => void;
  },
) {
  setters.setSettings(s);
  setters.setCompanyIdDraft(s.companyId);
  setters.setAutoSync(s.autoSyncEnabled);
  setters.setSyncInterval(s.syncInterval);
  setters.setImportCustomers(s.importCustomers);
  setters.setImportJobs(s.importJobs);
  setters.setExportDailyLogs(s.exportDailyLogs);
  setters.setExportPhotos(s.exportPhotos);
  setters.setExportTimeEntries(s.exportTimeEntries);
}

function EyeToggleIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {visible ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      )}
    </svg>
  );
}

export function IntegrationsSettingsClient() {
  const { showToast } = useAppToast();
  const { role, loading: roleLoading } = useUserRole();
  const allowed = canManageIntegrations(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<JobtreadSettingsPublic | null>(null);

  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [companyIdDraft, setCompanyIdDraft] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState<SyncInterval>("manual");
  const [importCustomers, setImportCustomers] = useState(true);
  const [importJobs, setImportJobs] = useState(true);
  const [exportDailyLogs, setExportDailyLogs] = useState(false);
  const [exportPhotos, setExportPhotos] = useState(false);
  const [exportTimeEntries, setExportTimeEntries] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);
  const [syncingTarget, setSyncingTarget] = useState<
    "customers" | "jobs" | "daily_logs" | null
  >(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    target: "customers" | "jobs" | "daily_logs";
    ok: boolean;
    message: string;
    count?: number;
    at: string;
  } | null>(null);
  const [syncLog, setSyncLog] = useState<JobtreadSyncLogEntry[]>([]);
  const [syncLogLoading, setSyncLogLoading] = useState(false);
  const [syncLogOpen, setSyncLogOpen] = useState(false);
  const [connectionTest, setConnectionTest] = useState<{
    ok: boolean;
    fading: boolean;
  } | null>(null);
  const connectionTestTimersRef = useRef<{
    fade: ReturnType<typeof setTimeout>;
    clear: ReturnType<typeof setTimeout>;
  } | null>(null);
  const lastSyncResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLastSyncResultTimer = useCallback(() => {
    if (lastSyncResultTimerRef.current != null) {
      clearTimeout(lastSyncResultTimerRef.current);
      lastSyncResultTimerRef.current = null;
    }
  }, []);

  const dismissLastSyncResult = useCallback(() => {
    clearLastSyncResultTimer();
    setLastSyncResult(null);
  }, [clearLastSyncResultTimer]);

  const clearConnectionTestTimers = useCallback(() => {
    const t = connectionTestTimersRef.current;
    if (t) {
      clearTimeout(t.fade);
      clearTimeout(t.clear);
      connectionTestTimersRef.current = null;
    }
  }, []);

  const showConnectionTestResult = useCallback(
    (ok: boolean) => {
      clearConnectionTestTimers();
      setConnectionTest({ ok, fading: false });
      const fade = setTimeout(() => {
        setConnectionTest((prev) =>
          prev ? { ...prev, fading: true } : null,
        );
      }, 5000);
      const clear = setTimeout(() => {
        setConnectionTest(null);
        connectionTestTimersRef.current = null;
      }, 5500);
      connectionTestTimersRef.current = { fade, clear };
    },
    [clearConnectionTestTimers],
  );

  useEffect(() => {
    return () => clearConnectionTestTimers();
  }, [clearConnectionTestTimers]);

  useEffect(() => {
    if (!lastSyncResult) {
      clearLastSyncResultTimer();
      return;
    }
    clearLastSyncResultTimer();
    lastSyncResultTimerRef.current = setTimeout(() => {
      lastSyncResultTimerRef.current = null;
      setLastSyncResult(null);
    }, 12_000);
    return () => clearLastSyncResultTimer();
  }, [lastSyncResult, clearLastSyncResultTimer]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/integrations/jobtread", {
        credentials: "include",
      });
      const j = (await r.json()) as {
        settings?: JobtreadSettingsPublic;
        error?: string;
      };
      if (!r.ok) {
        throw new Error(j.error ?? "Could not load settings.");
      }
      const s = j.settings!;
      applyJobtreadPublicToDrafts(s, {
        setSettings,
        setCompanyIdDraft,
        setAutoSync,
        setSyncInterval,
        setImportCustomers,
        setImportJobs,
        setExportDailyLogs,
        setExportPhotos,
        setExportTimeEntries,
      });
      setApiKeyDraft("");
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!roleLoading && allowed) void load();
  }, [roleLoading, allowed, load]);

  const loadSyncLog = useCallback(async () => {
    setSyncLogLoading(true);
    try {
      const r = await fetch("/api/integrations/jobtread/sync-log?limit=10", {
        credentials: "include",
      });
      const j = (await r.json()) as {
        ok?: boolean;
        entries?: JobtreadSyncLogEntry[];
        error?: string;
      };
      if (!r.ok || !j.ok) return;
      setSyncLog(j.entries ?? []);
    } catch {
      /* ignore */
    } finally {
      setSyncLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && allowed && !loading) void loadSyncLog();
  }, [roleLoading, allowed, loading, loadSyncLog]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        companyId: companyIdDraft.trim(),
        autoSyncEnabled: autoSync,
        syncInterval,
        importCustomers,
        importJobs,
        exportDailyLogs,
        exportPhotos,
        exportTimeEntries,
      };
      if (apiKeyDraft.trim()) {
        body.apiKey = apiKeyDraft.trim();
      }
      const r = await fetch("/api/integrations/jobtread", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as {
        settings?: JobtreadSettingsPublic;
        error?: string;
      };
      if (!r.ok) {
        throw new Error(j.error ?? "Save failed.");
      }
      const s = j.settings!;
      applyJobtreadPublicToDrafts(s, {
        setSettings,
        setCompanyIdDraft,
        setAutoSync,
        setSyncInterval,
        setImportCustomers,
        setImportJobs,
        setExportDailyLogs,
        setExportPhotos,
        setExportTimeEntries,
      });
      setApiKeyDraft("");
      setShowApiKey(false);
      showToast({ message: "Settings saved", variant: "success" });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const clearApiKey = async () => {
    if (!window.confirm("Remove the stored JobTread API key?")) return;
    setSaving(true);
    try {
      const r = await fetch("/api/integrations/jobtread", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyIdDraft.trim(),
          clearApiKey: true,
          autoSyncEnabled: autoSync,
          syncInterval,
          importCustomers,
          importJobs,
          exportDailyLogs,
          exportPhotos,
          exportTimeEntries,
        }),
      });
      const j = (await r.json()) as {
        settings?: JobtreadSettingsPublic;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "Update failed.");
      const s = j.settings!;
      applyJobtreadPublicToDrafts(s, {
        setSettings,
        setCompanyIdDraft,
        setAutoSync,
        setSyncInterval,
        setImportCustomers,
        setImportJobs,
        setExportDailyLogs,
        setExportPhotos,
        setExportTimeEntries,
      });
      setApiKeyDraft("");
      setShowApiKey(false);
      showToast({ message: "API key removed.", variant: "success" });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    try {
      const r = await fetch("/api/integrations/jobtread/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyDraft.trim() || undefined,
          companyId: companyIdDraft.trim() || undefined,
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!r.ok || !j.ok) {
        showConnectionTestResult(false);
        return;
      }
      showConnectionTestResult(true);
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              connectionStatus: "ok",
              connectionMessage:
                j.message ??
                "Test recorded — JobTread API client not wired yet; credentials accepted.",
            }
          : prev,
      );
    } catch {
      showConnectionTestResult(false);
    }
  };

  const runSync = async (target: "customers" | "jobs" | "daily_logs") => {
    setSyncingTarget(target);
    try {
      const r = await fetch(
        `/api/integrations/jobtread/sync?target=${encodeURIComponent(target)}`,
        { credentials: "include" },
      );
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        count?: number;
      };
      if (!r.ok) {
        throw new Error(j.error ?? "Sync failed.");
      }
      if (j.ok === false) {
        throw new Error(j.error ?? "Sync failed.");
      }
      const countPart =
        typeof j.count === "number"
          ? target === "customers"
            ? `Imported ${j.count} customer(s) from JobTread.`
            : target === "jobs"
              ? `Imported ${j.count} job(s) from JobTread.`
              : `${j.count} record(s) processed.`
          : null;
      setLastSyncResult({
        target,
        ok: true,
        message: (j.message?.trim() || countPart || "Sync completed.").trim(),
        count: typeof j.count === "number" ? j.count : undefined,
        at: new Date().toISOString(),
      });
      void load();
      void loadSyncLog();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed.";
      showToast({ message: msg, variant: "error" });
      setLastSyncResult({
        target,
        ok: false,
        message: msg,
        at: new Date().toISOString(),
      });
      void loadSyncLog();
    } finally {
      setSyncingTarget(null);
    }
  };

  if (roleLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="settings" showTppSubtitle />
        <main className="app-page-shell min-w-0 flex-1 py-10">
          <div className="h-40 animate-pulse rounded-xl bg-white/10" />
        </main>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell min-w-0 flex-1 py-10">
          <p className="text-white/80">You don&apos;t have access to this page.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-[#E8C84A] hover:underline">
            ← Dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="settings" showTppSubtitle />
      <main className="app-page-shell mx-auto min-w-0 max-w-3xl flex-1 py-8 md:py-10">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Integrations</h1>
        <p className="mt-1 text-sm text-white/55">
          Connect external systems. Admin access only.
        </p>

        {loading ? (
          <div className="mt-8 h-64 animate-pulse rounded-xl bg-white/10" />
        ) : (
          <section className="mt-8 min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-white">
              JobTread Integration
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Sync customers, jobs, and daily logs with JobTread.
            </p>

            {settings && !settings.cryptoConfigured ? (
              <div
                className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100"
                role="status"
              >
                <p className="font-semibold">Encryption key not configured</p>
                <p className="mt-1 text-amber-100/85">
                  Set{" "}
                  <code className="rounded bg-black/30 px-1 text-xs">
                    INTEGRATIONS_ENCRYPTION_KEY
                  </code>{" "}
                  on the server (64 hex characters for a 256-bit key, or a long
                  passphrase). API keys cannot be stored until this is set.
                </p>
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <label className="block text-xs font-medium text-white/50">
                API key
                <div className="relative mt-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    autoComplete="new-password"
                    className="app-input block w-full pr-11"
                    placeholder={
                      settings?.hasApiKey
                        ? "Leave blank to keep existing key"
                        : "Paste JobTread API key"
                    }
                    value={apiKeyDraft}
                    onChange={(e) => setApiKeyDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white/85"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    onClick={() => setShowApiKey((v) => !v)}
                  >
                    <EyeToggleIcon visible={showApiKey} />
                  </button>
                </div>
                {settings?.hasApiKey && !apiKeyDraft.trim() ? (
                  <span className="mt-2 inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200/95">
                    Key saved securely
                  </span>
                ) : null}
              </label>
              <label className="block text-xs font-medium text-white/50">
                Company ID
                <input
                  type="text"
                  className="app-input mt-1 block w-full"
                  placeholder="JobTread company ID"
                  value={companyIdDraft}
                  onChange={(e) => setCompanyIdDraft(e.target.value)}
                />
                <span className="mt-2 block text-[11px] leading-relaxed text-white/45">
                  Find your Company ID in JobTread: Settings → Company → Account
                  Info, or check your JobTread URL:{" "}
                  <span className="font-mono text-white/55">
                    app.jobtread.com/company/[YOUR-ID]
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary btn-h-11"
                disabled={saving}
                onClick={() => void testConnection()}
              >
                Test connection
              </button>
              {settings?.hasApiKey ? (
                <button
                  type="button"
                  className="btn-secondary btn-h-11 border-red-400/40 text-red-200 hover:bg-red-500/10"
                  disabled={saving}
                  onClick={() => void clearApiKey()}
                >
                  Remove API key
                </button>
              ) : null}
            </div>

            {connectionTest ? (
              <div
                role="status"
                className={`mt-3 rounded-lg border px-4 py-3 text-sm transition-opacity duration-500 ${
                  connectionTest.ok
                    ? "border-emerald-500/45 bg-emerald-950/35 text-emerald-100"
                    : "border-red-500/45 bg-red-950/35 text-red-100"
                } ${connectionTest.fading ? "opacity-0" : "opacity-100"}`}
              >
                {connectionTest.ok
                  ? "✅ Connection successful!"
                  : "❌ Connection failed - check your API key and Company ID"}
              </div>
            ) : null}

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
                Sync schedule
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  className="rounded border-white/30"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                />
                Auto-sync
              </label>
              <label className="mt-3 block text-xs text-white/50">
                Sync interval
                <select
                  className="app-input mt-1 block w-full max-w-xs"
                  value={syncInterval}
                  onChange={(e) =>
                    setSyncInterval(e.target.value as SyncInterval)
                  }
                >
                  {SYNC_INTERVALS.map((v) => (
                    <option key={v} value={v}>
                      {v === "hourly"
                        ? "Hourly"
                        : v === "daily"
                          ? "Daily"
                          : "Manual only"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-white/40">
                Last sync:{" "}
                <span className="font-mono text-white/70">
                  {formatWhen(settings?.lastSyncAt ?? null)}
                </span>
              </p>
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
                Sync options
              </p>
              <ul className="mt-3 space-y-2 text-sm text-white/85">
                <li className="flex items-center gap-2">
                  <input
                    id="jt-import-customers"
                    type="checkbox"
                    className="rounded border-white/30"
                    checked={importCustomers}
                    onChange={(e) => setImportCustomers(e.target.checked)}
                  />
                  <label htmlFor="jt-import-customers">
                    Import customers from JobTread
                  </label>
                </li>
                <li className="flex items-center gap-2">
                  <input
                    id="jt-import-jobs"
                    type="checkbox"
                    className="rounded border-white/30"
                    checked={importJobs}
                    onChange={(e) => setImportJobs(e.target.checked)}
                  />
                  <label htmlFor="jt-import-jobs">
                    Import jobs from JobTread
                  </label>
                </li>
                <li className="flex items-center gap-2">
                  <input
                    id="jt-export-logs"
                    type="checkbox"
                    className="rounded border-white/30"
                    checked={exportDailyLogs}
                    onChange={(e) => setExportDailyLogs(e.target.checked)}
                  />
                  <label htmlFor="jt-export-logs">
                    Export daily logs to JobTread
                  </label>
                </li>
                <li className="flex items-center gap-2">
                  <input
                    id="jt-export-photos"
                    type="checkbox"
                    className="rounded border-white/30"
                    checked={exportPhotos}
                    onChange={(e) => setExportPhotos(e.target.checked)}
                  />
                  <label htmlFor="jt-export-photos">
                    Export photos to JobTread
                  </label>
                </li>
                <li className="flex items-center gap-2">
                  <input
                    id="jt-export-time"
                    type="checkbox"
                    className="rounded border-white/30"
                    checked={exportTimeEntries}
                    onChange={(e) => setExportTimeEntries(e.target.checked)}
                  />
                  <label htmlFor="jt-export-time">
                    Export time entries to JobTread
                  </label>
                </li>
              </ul>
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
                Manual sync
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-h-11 inline-flex min-w-[10.5rem] items-center justify-center gap-2"
                  disabled={saving || syncingTarget === "customers"}
                  onClick={() => void runSync("customers")}
                >
                  {syncingTarget === "customers" ? (
                    <>
                      <span
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
                        aria-hidden
                      />
                      Syncing…
                    </>
                  ) : (
                    "Sync customers now"
                  )}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-h-11 inline-flex min-w-[9.5rem] items-center justify-center gap-2"
                  disabled={saving || syncingTarget === "jobs"}
                  onClick={() => void runSync("jobs")}
                >
                  {syncingTarget === "jobs" ? (
                    <>
                      <span
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
                        aria-hidden
                      />
                      Syncing…
                    </>
                  ) : (
                    "Sync jobs now"
                  )}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-h-11 inline-flex min-w-[10.5rem] items-center justify-center gap-2"
                  disabled={saving || syncingTarget === "daily_logs"}
                  onClick={() => void runSync("daily_logs")}
                >
                  {syncingTarget === "daily_logs" ? (
                    <>
                      <span
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
                        aria-hidden
                      />
                      Exporting…
                    </>
                  ) : (
                    "Export daily logs"
                  )}
                </button>
              </div>
              {lastSyncResult ? (
                <div
                  className="mt-3 rounded-lg border border-white/10 px-3 py-2.5 text-sm"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className={`rounded-md border px-3 py-2 ${
                      lastSyncResult.ok
                        ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-100"
                        : "border-red-500/40 bg-red-950/30 text-red-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                          Last sync result
                        </p>
                        <p className="mt-1 font-medium text-white/90">
                          {syncTypeLabel(lastSyncResult.target)}
                          <span className="mx-1.5 text-white/35">·</span>
                          <span
                            className={
                              lastSyncResult.ok
                                ? "text-emerald-200"
                                : "text-red-200"
                            }
                          >
                            {lastSyncResult.ok ? "Success" : "Failed"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/75">
                          {lastSyncResult.message}
                        </p>
                        {typeof lastSyncResult.count === "number" ? (
                          <p className="mt-1 font-mono text-xs tabular-nums text-[#E8C84A]">
                            Count: {lastSyncResult.count}
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-[10px] text-white/40">
                          {formatWhen(lastSyncResult.at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-[11px] text-white/45 underline-offset-2 hover:text-white/80 hover:underline"
                        onClick={dismissLastSyncResult}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setSyncLogOpen((o) => !o)}
                aria-expanded={syncLogOpen}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
                  Sync history
                </p>
                <span className="text-white/50">{syncLogOpen ? "▼" : "▶"}</span>
              </button>
              {syncLogOpen ? (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/45">
                      Recent runs (newest first)
                    </span>
                    <button
                      type="button"
                      className="text-xs text-[#E8C84A] hover:underline"
                      disabled={syncLogLoading}
                      onClick={() => void loadSyncLog()}
                    >
                      {syncLogLoading ? "Loading…" : "Refresh"}
                    </button>
                  </div>
                  {syncLog.length === 0 && !syncLogLoading ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                      <p className="text-sm font-medium text-white/75">
                        You don&apos;t have any sync history yet
                      </p>
                      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-white/45">
                        After you run a manual sync, successful and failed runs
                        show up here so you can see what happened and when.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/20">
                      <table className="w-full table-fixed border-collapse text-left text-[11px] text-white/80">
                        <thead className="sticky top-0 z-[1] bg-[#0a1628]/95 backdrop-blur-sm">
                          <tr className="text-white/45">
                            <th className="w-[22%] px-2.5 py-2 font-medium">
                              Started
                            </th>
                            <th className="w-[18%] px-2.5 py-2 font-medium">
                              Type
                            </th>
                            <th className="w-[16%] px-2.5 py-2 font-medium">
                              Status
                            </th>
                            <th className="w-[10%] px-2.5 py-2 font-medium text-right">
                              #
                            </th>
                            <th className="w-[18%] px-2.5 py-2 font-medium">
                              Finished
                            </th>
                            <th className="w-[16%] px-2.5 py-2 font-medium">
                              Error
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncLog.map((row) => (
                            <tr
                              key={row.id}
                              className="border-t border-white/[0.08] align-top hover:bg-white/[0.03]"
                            >
                              <td className="px-2.5 py-2 font-mono text-[10px] text-white/60">
                                {formatShortWhen(row.started_at)}
                              </td>
                              <td className="px-2.5 py-2 text-white/85">
                                {syncTypeLabel(row.sync_type)}
                              </td>
                              <td className="px-2.5 py-2">
                                <span
                                  className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${syncStatusBadgeClass(row.status)}`}
                                  title={row.status}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-[#E8C84A]">
                                {row.records_synced}
                              </td>
                              <td className="px-2.5 py-2 font-mono text-[10px] text-white/55">
                                {formatShortWhen(row.completed_at)}
                              </td>
                              <td
                                className="max-w-0 truncate px-2.5 py-2 text-red-200/85"
                                title={row.error_message ?? undefined}
                              >
                                {row.error_message ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
                Status
              </p>
              <dl className="mt-3 space-y-2 text-sm text-white/80">
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Connection</dt>
                  <dd
                    className={`font-medium ${statusColor(settings?.connectionStatus ?? "unknown")}`}
                  >
                    {settings?.connectionStatus ?? "unknown"}
                  </dd>
                </div>
                {settings?.connectionMessage ? (
                  <div>
                    <dt className="text-white/50">Message</dt>
                    <dd className="mt-1 text-white/70">
                      {settings.connectionMessage}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Customers synced (total)</dt>
                  <dd className="font-mono tabular-nums text-[#E8C84A]">
                    {settings?.customersSyncedCount ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Jobs synced (total)</dt>
                  <dd className="font-mono tabular-nums text-[#E8C84A]">
                    {settings?.jobsSyncedCount ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Settings updated</dt>
                  <dd className="text-right font-mono text-xs text-white/60">
                    {formatWhen(settings?.updatedAt ?? null)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary btn-h-11"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                className="btn-secondary btn-h-11"
                disabled={loading}
                onClick={() => void load()}
              >
                Reload
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
