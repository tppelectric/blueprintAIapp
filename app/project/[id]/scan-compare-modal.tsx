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
  scanOlder,
  scanNewer,
}: {
  open: boolean;
  onClose: () => void;
  scanOlder: SavedScanRow | null;
  scanNewer: SavedScanRow | null;
}) {
  if (!open || !scanOlder || !scanNewer) return null;

  const itemsOld = parseScanItems(scanOlder.items_snapshot);
  const itemsNew = parseScanItems(scanNewer.items_snapshot);
  const roomsOld = parseScanRooms(scanOlder.rooms_snapshot);
  const roomsNew = parseScanRooms(scanNewer.rooms_snapshot);

  const mapOld = new Map<string, ElectricalItemRow>();
  const mapNew = new Map<string, ElectricalItemRow>();
  for (const i of itemsOld) mapOld.set(itemKey(i), i);
  for (const i of itemsNew) mapNew.set(itemKey(i), i);

  let added = 0;
  let removed = 0;
  let countsChanged = 0;
  for (const k of mapNew.keys()) {
    if (!mapOld.has(k)) added++;
  }
  for (const k of mapOld.keys()) {
    if (!mapNew.has(k)) removed++;
  }
  for (const k of mapOld.keys()) {
    const a = mapOld.get(k);
    const b = mapNew.get(k);
    if (a && b && Number(a.quantity) !== Number(b.quantity)) countsChanged++;
  }

  const roomSetOld = new Set(roomsOld.map(roomKey));
  const roomSetNew = new Set(roomsNew.map(roomKey));
  let roomsAdded = 0;
  let roomsRemoved = 0;
  for (const r of roomSetNew) if (!roomSetOld.has(r)) roomsAdded++;
  for (const r of roomSetOld) if (!roomSetNew.has(r)) roomsRemoved++;

  function itemClassOlder(i: ElectricalItemRow): string {
    const k = itemKey(i);
    const n = mapNew.get(k);
    if (!n) return "border-red-500/40 bg-red-950/35";
    if (Number(i.quantity) !== Number(n.quantity))
      return "border-amber-400/45 bg-amber-950/30";
    return "border-white/10 bg-white/[0.03]";
  }

  function itemClassNewer(i: ElectricalItemRow): string {
    const k = itemKey(i);
    const o = mapOld.get(k);
    if (!o) return "border-emerald-500/40 bg-emerald-950/30";
    if (Number(i.quantity) !== Number(o.quantity))
      return "border-amber-400/45 bg-amber-950/30";
    return "border-white/10 bg-white/[0.03]";
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
            <p className="mt-1 text-xs text-white/70">
              <span className="text-red-200/90">{removed} removed</span>
              {" · "}
              <span className="text-emerald-200/90">{added} added</span>
              {" · "}
              <span className="text-amber-200/90">{countsChanged} qty changed</span>
              {(roomsAdded || roomsRemoved) &&
                ` · Rooms: +${roomsAdded} / −${roomsRemoved}`}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              Older: {scanOlder.scan_name} · Newer: {scanNewer.scan_name}
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
          <div className="flex min-h-0 flex-col border-white/10 md:border-r">
            <div className="shrink-0 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white">
              Older — {scanOlder.scan_name}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                Items
              </p>
              <ul className="space-y-2 text-xs">
                {itemsOld.map((i) => (
                  <li
                    key={i.id ?? itemKey(i)}
                    className={`rounded-lg border p-2 ${itemClassOlder(i)}`}
                  >
                    <div className="font-medium text-white">{i.description}</div>
                    <div className="mt-0.5 text-white/60">
                      {i.category} · qty {i.quantity}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-white/50">
                Rooms
              </p>
              <ul className="space-y-1 text-xs text-white/75">
                {roomsOld.map((r) => {
                  const hi = !roomSetNew.has(roomKey(r));
                  return (
                    <li
                      key={r.id ?? roomKey(r)}
                      className={
                        hi ? "rounded bg-red-950/35 px-2 py-1 text-red-100/90" : ""
                      }
                    >
                      {r.room_name} ({r.room_type})
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white">
              Newer — {scanNewer.scan_name}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                Items
              </p>
              <ul className="space-y-2 text-xs">
                {itemsNew.map((i) => (
                  <li
                    key={i.id ?? itemKey(i)}
                    className={`rounded-lg border p-2 ${itemClassNewer(i)}`}
                  >
                    <div className="font-medium text-white">{i.description}</div>
                    <div className="mt-0.5 text-white/60">
                      {i.category} · qty {i.quantity}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-white/50">
                Rooms
              </p>
              <ul className="space-y-1 text-xs text-white/75">
                {roomsNew.map((r) => {
                  const hi = !roomSetOld.has(roomKey(r));
                  return (
                    <li
                      key={r.id ?? roomKey(r)}
                      className={
                        hi
                          ? "rounded bg-emerald-950/35 px-2 py-1 text-emerald-100/90"
                          : ""
                      }
                    >
                      {r.room_name} ({r.room_type})
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
