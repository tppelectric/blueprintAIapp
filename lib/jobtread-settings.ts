/** Row shape for `integration_settings` (provider = jobtread). */
export type JobtreadIntegrationRow = {
  id: string;
  provider: string;
  integration_name?: string | null;
  company_id: string | null;
  api_key_ciphertext: string | null;
  auto_sync_enabled: boolean;
  sync_interval: string;
  import_customers: boolean;
  import_jobs: boolean;
  export_daily_logs: boolean;
  export_photos: boolean;
  export_time_entries: boolean;
  last_sync_at: string | null;
  customers_synced_count: number;
  jobs_synced_count: number;
  daily_logs_synced_count: number;
  connection_status: string;
  connection_message: string | null;
  updated_at: string;
};

export const JOBTREAD_PROVIDER = "jobtread";

export type SyncInterval = "hourly" | "daily" | "manual";

export const SYNC_INTERVALS: SyncInterval[] = ["hourly", "daily", "manual"];

export type JobtreadSettingsPublic = {
  hasApiKey: boolean;
  companyId: string;
  autoSyncEnabled: boolean;
  syncInterval: SyncInterval;
  importCustomers: boolean;
  importJobs: boolean;
  exportDailyLogs: boolean;
  exportPhotos: boolean;
  exportTimeEntries: boolean;
  lastSyncAt: string | null;
  customersSyncedCount: number;
  jobsSyncedCount: number;
  dailyLogsSyncedCount: number;
  connectionStatus: string;
  connectionMessage: string | null;
  updatedAt: string | null;
  cryptoConfigured: boolean;
};

export function rowToPublic(
  row: JobtreadIntegrationRow | null,
  cryptoConfigured: boolean,
): JobtreadSettingsPublic {
  if (!row) {
    return {
      hasApiKey: false,
      companyId: "",
      autoSyncEnabled: false,
      syncInterval: "manual",
      importCustomers: true,
      importJobs: true,
      exportDailyLogs: false,
      exportPhotos: false,
      exportTimeEntries: false,
      lastSyncAt: null,
      customersSyncedCount: 0,
      jobsSyncedCount: 0,
      dailyLogsSyncedCount: 0,
      connectionStatus: "unknown",
      connectionMessage: null,
      updatedAt: null,
      cryptoConfigured,
    };
  }
  const interval = SYNC_INTERVALS.includes(row.sync_interval as SyncInterval)
    ? (row.sync_interval as SyncInterval)
    : "manual";
  return {
    hasApiKey: Boolean(row.api_key_ciphertext?.trim()),
    companyId: row.company_id ?? "",
    autoSyncEnabled: Boolean(row.auto_sync_enabled),
    syncInterval: interval,
    importCustomers: Boolean(row.import_customers),
    importJobs: Boolean(row.import_jobs),
    exportDailyLogs: Boolean(row.export_daily_logs),
    exportPhotos: Boolean(row.export_photos),
    exportTimeEntries: Boolean(row.export_time_entries),
    lastSyncAt: row.last_sync_at,
    customersSyncedCount: Number(row.customers_synced_count) || 0,
    jobsSyncedCount: Number(row.jobs_synced_count) || 0,
    dailyLogsSyncedCount: Number(row.daily_logs_synced_count) || 0,
    connectionStatus: row.connection_status || "unknown",
    connectionMessage: row.connection_message,
    updatedAt: row.updated_at,
    cryptoConfigured,
  };
}
