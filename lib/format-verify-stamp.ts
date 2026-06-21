import type { ElectricalItemRow } from "@/lib/electrical-item-types";

/** Short verifier label: first name, else email local-part. */
export function verifierShortName(p: {
  first_name?: string | null;
  email?: string | null;
}): string {
  const first = (p.first_name ?? "").trim();
  if (first) return first;
  const email = (p.email ?? "").trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "team";
}

/** e.g. "Jun 17, 2:45 PM" — null if invalid/missing. */
export function formatVerifyWhen(iso: string | null | undefined): string | null {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function itemShowsAcceptedBadge(item: ElectricalItemRow): boolean {
  const vb = item.verified_by ?? null;
  const status = item.verification_status ?? "pending";
  return (
    item.verified_status === "accepted" ||
    vb === "accept" ||
    vb === "resolve" ||
    (status === "confirmed" && vb !== "override")
  );
}

export function formatVerifyStamp(
  item: Pick<ElectricalItemRow, "verified_at" | "verified_user_id">,
  currentUserId: string | null,
  nameByUserId: ReadonlyMap<string, string>,
): string | null {
  const when = formatVerifyWhen(item.verified_at);
  if (!when) return null;
  const uid = item.verified_user_id?.trim();
  if (!uid) return null;
  const who =
    currentUserId && uid === currentUserId
      ? "you"
      : nameByUserId.get(uid) ?? "team";
  return `by ${who} · ${when}`;
}
