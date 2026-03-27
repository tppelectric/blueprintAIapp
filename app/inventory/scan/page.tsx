import { Suspense } from "react";
import type { Metadata } from "next";
import { InventoryScanClient } from "@/components/inventory-scan-client";

export const metadata: Metadata = {
  title: "Scan inventory QR",
  description: "Scan QR codes to check tools and materials in or out.",
};

function ScanFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d1a] text-sm text-white/50">
      Loading scanner…
    </div>
  );
}

export default function InventoryScanPage() {
  return (
    <Suspense fallback={<ScanFallback />}>
      <InventoryScanClient />
    </Suspense>
  );
}
