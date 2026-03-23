"use client";

import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { SavedScanRow } from "@/lib/saved-scan-types";
import { parseScanItems, parseScanRooms } from "@/lib/saved-scan-types";

function itemKey(i: ElectricalItemRow): string {
  return `${i.category}|${i.description}|${i.specification}`;
}

function roomKey(r: { room_name: string; room_type: string }): string {
  return `${r.room_name}|${r.room_type}`;
}

export function ScanCompareModal({
  open,
  onClose,
  scanA,
  scanB,
}: {
  open: boolean;
  onClose: () => void;
  scanA: SavedScanRow | null;
  scanB: SavedScanRow | null;
}) {
  if (!open || !scanA || !scanB) return null;

  const itemsA = parseScanItems(scanA.items_snapshot);
  const itemsB = parseScanItems(scanB.items_snapshot);
  const roomsA = parseScanRooms(scanA.rooms_snapshot);
  const roomsB = parseScanRooms(scanB.rooms_snapshot);

  const mapA = new Map<string, ElectricalItemRow>();
  const mapB = new Map<string, ElectricalItemRow>();
  for (const i of itemsA) mapA.set(itemKey(i), i);
  for (const i of itemsB) mapB.set(itemKey(i), i);

  let added = 0;
  let removed = 0;
  let countsChanged = 0;
  for (const k of mapB.keys()) {
    if (!mapA.has(k)) added++;
  }
  for (const k of mapA.keys()) {
    if (!mapB.has(k)) removed++;
  }
  for (const k of mapA.keys()) {
    const a = mapA.get(k);
    const b = mapB.get(k);
    if (a && b && Number(a.quantity) !== Number(b.quantity)) countsChanged++;
  }

  const roomSetA = new Set(roomsA.map(roomKey));
  const roomSetB = new Set(roomsB.map(roomKey));
  let roomsAdded = 0;
  let roomsRemoved = 0;
  for (const r of roomSetB) if (!roomSetA.has(r)) roomsAdded++;
  for (const r of roomSetA) if (!roomSetB.has(r)) roomsRemoved++;

  function ItemCol({
    title,
    items,
    other,
    rooms,
    otherRoomKeys,
    otherSideLabel,
  }: {
    title: string;
    items: ElectricalItemRow[];
    other: Map<string, ElectricalItemRow>;
    rooms: { room_name: string; room_type: string; id?: string }[];
    otherRoomKeys: Set<string>;
    otherSideLabel: string;
  }) {
    return (
      <div className="flex min-h-0 flex-col border-white/10 md:border-r md:last:border-r-0">
        <div className="shrink-0 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white">
          {title}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Items
          </p>
          <ul className="space-y-2 text-xs">
            {items.map((i) => {
              const k = itemKey(i);
              const o = other.get(k);
              const missingInOther = !o;
              const qtyDiff =
                o != null && Number(i.quantity) !== Number(o.quantity);
              const highlight = missingInOther || qtyDiff;
              return (
                <li
                  key={i.id ?? k}
                  className={`rounded-lg border border-white/10 p-2 ${highlight ? "bg-yellow-500/15" : "bg-white/[0.03]"}`}
                >
                  <div className="font-medium text-white">{i.description}</div>
                  <div className="mt-0.5 text-white/60">
                    {i.category} · qty {i.quantity}
                    {missingInOther ? (
                      <span className="text-yellow-200/90"> · not in other</span>
                    ) : qtyDiff ? (
                      <span className="text-yellow-200/90">
                        {" "}
                        (other qty {o.quantity})
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-white/50">
            Rooms
          </p>
          <ul className="space-y-1 text-xs text-white/75">
            {rooms.map((r) => {
              const hi = !otherRoomKeys.has(roomKey(r));
              return (
                <li
                  key={r.id ?? roomKey(r)}
                  className={hi ? "rounded bg-yellow-500/15 px-2 py-1" : ""}
                >
                  {r.room_name} ({r.room_type})
                  {hi ? ` · new vs ${otherSideLabel}` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#071422] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 id="compare-title" className="text-lg font-semibold text-white">
              Compare scans
            </h2>
            <p className="mt-1 text-xs text-amber-200/90">
              Comparing &ldquo;{scanA.scan_name}&rdquo; vs &ldquo;
              {scanB.scan_name}&rdquo; — {added} item line(s) added, {removed}{" "}
              removed, {countsChanged} count(s) changed
              {(roomsAdded || roomsRemoved) &&
                ` · Rooms: +${roomsAdded} / −${roomsRemoved}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
          >
            Close
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <ItemCol
            title={scanA.scan_name}
            items={itemsA}
            other={mapB}
            rooms={roomsA}
            otherRoomKeys={roomSetB}
            otherSideLabel="B"
          />
          <ItemCol
            title={scanB.scan_name}
            items={itemsB}
            other={mapA}
            rooms={roomsB}
            otherRoomKeys={roomSetA}
            otherSideLabel="A"
          />
        </div>
      </div>
    </div>
  );
}
