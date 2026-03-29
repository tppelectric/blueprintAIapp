import { Suspense } from "react";
import type { Metadata } from "next";
import { InventoryToolsClient } from "@/components/inventory-tools-client";

export const metadata: Metadata = {
  title: "Tool Inventory",
  description: "All tools and equipment with location and assignment tracking.",
};

export default function InventoryToolsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#060d1a] text-sm text-white/50">
          Loading tools…
        </div>
      }
    >
      <InventoryToolsClient />
    </Suspense>
  );
}
