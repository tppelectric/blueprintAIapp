const KEY = "tpp_inventory_offline_queue";

/** Minimal offline ops the scan page can replay when back online. */
export type OfflineInventoryOp =
  | {
      kind: "asset_checkout";
      assetId: string;
      fromLocationId: string | null;
    }
  | {
      kind: "asset_checkin";
      assetId: string;
      locationId: string | null;
    };

export type QueuedItem = {
  id: string;
  op: OfflineInventoryOp;
  createdAt: string;
};

function load(): QueuedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as QueuedItem[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function save(items: QueuedItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueInventoryOp(op: OfflineInventoryOp): void {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = [...load(), { id, op, createdAt: new Date().toISOString() }];
  save(next);
}

export function peekOfflineQueue(): QueuedItem[] {
  return load();
}

export function clearOfflineQueue(): void {
  save([]);
}

export function removeQueued(id: string): void {
  save(load().filter((x) => x.id !== id));
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}
