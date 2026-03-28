"use client";

import Link from "next/link";

const cardBase =
  "flex flex-col rounded-xl border border-white/12 bg-white/[0.04] p-4 text-left transition-colors hover:border-violet-400/35 hover:bg-white/[0.07]";

type Props = {
  onToolsEquipment: () => void;
  onMaterials: () => void;
  onLocations: () => void;
};

export function InventoryHubCards({
  onToolsEquipment,
  onMaterials,
  onLocations,
}: Props) {
  return (
    <section
      className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      aria-label="Inventory areas"
    >
      <button
        type="button"
        className={`${cardBase} items-start`}
        onClick={onToolsEquipment}
      >
        <span className="text-2xl" aria-hidden>
          🔧
        </span>
        <span className="mt-2 text-sm font-semibold text-white">
          Tools &amp; equipment
        </span>
        <span className="mt-1 text-xs text-white/55">
          Assets, checkout, and repairs
        </span>
      </button>
      <Link href="/inventory/vehicles" className={cardBase}>
        <span className="text-2xl" aria-hidden>
          🚛
        </span>
        <span className="mt-2 text-sm font-semibold text-white">
          Fleet vehicles
        </span>
        <span className="mt-1 text-xs text-white/55">
          Registration, service, recalls
        </span>
      </Link>
      <button
        type="button"
        className={`${cardBase} items-start`}
        onClick={onMaterials}
      >
        <span className="text-2xl" aria-hidden>
          📦
        </span>
        <span className="mt-2 text-sm font-semibold text-white">
          Materials
        </span>
        <span className="mt-1 text-xs text-white/55">
          Stock levels and usage
        </span>
      </button>
      <Link href="/inventory/scan" className={cardBase}>
        <span className="text-2xl" aria-hidden>
          📱
        </span>
        <span className="mt-2 text-sm font-semibold text-white">
          QR scanner
        </span>
        <span className="mt-1 text-xs text-white/55">
          Scan tags in the field
        </span>
      </Link>
      <button
        type="button"
        className={`${cardBase} items-start sm:col-span-2 lg:col-span-1 xl:col-span-1`}
        onClick={onLocations}
      >
        <span className="text-2xl" aria-hidden>
          📍
        </span>
        <span className="mt-2 text-sm font-semibold text-white">
          Locations
        </span>
        <span className="mt-1 text-xs text-white/55">
          Warehouses, trucks, job sites
        </span>
      </button>
    </section>
  );
}
