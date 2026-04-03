import type {
  InternalRequestDetails,
  InternalRequestPriority,
  InternalRequestRow,
  InternalRequestStatus,
  InternalRequestType,
} from "@/lib/internal-request-types";

const DAY_MS = 86_400_000;

function localYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isTerminalStatus(s: InternalRequestStatus): boolean {
  return s === "completed" || s === "declined" || s === "cancelled";
}

export function daysOpen(req: InternalRequestRow): number {
  const start = new Date(req.created_at).getTime();
  const end = isTerminalStatus(req.status) && req.resolved_at
    ? new Date(req.resolved_at).getTime()
    : Date.now();
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function priorityBadgeClass(p: InternalRequestPriority): string {
  switch (p) {
    case "emergency":
      return "bg-red-600 text-white ring-2 ring-red-400/60";
    case "urgent":
      return "bg-orange-500/25 text-orange-100 ring-1 ring-orange-400/45";
    case "low":
      return "bg-zinc-500/20 text-zinc-200 ring-1 ring-zinc-400/35";
    default:
      return "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/40";
  }
}

export function statusBadgeClass(s: InternalRequestStatus): string {
  switch (s) {
    case "new":
      return "bg-violet-500/20 text-violet-100 ring-violet-400/35";
    case "in_review":
    case "approved":
      return "bg-amber-500/15 text-amber-100 ring-amber-400/35";
    case "in_progress":
      return "bg-sky-500/20 text-sky-100 ring-sky-400/35";
    case "waiting":
      return "bg-orange-500/15 text-orange-100 ring-orange-400/30";
    case "completed":
      return "bg-emerald-500/20 text-emerald-100 ring-emerald-400/35";
    case "declined":
    case "cancelled":
      return "bg-zinc-600/30 text-zinc-200 ring-zinc-500/30";
    default:
      return "bg-white/10 text-white/80 ring-white/15";
  }
}

export function statusLabel(s: InternalRequestStatus): string {
  return s.replace(/_/g, " ");
}

export function inProgressPipelineCount(rows: InternalRequestRow[]): number {
  const set = new Set<InternalRequestStatus>([
    "in_review",
    "approved",
    "in_progress",
    "waiting",
  ]);
  return rows.filter((r) => set.has(r.status)).length;
}

export function completedTodayUtcCount(rows: InternalRequestRow[]): number {
  const ymd = localYmd();
  return rows.filter((r) => {
    if (r.status !== "completed" || !r.resolved_at) return false;
    return r.resolved_at.slice(0, 10) === ymd;
  }).length;
}

export function urgentOpenCount(rows: InternalRequestRow[]): number {
  return rows.filter(
    (r) =>
      !isTerminalStatus(r.status) &&
      (r.priority === "urgent" || r.priority === "emergency"),
  ).length;
}

export function overdueOpenCount(rows: InternalRequestRow[]): number {
  const thr = Date.now() - 3 * DAY_MS;
  return rows.filter(
    (r) =>
      !isTerminalStatus(r.status) && new Date(r.created_at).getTime() < thr,
  ).length;
}

export function adminNavAttentionCount(rows: InternalRequestRow[]): number {
  const ids = new Set<string>();
  for (const r of rows) {
    if (isTerminalStatus(r.status)) continue;
    if (r.status === "new") ids.add(r.id);
    if (r.priority === "urgent" || r.priority === "emergency") ids.add(r.id);
  }
  return ids.size;
}

const PIPELINE_STATUSES = new Set<InternalRequestStatus>([
  "in_review",
  "approved",
  "in_progress",
  "waiting",
]);

const DETAIL_FIELD_LABELS: Record<string, string> = {
  vehicle_issue_noticed: "When issue noticed",
  vehicle_safe_to_drive: "Safe to drive",
  tool_still_usable: "Still usable",
  material_preferred_vendor: "Preferred vendor",
  document_for_who: "Who / what for",
  document_requirements: "Requirements",
  safety_when: "When",
  safety_where: "Where",
  safety_what: "What happened",
  safety_injured: "Anyone injured",
  safety_injury_details: "Injury details",
  safety_medical_attention: "Medical attention needed",
  safety_witnesses: "Witnesses",
  safety_osha_recordable: "OSHA recordable",
  additional_notes: "Additional notes",
};

function detailKeyOrderForType(t: InternalRequestType): string[] {
  switch (t) {
    case "vehicle_maintenance":
    case "vehicle_request":
      return ["vehicle_issue_noticed", "vehicle_safe_to_drive", "additional_notes"];
    case "tool_repair":
      return ["tool_still_usable", "additional_notes"];
    case "material_order":
      return ["material_preferred_vendor", "additional_notes"];
    case "document_request":
      return [
        "document_for_who",
        "document_requirements",
        "additional_notes",
      ];
    case "safety_incident":
      return [
        "safety_when",
        "safety_where",
        "safety_what",
        "safety_injured",
        "safety_injury_details",
        "safety_medical_attention",
        "safety_witnesses",
        "safety_osha_recordable",
        "additional_notes",
      ];
    case "tool_request":
      return ["additional_notes"];
    default:
      return ["additional_notes"];
  }
}

function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isDetailValuePresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return true;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function humanizeDetailKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Label/value rows for request detail UI (replaces raw JSON). */
export function internalRequestDetailsRows(
  requestType: InternalRequestType,
  details: InternalRequestDetails,
): { key: string; label: string; value: string }[] {
  const raw = details as Record<string, unknown>;
  const preferred = detailKeyOrderForType(requestType);
  const seen = new Set<string>();
  const rows: { key: string; label: string; value: string }[] = [];

  for (const key of preferred) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (!isDetailValuePresent(v)) continue;
    seen.add(key);
    rows.push({
      key,
      label: DETAIL_FIELD_LABELS[key] ?? humanizeDetailKey(key),
      value: formatDetailValue(v),
    });
  }

  const rest = Object.keys(raw)
    .filter((k) => !seen.has(k))
    .sort();
  for (const key of rest) {
    const v = raw[key];
    if (!isDetailValuePresent(v)) continue;
    rows.push({
      key,
      label: DETAIL_FIELD_LABELS[key] ?? humanizeDetailKey(key),
      value: formatDetailValue(v),
    });
  }

  return rows;
}

export type AdminListCardFilter =
  | null
  | "new"
  | "pipeline"
  | "urgent"
  | "done_today";

export function rowMatchesAdminListCardFilter(
  r: InternalRequestRow,
  filter: AdminListCardFilter,
): boolean {
  if (!filter) return true;
  if (filter === "new") return r.status === "new";
  if (filter === "pipeline") return PIPELINE_STATUSES.has(r.status);
  if (filter === "urgent") {
    return (
      !isTerminalStatus(r.status) &&
      (r.priority === "urgent" || r.priority === "emergency")
    );
  }
  if (filter === "done_today") {
    const ymd = localYmd();
    return (
      r.status === "completed" &&
      Boolean(r.resolved_at) &&
      r.resolved_at!.slice(0, 10) === ymd
    );
  }
  return true;
}
