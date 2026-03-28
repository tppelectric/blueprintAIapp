import type {
  InternalRequestPriority,
  InternalRequestRow,
  InternalRequestStatus,
} from "@/lib/internal-request-types";

const DAY_MS = 86_400_000;

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
  const ymd = new Date().toISOString().slice(0, 10);
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
