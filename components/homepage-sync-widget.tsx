"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";

type SyncTarget = "customers" | "jobs" | "daily_logs";

type RowResult = {
  count: number;
  lastSync: string | null;
  status: "success" | "error" | "idle";
};

const INITIAL_RESULTS: Record<SyncTarget, RowResult> = {
  customers: { count: 0, lastSync: null, status: "idle" },
  jobs: { count: 0, lastSync: null, status: "idle" },
  daily_logs: { count: 0, lastSync: null, status: "idle" },
};

function formatLastSync(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function SpinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const EXPECTED_SYNC_MS: Record<SyncTarget, number> = {
  customers: 15_000,
  jobs: 45_000,
  daily_logs: 60_000,
};

export function HomepageSyncWidget() {
  const { role, loading: roleLoading } = useUserRole();
  const [collapsed, setCollapsed] = useState(true);
  const [syncing, setSyncing] = useState<SyncTarget | null>(null);
  const [syncProgress, setSyncProgress] = useState<Record<SyncTarget, number>>(
    { customers: 0, jobs: 0, daily_logs: 0 },
  );
  const [syncStartTime, setSyncStartTime] = useState<
    Record<SyncTarget, number | null>
  >({ customers: null, jobs: null, daily_logs: null });
  const [results, setResults] =
    useState<Record<SyncTarget, RowResult>>(INITIAL_RESULTS);
  const successTimers = useRef<Partial<Record<SyncTarget, ReturnType<typeof setTimeout>>>>({});
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const progressCompleteTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const clearSuccessTimer = useCallback((type: SyncTarget) => {
    const t = successTimers.current[type];
    if (t) {
      clearTimeout(t);
      delete successTimers.current[type];
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const applyFromJobtreadPayload = (payload: unknown) => {
      const j = payload as {
        settings?: {
          lastSyncAt?: string | null;
          customersSyncedCount?: number;
          jobsSyncedCount?: number;
          dailyLogsSyncedCount?: number;
        };
      };
      const s = j.settings;
      if (!s) return;
      const last = formatLastSync(s.lastSyncAt ?? null);
      setResults({
        customers: {
          count: Number(s.customersSyncedCount) || 0,
          lastSync: last,
          status: "idle",
        },
        jobs: {
          count: Number(s.jobsSyncedCount) || 0,
          lastSync: last,
          status: "idle",
        },
        daily_logs: {
          count: Number(s.dailyLogsSyncedCount) || 0,
          lastSync: last,
          status: "idle",
        },
      });
    };

    try {
      let r = await fetch("/api/integrations/settings", {
        credentials: "include",
      });
      if (r.ok) {
        const data = (await r.json()) as Record<string, unknown>;
        if (data.settings && typeof data.settings === "object") {
          applyFromJobtreadPayload({ settings: data.settings });
          return;
        }
      }

      r = await fetch("/api/integrations/jobtread", { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        applyFromJobtreadPayload(data);
        return;
      }

      const sb = createBrowserClient();
      const { data: row, error } = await sb
        .from("integration_settings")
        .select(
          "customers_synced_count,jobs_synced_count,daily_logs_synced_count,last_sync_at",
        )
        .eq("provider", "jobtread")
        .maybeSingle();
      if (error || !row) return;
      const rec = row as {
        customers_synced_count?: number | null;
        jobs_synced_count?: number | null;
        daily_logs_synced_count?: number | null;
        last_sync_at?: string | null;
      };
      const last = formatLastSync(rec.last_sync_at ?? null);
      setResults({
        customers: {
          count: Number(rec.customers_synced_count) || 0,
          lastSync: last,
          status: "idle",
        },
        jobs: {
          count: Number(rec.jobs_synced_count) || 0,
          lastSync: last,
          status: "idle",
        },
        daily_logs: {
          count: Number(rec.daily_logs_synced_count) || 0,
          lastSync: last,
          status: "idle",
        },
      });
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    if (roleLoading || role !== "super_admin") return;
    void loadSettings();
  }, [role, roleLoading, loadSettings]);

  useEffect(() => {
    return () => {
      (Object.keys(successTimers.current) as SyncTarget[]).forEach((k) =>
        clearSuccessTimer(k),
      );
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressCompleteTimerRef.current) {
        clearTimeout(progressCompleteTimerRef.current);
        progressCompleteTimerRef.current = null;
      }
    };
  }, [clearSuccessTimer]);

  const runSync = async (type: SyncTarget) => {
    clearSuccessTimer(type);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (progressCompleteTimerRef.current) {
      clearTimeout(progressCompleteTimerRef.current);
      progressCompleteTimerRef.current = null;
    }
    setSyncing(type);
    setSyncProgress((p) => ({ ...p, [type]: 0 }));
    setSyncStartTime((p) => ({ ...p, [type]: Date.now() }));
    setResults((prev) => ({
      ...prev,
      [type]: { ...prev[type], status: "idle" },
    }));

    progressIntervalRef.current = setInterval(() => {
      setSyncProgress((prev) => {
        const cur = prev[type];
        if (cur >= 85) return { ...prev };
        const inc = 1 + Math.floor(Math.random() * 4);
        return { ...prev, [type]: Math.min(85, cur + inc) };
      });
    }, 400);

    try {
      const res = await fetch(
        `/api/integrations/jobtread/sync?target=${encodeURIComponent(type)}`,
        { method: "GET", credentials: "include" },
      );
      const data = (await res.json()) as {
        error?: string;
        count?: number;
        synced?: number;
      };
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const count =
        typeof data.count === "number"
          ? data.count
          : typeof data.synced === "number"
            ? data.synced
            : undefined;
      const nowStr = new Date().toLocaleString();
      setSyncProgress((p) => ({ ...p, [type]: 100 }));
      setResults((prev) => ({
        ...prev,
        [type]: {
          count:
            count !== undefined ? count : prev[type].count,
          lastSync: nowStr,
          status: "success",
        },
      }));
      successTimers.current[type] = setTimeout(() => {
        setResults((p) => ({
          ...p,
          [type]: { ...p[type], status: "idle" },
        }));
        delete successTimers.current[type];
      }, 3000);
      progressCompleteTimerRef.current = setTimeout(() => {
        progressCompleteTimerRef.current = null;
        setSyncProgress((p) => ({ ...p, [type]: 0 }));
        setSyncing(null);
        setSyncStartTime((p) => ({ ...p, [type]: null }));
      }, 1500);
    } catch {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setSyncProgress((p) => ({ ...p, [type]: 0 }));
      setSyncing(null);
      setSyncStartTime((p) => ({ ...p, [type]: null }));
      setResults((prev) => ({
        ...prev,
        [type]: { ...prev[type], status: "error" },
      }));
    }
  };

  if (roleLoading || role !== "super_admin") {
    return null;
  }

  const rows: { type: SyncTarget; label: string }[] = [
    { type: "customers", label: "👥 Customers" },
    { type: "jobs", label: "🏗 Jobs" },
    { type: "daily_logs", label: "📋 Daily Logs" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setCollapsed((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]/80">
            ⚡ Quick Sync
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/50">
            SUPER ADMIN ONLY
          </span>
        </div>
        <div className="flex items-center gap-3">
          {collapsed ? (
            <span className="text-[11px] text-white/45">
              {results.customers.count > 0 ||
              results.jobs.count > 0 ||
              results.daily_logs.count > 0 ? (
                <>
                  {results.customers.count} customers · {results.jobs.count}{" "}
                  jobs · {results.daily_logs.count} logs
                </>
              ) : null}
            </span>
          ) : null}
          <svg
            className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${collapsed ? "-rotate-180" : "rotate-0"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-white/10 px-4 pb-4 pt-3">
            <ul className="flex flex-col gap-0 divide-y divide-white/10">
              {rows.map(({ type, label }) => {
                const r = results[type];
                const busy = syncing === type;
                const pct = syncProgress[type];
                const start = syncStartTime[type];
                const expectedMs = EXPECTED_SYNC_MS[type];
                const elapsedMs = start != null ? Date.now() - start : 0;
                const remainingSec = Math.max(
                  0,
                  Math.ceil((expectedMs - elapsedMs) / 1000),
                );
                return (
                  <li
                    key={type}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0 shrink-0 sm:max-w-[min(100%,14rem)]">
                      <div className="text-sm font-medium text-white/90">
                        {label}
                      </div>
                      {busy ? (
                        <>
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-[#E8C84A] transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-white/40">
                            ~{remainingSec}s remaining
                          </p>
                        </>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:justify-center">
                      <span className="rounded-full border border-[#E8C84A]/35 bg-[#E8C84A]/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#E8C84A]">
                        {r.count}
                      </span>
                      <span className="text-xs text-white/45">
                        {r.lastSync ?? "Never synced"}
                      </span>
                    </div>
                    <div className="shrink-0">
                      {r.status === "success" && !busy ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                          ✓ Done
                        </span>
                      ) : r.status === "error" && !busy ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-red-400">
                            ✗ Failed
                          </span>
                          <button
                            type="button"
                            onClick={() => void runSync(type)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
                          >
                            Sync ↻
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runSync(type)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
                        >
                          {busy ? (
                            <>
                              <SpinIcon className="h-3.5 w-3.5 animate-spin" />
                              Syncing… {pct}%
                            </>
                          ) : (
                            <>Sync ↻</>
                          )}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
