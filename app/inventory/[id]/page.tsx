import { Suspense } from "react";
import type { Metadata } from "next";
import { InventoryAssetDetailClient } from "@/components/inventory-asset-detail-client";

export const metadata: Metadata = {
  title: "Asset",
  description: "Asset details, location, and checkout history.",
};

function AssetDetailFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d1a] text-sm text-white/50">
      Loading asset…
    </div>
  );
}

export default function InventoryAssetDetailPage() {
  return (
    <Suspense fallback={<AssetDetailFallback />}>
      <InventoryAssetDetailClient />
    </Suspense>
  );
}
