/**
 * Map Supabase / Postgres errors from daily log save to user-facing text.
 */
export function formatDailyLogSaveError(input: {
  message?: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
}): string {
  const code = input.code ?? "";
  const raw = (input.message ?? "").trim();
  const details = (input.details ?? "").trim();
  const hint = (input.hint ?? "").trim();

  if (code === "42501" || /permission denied/i.test(raw)) {
    return "You don’t have permission to save daily logs. Ask an admin to confirm your account is active and the database grants daily_logs INSERT to authenticated users.";
  }
  if (code === "23503" || /foreign key/i.test(raw)) {
    return "Save failed: the selected job may have been removed, or a linked record is invalid. Pick a valid job and try again.";
  }
  if (code === "23502" || /not null/i.test(raw)) {
    return "Save failed: a required field is missing. Check log date and try again.";
  }
  if (code === "P0001" || /trigger/i.test(raw)) {
    return `Save failed (database rule): ${raw || "A sync trigger rejected this log."}${hint ? ` — ${hint}` : ""}`;
  }
  if (input.status === 401) {
    return "You’re signed out. Sign in again and retry.";
  }
  if (input.status === 413) {
    return "Request was too large. Try fewer attachments or smaller files.";
  }

  const parts = [raw, details, hint].filter(Boolean);
  return parts.join(" — ") || "Save failed. Please try again or contact support.";
}
