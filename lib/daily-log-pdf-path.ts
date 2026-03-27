import type { DailyLogRow } from "@/lib/daily-logs-types";

/** Safe object key under bucket `daily-log-pdfs` (unique per log; includes job + date). */
export function dailyLogPdfObjectPath(
  log: Pick<DailyLogRow, "id" | "job_id" | "log_date">,
): string {
  const dateStr =
    String(log.log_date)
      .slice(0, 10)
      .replace(/[^\d-]/g, "") || "unknown-date";
  const jobKey = log.job_id ?? "no-job";
  return `daily-logs/${jobKey}/${dateStr}-${log.id}.pdf`;
}
