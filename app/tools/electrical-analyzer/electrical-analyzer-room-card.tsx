"use client";

import type { ReactNode } from "react";
import {
  defaultEleDedicated,
  defaultEleLowVoltage,
  type EleDedicatedInput,
  type EleLowVoltageInput,
  type ElectricalRoomInput,
  type EleRoomType,
} from "@/lib/electrical-analyzer-engine";

const ROOM_TYPES: { value: EleRoomType; label: string }[] = [
  { value: "living_room", label: "Living room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "dining_room", label: "Dining room" },
  { value: "office", label: "Office" },
  { value: "garage", label: "Garage" },
  { value: "basement", label: "Basement" },
  { value: "utility_room", label: "Utility room" },
  { value: "laundry", label: "Laundry" },
  { value: "hallway", label: "Hallway" },
  { value: "mechanical", label: "Mechanical" },
  { value: "panel_room", label: "Panel room" },
  { value: "outdoor", label: "Outdoor" },
  { value: "other", label: "Other" },
];

function num(
  v: string,
  min = 0,
  max = 999,
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function ElectricalRoomCard({
  room,
  sel,
  onPatch,
  onDedicated,
  onLowV,
  onDup,
  onRemove,
}: {
  room: ElectricalRoomInput;
  sel: string;
  onPatch: (p: Partial<ElectricalRoomInput>) => void;
  onDedicated: (p: Partial<EleDedicatedInput>) => void;
  onLowV: (p: Partial<EleLowVoltageInput>) => void;
  onDup: () => void;
  onRemove: () => void;
}) {
  const d = room.dedicated ?? defaultEleDedicated();
  const lv = room.lowVoltage ?? defaultEleLowVoltage();

  const sub = (title: string, children: ReactNode) => (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#E8C84A]/90">
        {title}
      </p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/15 bg-[#0a1628]/80 p-4 shadow-inner shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm sm:col-span-2">
            <span className="text-white/70">Room name</span>
            <input
              value={room.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Floor</span>
            <input
              type="number"
              min={0}
              max={20}
              value={room.floor}
              onChange={(e) => onPatch({ floor: num(e.target.value, 0, 20) })}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Room type</span>
            <select
              value={room.roomType}
              onChange={(e) =>
                onPatch({ roomType: e.target.value as EleRoomType })
              }
              className={sel}
            >
              {ROOM_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Length (ft)</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={room.lengthFt}
              onChange={(e) =>
                onPatch({ lengthFt: Math.max(1, Number(e.target.value) || 1) })
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Width (ft)</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={room.widthFt}
              onChange={(e) =>
                onPatch({ widthFt: Math.max(1, Number(e.target.value) || 1) })
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-white/70">Ceiling height</span>
            <select
              value={room.ceiling}
              onChange={(e) =>
                onPatch({
                  ceiling: e.target.value as ElectricalRoomInput["ceiling"],
                })
              }
              className={sel}
            >
              <option value="8">8&apos;</option>
              <option value="9">9&apos;</option>
              <option value="10">10&apos;</option>
              <option value="12">12&apos;</option>
              <option value="14">14&apos;</option>
              <option value="higher">Higher</option>
            </select>
          </label>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onDup}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/85 hover:border-[#E8C84A]/50"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/40"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {sub(
          "Receptacles",
          <>
            {[
              ["rec15", "Standard 15A", room.rec15],
              ["rec20", "20A", room.rec20],
              ["recGfci", "GFCI", room.recGfci],
              ["recUsb", "USB", room.recUsb],
              ["recFloor", "Floor", room.recFloor],
              ["recOutdoor", "Outdoor / WP", room.recOutdoor],
            ].map(([key, label, val]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-white/70">{label}</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={val as number}
                  onChange={(e) =>
                    onPatch({ [key]: num(e.target.value, 0, 99) } as Partial<ElectricalRoomInput>)
                  }
                  className="w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-right text-white"
                />
              </label>
            ))}
            <label className="block text-sm">
              <span className="text-white/70">AFCI protection required</span>
              <select
                value={room.afciRequired}
                onChange={(e) =>
                  onPatch({
                    afciRequired: e.target.value as ElectricalRoomInput["afciRequired"],
                  })
                }
                className={sel}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </>,
        )}
        {sub(
          "Lighting",
          <>
            {[
              ["recessed", "Recessed", room.recessed],
              ["surfaceMount", "Surface mount", room.surfaceMount],
              ["dimmers", "Dimmers", room.dimmers],
              ["threeWay", "3-way switches", room.threeWay],
              ["occupancySensors", "Occupancy sensors", room.occupancySensors],
            ].map(([key, label, val]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-white/70">{label}</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={val as number}
                  onChange={(e) =>
                    onPatch({ [key]: num(e.target.value, 0, 99) } as Partial<ElectricalRoomInput>)
                  }
                  className="w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-right text-white"
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={room.underCabinet}
                onChange={(e) => onPatch({ underCabinet: e.target.checked })}
                className="rounded border-white/30"
              />
              Under-cabinet lighting
            </label>
          </>,
        )}
        {sub(
          "Dedicated circuits",
          <>
            {(
              [
                ["refrigerator", "Refrigerator (20A)", d.refrigerator],
                ["dishwasher", "Dishwasher (20A)", d.dishwasher],
                ["microwave", "Microwave (20A)", d.microwave],
                ["disposal", "Disposal (20A)", d.disposal],
                ["rangeOven", "Range / oven (50A)", d.rangeOven],
                ["dryer", "Dryer (30A)", d.dryer],
                ["washer", "Washer (20A)", d.washer],
                ["evLevel1", "EV Level 1 (20A)", d.evLevel1],
                ["evLevel2", "EV Level 2 (50A)", d.evLevel2],
                ["generatorTransfer", "Generator transfer", d.generatorTransfer],
              ] as const
            ).map(([k, label, checked]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onDedicated({ [k]: e.target.checked } as Partial<EleDedicatedInput>)}
                  className="rounded border-white/30"
                />
                {label}
              </label>
            ))}
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-white/70">AC / heat pump (tons, 0 = none)</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={d.acHeatPumpTons}
                onChange={(e) =>
                  onDedicated({ acHeatPumpTons: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-24 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-right text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Hot tub / spa</span>
              <select
                value={d.hotTub}
                onChange={(e) =>
                  onDedicated({
                    hotTub: e.target.value as EleDedicatedInput["hotTub"],
                  })
                }
                className={sel}
              >
                <option value="none">None</option>
                <option value="50">50A</option>
                <option value="60">60A</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Pool pump</span>
              <select
                value={d.poolPump}
                onChange={(e) =>
                  onDedicated({
                    poolPump: e.target.value as EleDedicatedInput["poolPump"],
                  })
                }
                className={sel}
              >
                <option value="none">None</option>
                <option value="20">20A</option>
                <option value="30">30A</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-white/70">Custom dedicated (count × ~20A)</span>
              <input
                type="number"
                min={0}
                max={20}
                value={d.customDedicatedCount}
                onChange={(e) =>
                  onDedicated({
                    customDedicatedCount: num(e.target.value, 0, 20),
                  })
                }
                className="w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-right text-white"
              />
            </label>
          </>,
        )}
        {sub(
          "Low voltage",
          <>
            {(
              [
                ["coax", "Cable TV / coax", lv.coax],
                ["phone", "Phone", lv.phone],
                ["doorbell", "Doorbell", lv.doorbell],
                ["thermostatWire", "Thermostat wire", lv.thermostatWire],
                ["speakerWire", "Speaker wire (→ AV analyzer)", lv.speakerWire],
                ["securitySensor", "Security sensor", lv.securitySensor],
              ] as const
            ).map(([k, label, checked]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onLowV({ [k]: e.target.checked } as Partial<EleLowVoltageInput>)}
                  className="rounded border-white/30"
                />
                {label}
              </label>
            ))}
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-white/70">Data / ethernet drops</span>
              <input
                type="number"
                min={0}
                max={48}
                value={lv.ethernetDrops}
                onChange={(e) =>
                  onLowV({ ethernetDrops: num(e.target.value, 0, 48) })
                }
                className="w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-right text-white"
              />
            </label>
          </>,
        )}
      </div>
    </div>
  );
}
