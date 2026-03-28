import { Suspense } from "react";
import type { Metadata } from "next";
import { InventoryVehicleDetailClient } from "@/components/inventory-vehicle-detail-client";

export const metadata: Metadata = {
  title: "Vehicle",
  description: "Vehicle details, maintenance, and documents.",
};

function VehicleDetailFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d1a] text-sm text-white/50">
      Loading vehicle…
    </div>
  );
}

export default function InventoryVehicleDetailPage() {
  return (
    <Suspense fallback={<VehicleDetailFallback />}>
      <InventoryVehicleDetailClient />
    </Suspense>
  );
}
