import { Suspense } from "react";
import type { Metadata } from "next";
import { InventoryDashboardClient } from "@/components/inventory-dashboard-client";

export const metadata: Metadata = {
  title: "Inventory",
  description:
    "Track tools, materials, and equipment with locations and QR codes.",
};

function InventoryFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d1a] text-sm text-white/50">
      Loading inventory…
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryFallback />}>
      <InventoryDashboardClient />
    </Suspense>
  );
}
