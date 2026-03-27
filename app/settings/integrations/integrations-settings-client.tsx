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
  const [connectionTest, setConnectionTest] = useState<{
    ok: boolean;
    fading: boolean;
  } | null>(null);
  const connectionTestTimersRef = useRef<{
    fade: ReturnType<typeof setTimeout>;
    clear: ReturnType<typeof setTimeout>;
  } | null>(null);

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
      const fade = window.setTimeout(() => {
        setConnectionTest((prev) =>
          prev ? { ...prev, fading: true } : null,
        );
      }, 5000);
      const clear = window.setTimeout(() => {
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
      const s = settings;
      if (s) {
        applyJobtreadPublicToDrafts(
          {
            ...s,
            connectionStatus: "ok",
            connectionMessage:
              j.message ??
              "Test recorded — JobTread API client not wired yet; credentials accepted.",
          },
          {
            setSettings,
            setCompanyIdDraft,
            setAutoSync,
            setSyncInterval,
            setImportCustomers,
            setImportJobs,
            setExportDailyLogs,
            setExportPhotos,
            setExportTimeEntries,
          },
        );
      }
    } catch {
      showConnectionTestResult(false);
    }
  };

  const runSync = async (target: "customers" | "jobs" | "daily_logs") => {
    try {
      const r = await fetch(
        `/api/integrations/jobtread/sync?target=${encodeURIComponent(target)}`,
        { credentials: "include" },
      );
      const j = (await r.json()) as { ok?: boolean; error?: string; message?: string };
      if (!r.ok) throw new Error(j.error ?? "Sync failed.");
      showToast({
        message: j.message ?? "Sync recorded.",
        variant: "success",
      });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Sync failed.",
        variant: "error",
      });
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
                <input
                  type="password"
                  autoComplete="new-password"
                  className="app-input mt-1 block w-full"
                  placeholder={
                    settings?.hasApiKey
                      ? "Leave blank to keep existing key"
                      : "Paste JobTread API key"
                  }
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                />
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
                  className="btn-secondary btn-h-11"
                  disabled={saving}
                  onClick={() => void runSync("customers")}
                >
                  Sync customers now
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-h-11"
                  disabled={saving}
                  onClick={() => void runSync("jobs")}
                >
                  Sync jobs now
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-h-11"
                  disabled={saving}
                  onClick={() => void runSync("daily_logs")}
                >
                  Export daily logs
                </button>
              </div>
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
