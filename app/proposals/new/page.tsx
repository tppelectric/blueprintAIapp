import type { Metadata } from "next";
import { Suspense } from "react";
import { ProposalsNewClient } from "@/components/proposals-new-client";

export const metadata: Metadata = {
  title: "New proposal",
  description: "Create or draft a client proposal.",
};

export default function ProposalsNewPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-shell p-8 text-sm text-white/60">Loading…</div>
      }
    >
      <ProposalsNewClient />
    </Suspense>
  );
}
